/**
 * Regression test for #573: /matches shows empty state in demo
 *
 * In DEMO_MODE=true, POST /api/auth/login must auto-create a sample data
 * session and set the session_id cookie so /matches has data immediately.
 */
import { NextRequest } from 'next/server';

const DEMO_SESSION_ID = 'demo-sess-abc123';

describe('POST /api/auth/login — DEMO_MODE session seeding', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...origEnv,
      DEMO_AUTH_USER: 'admin',
      DEMO_AUTH_PASSWORD: 'demo',
      DEMO_AUTH_SECRET: 'testsecret1234567890',
      DEMO_AUTH_COOKIE_DAYS: '7',
      DEMO_MODE: 'true',
      NODE_ENV: 'test',
    };

    jest.doMock('@/lib/sample-data/create-demo-session', () => ({
      createDemoSession: jest.fn().mockReturnValue(DEMO_SESSION_ID),
    }));
  });

  afterEach(() => {
    process.env = origEnv;
    jest.restoreAllMocks();
  });

  function makeFormReq(body: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: new URLSearchParams(body).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  it('sets session_id cookie on successful login when DEMO_MODE=true', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeFormReq({ user: 'admin', password: 'demo' }));
    expect(res.status).toBe(303);
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const allCookies = cookies.join('; ');
    expect(allCookies).toContain('session_id=');
    expect(allCookies).toContain(DEMO_SESSION_ID);
  });

  it('calls createDemoSession on successful login when DEMO_MODE=true', async () => {
    const { createDemoSession } = await import('@/lib/sample-data/create-demo-session');
    const { POST } = await import('@/app/api/auth/login/route');
    await POST(makeFormReq({ user: 'admin', password: 'demo' }));
    expect(createDemoSession).toHaveBeenCalledTimes(1);
  });

  it('does NOT set session_id cookie when DEMO_MODE is not set', async () => {
    delete process.env.DEMO_MODE;
    jest.resetModules();
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeFormReq({ user: 'admin', password: 'demo' }));
    expect(res.status).toBe(303);
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const allCookies = cookies.join('; ');
    expect(allCookies).not.toContain('session_id=');
  });

  it('does NOT call createDemoSession on failed login', async () => {
    const { createDemoSession } = await import('@/lib/sample-data/create-demo-session');
    const { POST } = await import('@/app/api/auth/login/route');
    await POST(makeFormReq({ user: 'admin', password: 'wrong-password' }));
    expect(createDemoSession).not.toHaveBeenCalled();
  });
});
