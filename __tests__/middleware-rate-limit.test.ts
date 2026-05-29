/**
 * U1 / #651 — brute-force throttle tests for middleware.ts.
 *
 * M-1: POST /api/auth/login must 429 after N attempts per IP.
 * L-3: /api/admin/* must 429 after N attempts per IP (limits credential guessing
 *      against the X-Admin-Token shared secret).
 *
 * These invoke the real middleware handler (not string-matching source).
 */

import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

import { NextRequest } from 'next/server';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    // Disable the auth guard so we isolate the rate-limit behaviour.
    DEMO_AUTH_ENABLED: 'false',
    NODE_ENV: 'test',
    // BUG-1: rateLimitKey() now derives the client key from a TRUSTED source.
    // These tests use an honest single-IP X-Forwarded-For, so trust one appending
    // hop (Caddy) — with N=1 the trusted-offset is index 0 = that single IP, which
    // exercises the limiter exactly as before (this is setup, not weakening).
    RATE_LIMIT_CLIENT_IP_SOURCE: 'xff-trusted',
    TRUSTED_PROXY_COUNT: '1',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

async function runMiddleware(req: NextRequest) {
  const { middleware } = await import('../middleware');
  return middleware(req);
}

function loginReq(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
  });
}

function adminReq(ip: string, path = '/api/admin/knowledge/refresh'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
  });
}

describe('M-1 — POST /api/auth/login brute-force throttle', () => {
  it('429s after the 6th attempt from the same IP within the window', async () => {
    const ip = '203.0.113.10';
    // loginRateLimiter is 5 requests / 60s. First 5 pass through.
    for (let i = 0; i < 5; i++) {
      const res = await runMiddleware(loginReq(ip));
      expect(res.status).not.toBe(429);
    }
    const blocked = await runMiddleware(loginReq(ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    const body = await blocked.json();
    expect(body).toEqual({ error: 'Too many requests' });
  });

  it('counts attempts per-IP (a different IP is not throttled)', async () => {
    const attacker = '203.0.113.20';
    for (let i = 0; i < 6; i++) {
      await runMiddleware(loginReq(attacker));
    }
    const attackerBlocked = await runMiddleware(loginReq(attacker));
    expect(attackerBlocked.status).toBe(429);

    // Fresh IP must still be served.
    const victim = await runMiddleware(loginReq('198.51.100.99'));
    expect(victim.status).not.toBe(429);
  });

  it('does not throttle non-POST requests to the login path', async () => {
    const ip = '203.0.113.30';
    for (let i = 0; i < 10; i++) {
      const res = await runMiddleware(
        new NextRequest('http://localhost/api/auth/login', {
          method: 'GET',
          headers: { 'x-forwarded-for': ip },
        }),
      );
      expect(res.status).not.toBe(429);
    }
  });
});

describe('L-3 — /api/admin/* brute-force throttle', () => {
  it('429s after the 11th admin attempt from the same IP within the window', async () => {
    const ip = '203.0.113.40';
    // adminRateLimiter is 10 requests / 60s.
    for (let i = 0; i < 10; i++) {
      const res = await runMiddleware(adminReq(ip));
      expect(res.status).not.toBe(429);
    }
    const blocked = await runMiddleware(adminReq(ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('throttle is keyed per-IP for admin routes', async () => {
    const attacker = '203.0.113.50';
    for (let i = 0; i < 11; i++) {
      await runMiddleware(adminReq(attacker));
    }
    expect((await runMiddleware(adminReq(attacker))).status).toBe(429);
    expect((await runMiddleware(adminReq('198.51.100.7'))).status).not.toBe(429);
  });
});
