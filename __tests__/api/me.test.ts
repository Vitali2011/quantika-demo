/**
 * Tests — GET/PATCH /api/me (preferred_mode persist).
 *
 * Covers:
 *   - GET returns { id, email, preferred_mode: 'charterer' } for new user
 *   - PATCH preferred_mode='owner' persists and is returned
 *   - PATCH with invalid mode returns 400
 *   - Unauthenticated request (no cookie payload) returns 401
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration037 from '@/lib/migrations/037-add-user-preferred-mode';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: () => testDb })),
}));

jest.mock('@/lib/auth/config', () => ({
  getAuthConfig: jest.fn().mockReturnValue({
    enabled: true,
    secret: 'test-secret',
    user: 'testuser',
    password: 'pw',
    cookieDays: 7,
  }),
}));

const mockVerifyAuthCookie = jest.fn();
jest.mock('@/lib/auth/cookie', () => ({
  AUTH_COOKIE_NAME: 'demo_auth',
  verifyAuthCookie: (...args: unknown[]) => mockVerifyAuthCookie(...args),
}));

beforeEach(() => {
  testDb = new Database(':memory:');
  migration037.up(testDb);
  mockVerifyAuthCookie.mockResolvedValue({ user: 'alice', exp: Date.now() + 3_600_000 });
});

function makeReq(method: string, cookie = 'demo_auth=valid-token'): NextRequest {
  return new NextRequest('http://localhost/api/me', {
    method,
    headers: { cookie },
  });
}

function makeReqWithBody(method: string, body: unknown, cookie = 'demo_auth=valid-token'): NextRequest {
  return new NextRequest('http://localhost/api/me', {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('GET /api/me', () => {
  it('returns user info with default preferred_mode charterer', async () => {
    const { GET } = await import('@/app/api/me/route');
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 'alice', email: 'alice', preferred_mode: 'charterer' });
  });

  it('returns preferred_mode owner after PATCH sets it', async () => {
    const { GET, PATCH } = await import('@/app/api/me/route');
    await PATCH(makeReqWithBody('PATCH', { preferred_mode: 'owner' }));
    const res = await GET(makeReq('GET'));
    const body = await res.json();
    expect(body.preferred_mode).toBe('owner');
  });

  it('returns 401 when cookie invalid', async () => {
    mockVerifyAuthCookie.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/me/route');
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/me', () => {
  it('persists owner mode', async () => {
    const { PATCH } = await import('@/app/api/me/route');
    const res = await PATCH(makeReqWithBody('PATCH', { preferred_mode: 'owner' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferred_mode).toBe('owner');
  });

  it('returns 400 for invalid mode', async () => {
    const { PATCH } = await import('@/app/api/me/route');
    const res = await PATCH(makeReqWithBody('PATCH', { preferred_mode: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    mockVerifyAuthCookie.mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/me/route');
    const res = await PATCH(makeReqWithBody('PATCH', { preferred_mode: 'owner' }));
    expect(res.status).toBe(401);
  });
});
