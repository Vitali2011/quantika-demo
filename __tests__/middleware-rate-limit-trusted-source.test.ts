/**
 * BUG-1 (HIGH) — middleware rateLimitKey() must derive the client key from a
 * TRUSTED source, not the left-most X-Forwarded-For token (which any client can
 * set freely and rotate per request to defeat loginRateLimiter / adminRateLimiter).
 *
 * PROD TOPOLOGY: Cloudflare → Caddy → Next. Cloudflare OVERWRITES CF-Connecting-IP
 * with the true client IP; Caddy APPENDS to X-Forwarded-For, so the LEFT-most XFF
 * token is attacker-controlled and the RIGHT-most N tokens are appended by trusted
 * hops. These probes invoke the REAL middleware handler.
 */

import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

import { NextRequest } from 'next/server';

const ORIGINAL_ENV = process.env;

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function setEnv(extra: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    DEMO_AUTH_ENABLED: 'false', // isolate rate-limit behaviour from the auth guard
    NODE_ENV: 'test',
    // start from a clean slate for the IP-source plumbing
    RATE_LIMIT_CLIENT_IP_SOURCE: undefined,
    TRUSTED_PROXY_COUNT: undefined,
    ...extra,
  };
}

async function runMiddleware(req: NextRequest) {
  const { middleware } = await import('../middleware');
  return middleware(req);
}

/** POST /api/auth/login carrying the given headers. */
function loginReq(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// loginRateLimiter: 5 / 60s → the 6th request from the same key trips (429).
const LOGIN_CAP = 5;

describe('BUG-1 — xff-trusted mode: trusted-offset IP, not left-most XFF', () => {
  beforeEach(() => setEnv({ RATE_LIMIT_CLIENT_IP_SOURCE: 'xff-trusted', TRUSTED_PROXY_COUNT: '1' }));

  it('(a) STILL trips when the attacker rotates the left-most XFF token', async () => {
    // Simulates prod: attacker sends a fresh "9.9.9.${i}" each request; the single
    // TRUSTED hop (Caddy) appends a stable IP on the RIGHT. With N=1 the key is the
    // right-most (trusted) token, which is stable → the throttle accumulates.
    const TRUSTED = '203.0.113.7';
    for (let i = 0; i < LOGIN_CAP; i++) {
      const res = await runMiddleware(loginReq({ 'x-forwarded-for': `9.9.9.${i}, ${TRUSTED}` }));
      expect(res.status).not.toBe(429);
    }
    const blocked = await runMiddleware(loginReq({ 'x-forwarded-for': `9.9.9.99, ${TRUSTED}` }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('(c) two genuinely distinct trusted IPs are bucketed separately', async () => {
    const A = '203.0.113.20';
    const B = '198.51.100.30';
    // Drive trusted IP A to its cap (rotating left token each time).
    for (let i = 0; i < LOGIN_CAP; i++) {
      await runMiddleware(loginReq({ 'x-forwarded-for': `9.9.9.${i}, ${A}` }));
    }
    // A is now over the cap → 429.
    expect((await runMiddleware(loginReq({ 'x-forwarded-for': `9.9.9.77, ${A}` }))).status).toBe(429);
    // B is a distinct trusted IP, under its own cap → still served.
    expect((await runMiddleware(loginReq({ 'x-forwarded-for': `8.8.8.1, ${B}` }))).status).not.toBe(429);
  });

  it('fails closed to a shared bucket when the XFF list is shorter than N', async () => {
    setEnv({ RATE_LIMIT_CLIENT_IP_SOURCE: 'xff-trusted', TRUSTED_PROXY_COUNT: '2' });
    // Only one token but N=2 → cannot identify a trusted hop → shared bucket.
    // Rotating the single token must NOT reset the throttle.
    for (let i = 0; i < LOGIN_CAP; i++) {
      await runMiddleware(loginReq({ 'x-forwarded-for': `7.7.7.${i}` }));
    }
    expect((await runMiddleware(loginReq({ 'x-forwarded-for': '7.7.7.88' }))).status).toBe(429);
  });
});

describe('BUG-1 — cf mode: trust CF-Connecting-IP, ignore client XFF', () => {
  beforeEach(() => setEnv({ RATE_LIMIT_CLIENT_IP_SOURCE: 'cf' }));

  it('(b) STILL trips with a fixed CF-Connecting-IP while XFF rotates', async () => {
    // In prod CF OVERWRITES CF-Connecting-IP, so the client cannot rotate it.
    const CF = '203.0.113.55';
    for (let i = 0; i < LOGIN_CAP; i++) {
      const res = await runMiddleware(
        loginReq({ 'cf-connecting-ip': CF, 'x-forwarded-for': `9.9.9.${i}` }),
      );
      expect(res.status).not.toBe(429);
    }
    expect(
      (await runMiddleware(loginReq({ 'cf-connecting-ip': CF, 'x-forwarded-for': '9.9.9.42' }))).status,
    ).toBe(429);
  });

  it('fails closed to a shared bucket when CF-Connecting-IP is absent', async () => {
    // No CF header → never trust the spoofable XFF. Rotating XFF must still trip.
    for (let i = 0; i < LOGIN_CAP; i++) {
      await runMiddleware(loginReq({ 'x-forwarded-for': `9.9.9.${i}` }));
    }
    expect((await runMiddleware(loginReq({ 'x-forwarded-for': '9.9.9.123' }))).status).toBe(429);
  });
});

describe('BUG-1 — (d) source unset: fail-closed shared bucket', () => {
  beforeEach(() => setEnv({})); // RATE_LIMIT_CLIENT_IP_SOURCE unset

  it('throttles everyone together when no trusted source is configured', async () => {
    // No trusted source + no x-real-ip → shared bucket. Rotating XFF must not bypass.
    for (let i = 0; i < LOGIN_CAP; i++) {
      await runMiddleware(loginReq({ 'x-forwarded-for': `9.9.9.${i}` }));
    }
    expect((await runMiddleware(loginReq({ 'x-forwarded-for': '9.9.9.200' }))).status).toBe(429);
  });
});
