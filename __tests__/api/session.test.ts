/**
 * Tests for DELETE /api/session
 *
 * Deletes the current session cookie and returns 200.
 * Does not require auth.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/session', () => ({
  deleteSession: jest.fn(),
}));

import { deleteSession } from '@/lib/session';
const mockDeleteSession = deleteSession as jest.Mock;

describe('DELETE /api/session', () => {
  beforeEach(() => {
    mockDeleteSession.mockReset();
  });

  it('returns 200 with message and calls deleteSession when session_id cookie present', async () => {
    const { DELETE } = await import('@/app/api/session/route');
    const req = new NextRequest('http://localhost/api/session', {
      method: 'DELETE',
      headers: { Cookie: 'session_id=abc-123' },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('Session deleted');
    expect(mockDeleteSession).toHaveBeenCalledWith('abc-123');
  });

  it('returns 200 and does NOT call deleteSession when no session_id cookie', async () => {
    const { DELETE } = await import('@/app/api/session/route');
    const req = new NextRequest('http://localhost/api/session', {
      method: 'DELETE',
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('Session deleted');
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('response Set-Cookie header expires session_id cookie (deletion pattern)', async () => {
    const { DELETE } = await import('@/app/api/session/route');
    const req = new NextRequest('http://localhost/api/session', {
      method: 'DELETE',
      headers: { Cookie: 'session_id=abc-123' },
    });
    const res = await DELETE(req);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('session_id');
    // Next.js cookie deletion uses Expires=epoch or Max-Age=0 — either signals deletion
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
