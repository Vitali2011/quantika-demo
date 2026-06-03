/**
 * Behavioral tests — middleware re-hydrates demo session when session_id absent.
 *
 * Root cause of #790: SESSION_TTL_MS=1h but demo_auth cookie lives 30d.
 * After 1h the session_id cookie (Max-Age=3600) expires; demo_auth is still valid.
 * Middleware must detect the gap and redirect to /api/demo/rehydrate so the
 * Server Component page gets a fresh session_id cookie before rendering.
 *
 * PI2-compliant: tests run middleware(req) — a real function call, not string-match.
 */

import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

import { NextRequest } from 'next/server';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    DEMO_AUTH_ENABLED: 'true',
    DEMO_AUTH_USER: 'admin',
    DEMO_AUTH_PASSWORD: 'secret',
    DEMO_AUTH_SECRET: 'test-secret-key-that-is-long-enough!',
    DEMO_AUTH_COOKIE_DAYS: '30',
    DEMO_MODE: 'true',
    NODE_ENV: 'test',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeReq(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `http://localhost${path}`;
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest(url, { headers });
}

async function runMiddleware(req: NextRequest) {
  const { middleware } = await import('../middleware');
  return middleware(req);
}

async function makeValidDemoAuthCookie(): Promise<string> {
  const { signAuthCookie } = await import('../lib/auth/cookie');
  return signAuthCookie('admin', 'test-secret-key-that-is-long-enough!', 30);
}

describe('middleware demo session re-hydration (#790)', () => {
  describe('DEMO_MODE=true, valid demo_auth, session_id absent', () => {
    it('redirects /matches to /api/demo/rehydrate with next param', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const req = makeReq('/matches', { demo_auth: demoAuth });
      const res = await runMiddleware(req);

      expect(res.status).toBe(302);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/api/demo/rehydrate');
      expect(location).toContain('next=');
      expect(decodeURIComponent(location)).toContain('/matches');
    });

    it('redirects /dashboard to /api/demo/rehydrate', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const req = makeReq('/dashboard', { demo_auth: demoAuth });
      const res = await runMiddleware(req);

      expect(res.status).toBe(302);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/api/demo/rehydrate');
    });
  });

  describe('no re-hydrate redirect when session_id is present', () => {
    it('passes through /matches when session_id cookie is present (session check is page-level)', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const req = makeReq('/matches', { demo_auth: demoAuth, session_id: 'some-session-id' });
      const res = await runMiddleware(req);

      // Should not redirect to rehydrate
      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('/api/demo/rehydrate');
    });
  });

  describe('API routes are not redirected to rehydrate', () => {
    it('API route with no session_id passes through (not redirected)', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const req = makeReq('/api/matches', { demo_auth: demoAuth });
      const res = await runMiddleware(req);

      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('/api/demo/rehydrate');
    });
  });

  describe('DEMO_MODE disabled — OAuth path unaffected', () => {
    it('no re-hydrate redirect when DEMO_MODE is not set', async () => {
      process.env.DEMO_MODE = '';
      const demoAuth = await makeValidDemoAuthCookie();
      const req = makeReq('/matches', { demo_auth: demoAuth });
      const res = await runMiddleware(req);

      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('/api/demo/rehydrate');
    });
  });

  describe('/api/demo/rehydrate is in AUTH_BYPASS_PATHS (no redirect loop)', () => {
    it('rehydrate endpoint itself is not caught by auth guard redirect', async () => {
      const req = makeReq('/api/demo/rehydrate');
      const res = await runMiddleware(req);

      // Must NOT redirect to /login (it's bypassed)
      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('/login');
      // Must NOT cause a 302 to /login — redirect loop prevention
      if (res.status === 302) {
        expect(location).not.toContain('/login');
      }
    });
  });
});
