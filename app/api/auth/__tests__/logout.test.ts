/**
 * Tests for app/api/auth/logout/route.ts
 * POST /api/auth/logout
 */

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
});
