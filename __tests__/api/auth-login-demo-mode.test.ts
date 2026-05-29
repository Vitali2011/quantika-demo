/**
 * Regression test for #573 + frozen-snapshot wiring.
 *
 * In DEMO_MODE=true, POST /api/auth/login must auto-create a session hydrated
 * from the frozen snapshot (demo-seed.db, via hydrateDemoSession) and set the
 * session_id + csrf_token cookies so /matches shows the audited demo data
 * immediately and demo /api/ai/* calls pass the CSRF check.
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

    // Auto-seed now creates a session and hydrates it from the frozen snapshot.
    jest.doMock('@/lib/session', () => ({
      createSession: jest.fn().mockReturnValue(DEMO_SESSION_ID),
    }));
    jest.doMock('@/lib/demo-mode/hydrate-demo-session', () => ({
      hydrateDemoSession: jest.fn(),
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
    // The auth cookie must coexist (regression guard: session_id must not clobber it).
    expect(allCookies).toContain('demo_auth=');
  });

  it('hydrates the session from the frozen snapshot on successful login when DEMO_MODE=true', async () => {
    const { hydrateDemoSession } = await import('@/lib/demo-mode/hydrate-demo-session');
    const { POST } = await import('@/app/api/auth/login/route');
    await POST(makeFormReq({ user: 'admin', password: 'demo' }));
    expect(hydrateDemoSession).toHaveBeenCalledTimes(1);
    expect(hydrateDemoSession).toHaveBeenCalledWith(DEMO_SESSION_ID);
  });

  it('sets a csrf_token cookie on successful demo login (so /api/ai/* passes CSRF)', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeFormReq({ user: 'admin', password: 'demo' }));
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    const allCookies = cookies.join('; ');
    expect(allCookies).toContain('csrf_token=');
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

  it('does NOT hydrate a session on failed login', async () => {
    const { hydrateDemoSession } = await import('@/lib/demo-mode/hydrate-demo-session');
    const { POST } = await import('@/app/api/auth/login/route');
    await POST(makeFormReq({ user: 'admin', password: 'wrong-password' }));
    expect(hydrateDemoSession).not.toHaveBeenCalled();
  });
});
