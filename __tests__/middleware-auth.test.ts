/**
 * Tests for middleware.ts — auth-guard behaviour.
 * Uses NextRequest from next/server (constructable in Node tests via next/server mock).
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
    DEMO_AUTH_COOKIE_DAYS: '7',
    NODE_ENV: 'test',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeReq(path: string, cookieValue?: string): NextRequest {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = {};
  if (cookieValue) {
    headers['cookie'] = `demo_auth=${cookieValue}`;
  }
  return new NextRequest(url, { headers });
}

async function runMiddleware(req: NextRequest) {
  const { middleware } = await import('../middleware');
  return middleware(req);
}

async function makeValidCookie(): Promise<string> {
  const { signAuthCookie } = await import('../lib/auth/cookie');
  return signAuthCookie('admin', 'test-secret-key-that-is-long-enough!', 7);
}

describe('middleware auth guard', () => {
  describe('bypass paths (no auth required)', () => {
    const bypassPaths = [
      '/',
      '/login',
      '/api/auth/login',
      '/api/auth/logout',
      '/favicon.ico',
      '/api/admin/cron-heartbeat',
      '/api/admin/market/upload-csv',
      '/_next/static/chunks/main.js',
      '/_next/image?url=x',
      '/api/whatsapp/webhook',
      '/api/integrations/pipedrive/webhook',
      '/api/whatsapp/ingest',
      '/api/admin/knowledge/refresh',
      '/api/admin/knowledge-status',
      '/sitemap.xml',
      '/robots.txt',
      '/design',
      '/api/market/baltic-kpi',
      '/api/market/bunker-kpi',
      '/api/market/benchmark',
      '/about',
      '/pricing',
    ];

    for (const path of bypassPaths) {
      it(`bypasses auth for ${path}`, async () => {
        const req = makeReq(path);
        const res = await runMiddleware(req);
        // Should NOT redirect to /login
        expect(res.status).not.toBe(302);
        // Allow 200 (next()) or non-redirect
        const location = res.headers.get('location');
        if (location) {
          expect(location).not.toContain('/login');
        }
      });
    }
  });

  describe('page routes without auth cookie redirect to /login', () => {
    // Regression: /more (#417) and /upgrade (#418) must not 404 — auth guard redirects to /login
    // Note: '/' is excluded — it is now in AUTH_BYPASS_PATHS (public landing for anon users)
    const pagePaths = ['/dashboard', '/matches', '/market', '/more', '/upgrade'];

    for (const path of pagePaths) {
      it(`redirects to /login for ${path} without cookie`, async () => {
        const req = makeReq(path);
        const res = await runMiddleware(req);
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toContain('/login');
      });
    }
  });

  describe('API routes without auth cookie return 401 JSON', () => {
    const apiPaths = ['/api/ai/match', '/api/emails/parse', '/api/matches', '/api/vessels'];

    for (const path of apiPaths) {
      it(`returns 401 JSON for ${path} without cookie`, async () => {
        const req = makeReq(path);
        const res = await runMiddleware(req);
        expect(res.status).toBe(401);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json();
        expect(body).toEqual({ error: 'Unauthorized' });
      });
    }
  });

  describe('protected routes with valid auth cookie', () => {
    it('passes through / with valid cookie — redirect to /dashboard handled by app/page.tsx (#560)', async () => {
      const cookie = await makeValidCookie();
      const req = makeReq('/', cookie);
      const res = await runMiddleware(req);
      // middleware bypasses '/' entirely; app/page.tsx performs the /dashboard redirect
      expect(res.status).not.toBe(302);
    });

    it('passes through /api/ai/match with valid cookie (CSRF check will follow)', async () => {
      const cookie = await makeValidCookie();
      // For non-csrf routes like GET, should just pass auth
      const req = makeReq('/dashboard', cookie);
      const res = await runMiddleware(req);
      expect(res.status).not.toBe(302);
    });

    it('passes through /matches with valid cookie (session_id check is page-level)', async () => {
      const cookie = await makeValidCookie();
      const req = makeReq('/matches', cookie);
      const res = await runMiddleware(req);
      expect(res.status).not.toBe(302);
    });
  });

  describe('acceptance criteria for #559 and #560', () => {
    it('#559 — GET /matches without auth cookie redirects to /login (NOT /)', async () => {
      const req = makeReq('/matches');
      const res = await runMiddleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/login');
      expect(location).not.toBe('http://localhost/');
    });

    it('#560 — GET / with valid session passes through middleware (app/page.tsx redirects to /dashboard)', async () => {
      const cookie = await makeValidCookie();
      const req = makeReq('/', cookie);
      const res = await runMiddleware(req);
      // '/' is bypassed — middleware does not redirect; app/page.tsx does redirect('/dashboard')
      expect(res.status).not.toBe(302);
      const location = res.headers.get('location') ?? '';
      expect(location).not.toContain('/login');
    });
  });

  describe('login rate-limiter (M-1)', () => {
    it('returns 429 after 10 POST /api/auth/login from the same IP within the window', async () => {
      const makeLoginReq = () =>
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'x-forwarded-for': '1.2.3.4' },
        });

      // First 10 attempts must pass through (not throttled)
      for (let i = 0; i < 10; i++) {
        const res = await runMiddleware(makeLoginReq());
        expect(res.status).not.toBe(429);
      }

      // 11th attempt from same IP must be rate-limited
      const res = await runMiddleware(makeLoginReq());
      expect(res.status).toBe(429);
    });

    it('does NOT throttle GET /api/auth/login (only POST)', async () => {
      const makeGetReq = () =>
        new NextRequest('http://localhost/api/auth/login', {
          method: 'GET',
          headers: { 'x-forwarded-for': '5.6.7.8' },
        });

      for (let i = 0; i < 15; i++) {
        const res = await runMiddleware(makeGetReq());
        expect(res.status).not.toBe(429);
      }
    });

    it('tracks IPs independently — different IP is not blocked when another is', async () => {
      const makeReqFromIp = (ip: string) =>
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'x-forwarded-for': ip },
        });

      // Exhaust limit for IP A
      for (let i = 0; i < 10; i++) {
        await runMiddleware(makeReqFromIp('10.0.0.1'));
      }
      const blockedRes = await runMiddleware(makeReqFromIp('10.0.0.1'));
      expect(blockedRes.status).toBe(429);

      // IP B should still be allowed
      const otherRes = await runMiddleware(makeReqFromIp('10.0.0.2'));
      expect(otherRes.status).not.toBe(429);
    });

    it('XFF spoofing — rotating leftmost hop does NOT bypass the limit; rightmost (Caddy-appended) IP is trusted', async () => {
      // Behind Caddy reverse_proxy the real client IP is APPENDED as the
      // rightmost X-Forwarded-For entry. The leftmost is client-controlled and
      // can be rotated arbitrarily. The limiter must key on the rightmost hop.
      const REAL_IP = '203.0.113.7';
      const makeSpoofedReq = (spoofedLeftHop: string) =>
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'x-forwarded-for': `${spoofedLeftHop}, ${REAL_IP}` },
        });

      // 10 requests, each rotating the leftmost (claimed) IP, same rightmost real IP.
      // With the buggy leftmost-keyed limiter, every request looks like a new IP
      // and never throttles. With the rightmost-hop fix, all 10 share the same
      // key and the 11th request — even with yet another fresh leftmost — is 429.
      for (let i = 0; i < 10; i++) {
        const res = await runMiddleware(makeSpoofedReq(`198.51.100.${i}`));
        expect(res.status).not.toBe(429);
      }

      const blockedRes = await runMiddleware(makeSpoofedReq('192.0.2.99'));
      expect(blockedRes.status).toBe(429);
    });
  });

  describe('DEMO_AUTH_ENABLED=false', () => {
    it('bypasses auth entirely when disabled', async () => {
      process.env.DEMO_AUTH_ENABLED = 'false';
      const req = makeReq('/');
      const res = await runMiddleware(req);
      // Should NOT redirect to login even without cookie
      expect(res.status).not.toBe(302);
      const location = res.headers.get('location');
      if (location) {
        expect(location).not.toContain('/login');
      }
    });
  });

  describe('DEMO_AUTH_ENABLED=true with missing secret', () => {
    it('returns 500 when secret is missing on protected route', async () => {
      process.env.DEMO_AUTH_ENABLED = 'true';
      delete process.env.DEMO_AUTH_SECRET;
      const req = makeReq('/dashboard');
      const res = await runMiddleware(req);
      expect(res.status).toBe(500);
    });
  });

  describe('tampered / invalid cookie', () => {
    it('redirects to /login for tampered cookie on protected route', async () => {
      const req = makeReq('/dashboard', 'tampered.invalidsig');
      const res = await runMiddleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login');
    });
  });

  describe('x-pathname header on passthrough', () => {
    it('sets x-pathname on /login bypass passthrough', async () => {
      const req = makeReq('/login');
      const res = await runMiddleware(req);
      expect(res.status).not.toBe(302);
      expect(res.headers.get('x-pathname')).toBe('/login');
    });

    it('sets x-pathname on authenticated page passthrough', async () => {
      const cookie = await makeValidCookie();
      const req = makeReq('/dashboard', cookie);
      const res = await runMiddleware(req);
      expect(res.status).not.toBe(302);
      expect(res.headers.get('x-pathname')).toBe('/dashboard');
    });
  });

  describe('/processing guard — csrf_token required', () => {
    it('redirects demo_auth user to / when no csrf_token cookie', async () => {
      const cookie = await makeValidCookie();
      const req = makeReq('/processing', cookie);
      const res = await runMiddleware(req);
      expect(res.status).toBe(302);
      const location = res.headers.get('location') ?? '';
      expect(location).toBe('http://localhost/');
    });

    it('passes /processing when demo_auth and csrf_token are both present', async () => {
      const cookie = await makeValidCookie();
      const csrfToken = 'a'.repeat(64);
      const req = new NextRequest('http://localhost/processing', {
        headers: { cookie: `demo_auth=${cookie}; csrf_token=${csrfToken}` },
      });
      const res = await runMiddleware(req);
      expect(res.status).not.toBe(302);
      expect(res.status).not.toBe(403);
    });
  });
});
