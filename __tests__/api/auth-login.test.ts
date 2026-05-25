/**
 * Tests for POST /api/auth/login
 *
 * Timing-safe credential check, redirect on success/failure.
 * Tests verify behavioral contract without touching the cookie-signing internals.
 */
import { NextRequest } from 'next/server';

describe('POST /api/auth/login', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...origEnv,
      DEMO_AUTH_USER: 'testuser',
      DEMO_AUTH_PASSWORD: 'testpass',
      DEMO_AUTH_SECRET: 'testsecret1234567890',
      DEMO_AUTH_COOKIE_DAYS: '7',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  function makeJsonReq(body: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function makeFormReq(body: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams(body).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  it('redirects to /login?error=1 on wrong password (JSON)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeJsonReq({ user: 'testuser', password: 'wrong' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/login\?error=1/);
  });

  it('redirects to /login?error=1 on wrong user (JSON)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeJsonReq({ user: 'wronguser', password: 'testpass' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/login\?error=1/);
  });

  it('redirects to /login?error=1 when password is empty', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeJsonReq({ user: 'testuser', password: '' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/login\?error=1/);
  });

  it('redirects to /dashboard and sets demo_auth cookie on correct credentials (JSON)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeJsonReq({ user: 'testuser', password: 'testpass' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/dashboard/);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('demo_auth=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('accepts form-encoded body and sets cookie on correct credentials', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeFormReq({ user: 'testuser', password: 'testpass' }));
    expect(res.status).toBe(303);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('demo_auth=');
  });

  it('redirects to /login?error=1 on form body with wrong creds', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeFormReq({ user: 'testuser', password: 'bad' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/login\?error=1/);
  });
});
