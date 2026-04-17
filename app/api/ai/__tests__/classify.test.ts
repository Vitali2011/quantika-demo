import { POST } from '@/app/api/ai/classify/route';
import { NextRequest } from 'next/server';
import { Email, SessionData } from '@/lib/types';

jest.mock('@/lib/openai');
jest.mock('@/lib/session');

import { callAiJson } from '@/lib/openai';
import { getSession, updateSession } from '@/lib/session';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = { origin: 'http://localhost:3000' };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/ai/classify', {
    method: 'POST',
    headers,
  });
}

const baseSession: SessionData = {
  id: 'session-1',
  accessToken: 'token',
  createdAt: new Date(),
  emails: [],
  classifications: [],
  processedEmails: [],
  parsedCargos: [],
  parsedVessels: [],
  parsedFixtureRecaps: [],
  matches: [],
  recaps: [],
  commissionSummary: null,
  counterparties: [],
};

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test Subject',
    date: new Date().toISOString(),
    body: 'Test body content',
    snippet: 'Test body',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

describe('POST /api/ai/classify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSession.mockReturnValue(true);
  });

  it('returns 401 when no session_id cookie is present', async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'No session' });
  });

  it('returns 401 when session is not found', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest('invalid-session-id');
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Session expired' });
  });

  it('returns 400 when session emails array is empty', async () => {
    mockGetSession.mockReturnValue({ ...baseSession, emails: [] });
    const req = makeRequest('session-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'No emails to classify' });
  });

  it('detects unanswered incoming email with no SENT reply in thread', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const email = makeEmail({
      id: 'email-1',
      threadId: 'thread-1',
      date: threeDaysAgo,
      labelIds: ['INBOX'],
    });

    mockGetSession.mockReturnValue({ ...baseSession, emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [{ id: 'email-1', category: 'CARGO_INQUIRY', urgency: 'high', confidence: 0.9 }],
    });

    const res = await POST(makeRequest('session-1'));
    expect(res.status).toBe(200);

    const [, updates] = mockUpdateSession.mock.calls[0];
    const cls = (updates as { classifications: { isUnanswered: boolean; daysWithoutReply: number | null }[] }).classifications[0];
    expect(cls.isUnanswered).toBe(true);
    expect(cls.daysWithoutReply).toBeGreaterThan(0);
  });

  it('sets status RESPONDED when SENT reply exists in same thread after incoming email', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    const incomingEmail = makeEmail({ id: 'email-1', threadId: 'thread-1', date: twoDaysAgo, labelIds: ['INBOX'] });
    const sentReply = makeEmail({ id: 'email-2', threadId: 'thread-1', date: yesterday, labelIds: ['SENT'] });

    mockGetSession.mockReturnValue({ ...baseSession, emails: [incomingEmail, sentReply] });
    mockCallAiJson.mockResolvedValue({
      classifications: [{ id: 'email-1', category: 'CLIENT_REPLY', urgency: 'low', confidence: 0.85 }],
    });

    const res = await POST(makeRequest('session-1'));
    expect(res.status).toBe(200);

    const [, updates] = mockUpdateSession.mock.calls[0];
    const processed = (updates as { processedEmails: { isUnanswered: boolean; status: string }[] }).processedEmails[0];
    expect(processed.isUnanswered).toBe(false);
    expect(processed.status).toBe('RESPONDED');
  });

  it('sets status NEEDS_ACTION for CARGO_INQUIRY unanswered for 3 days', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const email = makeEmail({
      id: 'email-1',
      threadId: 'thread-1',
      date: threeDaysAgo,
      labelIds: ['INBOX'],
    });

    mockGetSession.mockReturnValue({ ...baseSession, emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [{ id: 'email-1', category: 'CARGO_INQUIRY', urgency: 'high', confidence: 0.95 }],
    });

    const res = await POST(makeRequest('session-1'));
    expect(res.status).toBe(200);

    const [, updates] = mockUpdateSession.mock.calls[0];
    const processed = (updates as { processedEmails: { status: string; isUnanswered: boolean }[] }).processedEmails[0];
    expect(processed.status).toBe('NEEDS_ACTION');
    expect(processed.isUnanswered).toBe(true);
  });

  it('sets status INFO_ONLY for FIXTURE_RECAP category regardless of reply status', async () => {
    const email = makeEmail({ id: 'email-1', threadId: 'thread-1', labelIds: ['INBOX'] });

    mockGetSession.mockReturnValue({ ...baseSession, emails: [email] });
    mockCallAiJson.mockResolvedValue({
      classifications: [{ id: 'email-1', category: 'FIXTURE_RECAP', urgency: 'low', confidence: 0.9 }],
    });

    const res = await POST(makeRequest('session-1'));
    expect(res.status).toBe(200);

    const [, updates] = mockUpdateSession.mock.calls[0];
    const processed = (updates as { processedEmails: { status: string }[] }).processedEmails[0];
    expect(processed.status).toBe('INFO_ONLY');
  });
});
