/**
 * Tests for app/api/auth/login/route.ts
 * POST /api/auth/login
 */

import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

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

async function getHandler() {
  const mod = await import('../login/route');
  return mod.POST;
}

function makeRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

describe('POST /api/auth/login', () => {
  it('redirects to / with Set-Cookie on valid credentials', async () => {
    const POST = await getHandler();
    const req = makeRequest({ user: 'admin', password: 'secret' });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/$/); // ends with /
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('demo_auth=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('redirects to /login?error=1 on wrong password', async () => {
    const POST = await getHandler();
    const req = makeRequest({ user: 'admin', password: 'wrongpassword' });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects to /login?error=1 on wrong user', async () => {
    const POST = await getHandler();
    const req = makeRequest({ user: 'hacker', password: 'secret' });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login?error=1');
  });

  it('redirects to /login?error=1 on missing password', async () => {
    const POST = await getHandler();
    const req = makeRequest({ user: 'admin' });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login?error=1');
  });
});
