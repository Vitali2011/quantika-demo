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
    jest.clearAllMocks();
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

// PI2 — sample-data shortcut (#394)
// Verifies the three core behaviours of the bypass added for the "Try with
// Sample Data" demo flow so it never hits Gmail OAuth.
describe('PI2 — sample-data shortcut (#394)', () => {
  const { fetchGmailEmails } = jest.requireMock('@/lib/google') as { fetchGmailEmails: jest.Mock };

  const SAMPLE_EMAILS = [
    { id: 's1', from: 'a@b.com', subject: 'Cargo inquiry', body: '', snippet: '', date: '' },
    { id: 's2', from: 'c@d.com', subject: 'Vessel position', body: '', snippet: '', date: '' },
    { id: 's3', from: 'e@f.com', subject: 'Fixture recap', body: '', snippet: '', date: '' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReset();
    mockUpdateSession.mockReset();
  });

  // (a) sample-mode without real OAuth token → 200 + emails, Gmail not called
  it('(a) sample session with fake token returns 200 without calling Gmail', async () => {
    mockGetSession.mockReturnValue({
      isSampleData: true,
      emails: SAMPLE_EMAILS,
      accessToken: 'sample-data-token',
      accountId: null,
    });
    const { POST } = await import('@/app/api/emails/fetch/route');
    const res = await POST(makeReq('sample-sid'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(3);
    expect(fetchGmailEmails).not.toHaveBeenCalled();
  });

  // (b) real-mode without OAuth → 401 (covered in fetch-persists.test.ts;
  //     confirmed here that non-sample sessions are NOT short-circuited)
  it('(b) real session is NOT short-circuited by sample guard', async () => {
    mockGetSession.mockReturnValue({
      isSampleData: false,
      emails: [],
      accessToken: 'real-tok',
      accountId: null,
    });
    const authErr = Object.assign(new Error('401'), { response: { status: 401 } });
    fetchGmailEmails.mockRejectedValueOnce(authErr);
    const { POST } = await import('@/app/api/emails/fetch/route');
    const res = await POST(makeReq('real-sid'));
    expect(res.status).toBe(401);
    expect(fetchGmailEmails).toHaveBeenCalledTimes(1);
  });

  // (c) sample-mode WITH a real-looking OAuth token → 200, Gmail still skipped (idempotent)
  it('(c) sample session with real OAuth token still bypasses Gmail (idempotent)', async () => {
    mockGetSession.mockReturnValue({
      isSampleData: true,
      emails: SAMPLE_EMAILS,
      accessToken: 'ya29.a0ARrdaM-real-google-token',
      accountId: 'broker@example.com',
    });
    const { POST } = await import('@/app/api/emails/fetch/route');
    const res = await POST(makeReq('sample-with-oauth-sid'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(3);
    expect(fetchGmailEmails).not.toHaveBeenCalled();
  });
});
