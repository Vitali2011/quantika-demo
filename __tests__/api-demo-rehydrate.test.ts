/**
 * Behavioral tests for GET /api/demo/rehydrate — demo session re-hydration (#790).
 *
 * PI2-compliant: calls the actual route handler via import, not string-match.
 * Uses jest.mock to stub createSession / hydrateDemoSession (SQLite not available
 * in jest environment under SESSIONS_DB_PATH=':memory:' for this path).
 */

import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

import { NextRequest } from 'next/server';

const ORIGINAL_ENV = process.env;

// Mock heavy SQLite-dependent modules — the route handler imports them dynamically
jest.mock('@/lib/session', () => ({
  createSession: jest.fn().mockReturnValue('mock-session-id-abc'),
}));
jest.mock('@/lib/demo-mode/hydrate-demo-session', () => ({
  hydrateDemoSession: jest.fn(),
}));
jest.mock('@/lib/csrf', () => ({
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf-token-xyz'),
}));

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
  jest.clearAllMocks();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

async function makeValidDemoAuthCookie(): Promise<string> {
  const { signAuthCookie } = await import('../lib/auth/cookie');
  return signAuthCookie('admin', 'test-secret-key-that-is-long-enough!', 30);
}

async function callRehydrate(opts: {
  cookieDemoAuth?: string;
  next?: string;
  demoMode?: string;
}): Promise<Response> {
  const { demoMode = 'true', cookieDemoAuth, next } = opts;
  process.env.DEMO_MODE = demoMode;

  const url = new URL('http://localhost/api/demo/rehydrate');
  if (next) url.searchParams.set('next', next);

  const headers: Record<string, string> = {};
  if (cookieDemoAuth) headers['cookie'] = `demo_auth=${cookieDemoAuth}`;

  const req = new NextRequest(url.toString(), { headers });
  const { GET } = await import('../app/api/demo/rehydrate/route');
  return GET(req);
}

describe('GET /api/demo/rehydrate (#790)', () => {
  it('returns 404 when DEMO_MODE is not enabled', async () => {
    const res = await callRehydrate({ demoMode: '', next: '/matches' });
    expect(res.status).toBe(404);
  });

  it('redirects to /login when demo_auth cookie is absent', async () => {
    const res = await callRehydrate({ next: '/matches' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects to /login when demo_auth cookie is invalid', async () => {
    const res = await callRehydrate({ cookieDemoAuth: 'invalid-token', next: '/matches' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/login');
  });

  describe('valid demo_auth — creates session and redirects', () => {
    it('redirects to the next param path', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const res = await callRehydrate({ cookieDemoAuth: demoAuth, next: '/matches' });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/matches');
    });

    it('sets session_id cookie with correct path and HttpOnly', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const res = await callRehydrate({ cookieDemoAuth: demoAuth, next: '/dashboard' });

      const setCookies = res.headers.getSetCookie?.() ?? [];
      const sessionCookie = setCookies.find(c => c.startsWith('session_id='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/Path=\//i);
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Lax/i);
      // Max-Age should be 30 days (cookieDays=30)
      expect(sessionCookie).toMatch(/Max-Age=2592000/i);
    });

    it('sets csrf_token cookie', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const res = await callRehydrate({ cookieDemoAuth: demoAuth, next: '/dashboard' });

      const setCookies = res.headers.getSetCookie?.() ?? [];
      const csrfCookie = setCookies.find(c => c.startsWith('csrf_token='));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toMatch(/SameSite=Strict/i);
    });

    it('defaults to /dashboard when next param is absent', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const res = await callRehydrate({ cookieDemoAuth: demoAuth });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/dashboard');
    });

    it('rejects open redirect — non-relative next param falls back to /dashboard', async () => {
      const demoAuth = await makeValidDemoAuthCookie();
      const res = await callRehydrate({
        cookieDemoAuth: demoAuth,
        next: '//evil.example.com/steal',
      });

      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('evil.example.com');
      expect(location).toContain('/dashboard');
    });
  });
});
