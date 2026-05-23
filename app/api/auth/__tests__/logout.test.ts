/**
 * Tests for app/api/auth/logout/route.ts
 * POST /api/auth/logout
 */
import { NextRequest } from 'next/server';

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function getHandler() {
    const mod = await import('../logout/route');
    return mod.POST;
  }

  it('redirects to /login with expired cookie', async () => {
    const POST = await getHandler();
    const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login');
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('demo_auth=');
    expect(cookie).toContain('Max-Age=0');
  });

  // PI2 — (b): logout clears session_id and csrf_token cookies
  it('clears session_id and csrf_token cookies in Set-Cookie response', async () => {
    const POST = await getHandler();
    const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await POST(req as Parameters<typeof POST>[0]);
    const allCookies = res.headers.get('set-cookie') ?? '';
    expect(allCookies).toContain('session_id=');
    expect(allCookies).toContain('csrf_token=');
  });

  // PI2 — (b): logout deletes the OAuth session from the store
  it('deletes the OAuth session from the session store', async () => {
    const mockDelete = jest.fn();
    jest.doMock('@/lib/session', () => ({ deleteSession: mockDelete }));
    const { POST } = await import('../logout/route');
    const req = new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie: 'session_id=test-session-id' },
    });
    await POST(req);
    expect(mockDelete).toHaveBeenCalledWith('test-session-id');
  });

  // PI2 — (c): double-logout is idempotent (no session_id cookie → no error)
  it('double-logout without session cookie is idempotent', async () => {
    const POST = await getHandler();
    const makeReq = () => new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const res1 = await POST(makeReq() as Parameters<typeof POST>[0]);
    expect(res1.status).toBe(303);
    const res2 = await POST(makeReq() as Parameters<typeof POST>[0]);
    expect(res2.status).toBe(303);
  });
});
