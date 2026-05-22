/**
 * Tests for POST /api/emails/fetch
 *
 * Broker trust focus: verifies the sample-data bypass returns the
 * pre-loaded emails without hitting Gmail API, and that missing/expired
 * sessions are properly rejected.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/email-cache', () => ({
  upsertEmails: jest.fn(),
}));

jest.mock('@/lib/google', () => ({
  fetchGmailEmails: jest.fn(async () => []),
}));

import { getSession, updateSession } from '@/lib/session';
const mockGetSession = getSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;

function makeReq(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/emails/fetch', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/emails/fetch', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdateSession.mockReset();
  });

  it('returns 401 when no session_id cookie', async () => {
    const { POST } = await import('@/app/api/emails/fetch/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('No session');
  });

  it('returns 401 when session is expired (getSession returns null)', async () => {
    mockGetSession.mockReturnValue(null);
    const { POST } = await import('@/app/api/emails/fetch/route');
    const res = await POST(makeReq('expired-sid'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Session expired');
  });

  it('returns 200 with email count for sample data session (bypasses Gmail)', async () => {
    const sampleEmails = [
      { id: 'e1', from: 'test@test.com', subject: 'Test', body: '', snippet: '', date: '' },
      { id: 'e2', from: 'test2@test.com', subject: 'Test2', body: '', snippet: '', date: '' },
    ];
    mockGetSession.mockReturnValue({
      isSampleData: true,
      emails: sampleEmails,
      accessToken: 'token',
      accountId: null,
    });
    const { POST } = await import('@/app/api/emails/fetch/route');
    const res = await POST(makeReq('sample-sid'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(2);
    expect(json.message).toMatch(/Sample data/i);
    // Gmail fetch must NOT be called for sample sessions
    const { fetchGmailEmails } = await import('@/lib/google');
    expect(fetchGmailEmails).not.toHaveBeenCalled();
  });
});
