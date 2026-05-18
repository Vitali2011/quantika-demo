/**
 * Tests for POST /api/auth/logout
 *
 * Public endpoint — no auth required.
 * Clears demo_auth cookie and redirects to /login (303).
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout', () => {
  it('returns 303 redirect response', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(303);
  });

  it('Set-Cookie header clears demo_auth cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('demo_auth=');
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toContain('HttpOnly');
  });

  it('Location header points to /login', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/\/login$/);
  });
});
