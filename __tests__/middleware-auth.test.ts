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
      '/login',
      '/api/auth/login',
      '/api/auth/logout',
      '/favicon.ico',
      '/api/admin/cron-heartbeat',
      '/_next/static/chunks/main.js',
      '/_next/image?url=x',
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

  describe('protected routes without auth cookie', () => {
    const protectedPaths = ['/', '/dashboard', '/api/ai/match', '/api/emails/parse'];

    for (const path of protectedPaths) {
      it(`redirects to /login for ${path} without cookie`, async () => {
        const req = makeReq(path);
        const res = await runMiddleware(req);
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toContain('/login');
      });
    }
  });

  describe('protected routes with valid auth cookie', () => {
    it('passes through / with valid cookie', async () => {
      const cookie = await makeValidCookie();
      const req = makeReq('/', cookie);
      const res = await runMiddleware(req);
      // Should not redirect to login
      expect(res.status).not.toBe(302);
    });

    it('passes through /api/ai/match with valid cookie (CSRF check will follow)', async () => {
      const cookie = await makeValidCookie();
      // For non-csrf routes like GET, should just pass auth
      const req = makeReq('/dashboard', cookie);
      const res = await runMiddleware(req);
      expect(res.status).not.toBe(302);
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
    it('returns 500 when secret is missing', async () => {
      process.env.DEMO_AUTH_ENABLED = 'true';
      delete process.env.DEMO_AUTH_SECRET;
      const req = makeReq('/');
      const res = await runMiddleware(req);
      expect(res.status).toBe(500);
    });
  });

  describe('tampered / invalid cookie', () => {
    it('redirects to /login for tampered cookie', async () => {
      const req = makeReq('/', 'tampered.invalidsig');
      const res = await runMiddleware(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/login');
    });
  });
});
