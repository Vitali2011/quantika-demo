/**
 * Behavioral tests for POST /api/auth/logout — verifies both cookies are cleared.
 * Regression: #507 demo_auth was not cleared (missing Secure attribute in production).
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

async function callLogout(cookies: Record<string, string> = {}) {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const req = new NextRequest('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  const { POST } = await import('../app/api/auth/logout/route');
  return POST(req);
}

describe('POST /api/auth/logout', () => {
  it('redirects to /login', async () => {
    const res = await callLogout();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('clears demo_auth cookie with Max-Age=0', async () => {
    const res = await callLogout({ demo_auth: 'some-signed-token' });
    const setCookies = res.headers.getSetCookie?.() ?? res.headers.get('set-cookie')?.split(',') ?? [];
    const demoAuthClear = setCookies.find(c => c.startsWith('demo_auth='));
    expect(demoAuthClear).toBeDefined();
    expect(demoAuthClear).toMatch(/Max-Age=0/i);
    expect(demoAuthClear).toMatch(/HttpOnly/i);
    expect(demoAuthClear).toMatch(/SameSite=Lax/i);
  });

  it('clears session_id cookie with Max-Age=0', async () => {
    const res = await callLogout({ session_id: 'abc123', demo_auth: 'some-signed-token' });
    const setCookies = res.headers.getSetCookie?.() ?? res.headers.get('set-cookie')?.split(',') ?? [];
    const sessionClear = setCookies.find(c => c.startsWith('session_id='));
    expect(sessionClear).toBeDefined();
    expect(sessionClear).toMatch(/Max-Age=0/i);
  });

  it('adds Secure flag to demo_auth clearing cookie in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = await callLogout({ demo_auth: 'some-signed-token' });
    const setCookies = res.headers.getSetCookie?.() ?? res.headers.get('set-cookie')?.split(',') ?? [];
    const demoAuthClear = setCookies.find(c => c.startsWith('demo_auth='));
    expect(demoAuthClear).toMatch(/Secure/i);
  });

  it('omits Secure flag in non-production', async () => {
    process.env.NODE_ENV = 'test';
    const res = await callLogout({ demo_auth: 'some-signed-token' });
    const setCookies = res.headers.getSetCookie?.() ?? res.headers.get('set-cookie')?.split(',') ?? [];
    const demoAuthClear = setCookies.find(c => c.startsWith('demo_auth='));
    expect(demoAuthClear).not.toMatch(/Secure/i);
  });
});
