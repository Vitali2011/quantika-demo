jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  const getSession = jest.fn();
  const updateSession = jest.fn();
  return {
    getSession,
    updateSession,
    requireSession: (request: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sessionId = request.cookies.get('session_id')?.value;
      if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
      const session = getSession(sessionId);
      if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return { session, sessionId };
    },
  };
});

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/email/action/route';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData, ProcessedEmail } from '@/lib/types';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(body: unknown, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/email/action', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const baseProcessedEmail: ProcessedEmail = {
  emailId: 'email-1',
  type: 'CARGO_INQUIRY',
  status: 'NEEDS_ACTION',
  isUnanswered: true,
  urgency: 'medium',
  daysWithoutReply: 1,
  confidence: 0.9,
  originalSender: 'broker@example.com',
  originalSenderCompany: null,
  freshness: 'active',
  expiryDate: null,
  expirySource: null,
};

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess-1',
    accessToken: 'token',
    createdAt: new Date(),
    emails: [],
    classifications: [],
    processedEmails: [baseProcessedEmail],
    parsedCargos: [],
    parsedVessels: [],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateSession.mockReturnValue(true);
});

describe('POST /api/email/action — accept', () => {
  it('updates processedEmail status to RESPONDED on accept', async () => {
    mockGetSession.mockReturnValue(makeSession());

    const res = await POST(makeRequest({ emailId: 'email-1', action: 'accept' }, 'sess-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('RESPONDED');

    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        processedEmails: expect.arrayContaining([
          expect.objectContaining({ emailId: 'email-1', status: 'RESPONDED' }),
        ]),
      })
    );
  });
});

describe('POST /api/email/action — reject', () => {
  it('updates processedEmail status to INFO_ONLY on reject', async () => {
    mockGetSession.mockReturnValue(makeSession());

    const res = await POST(makeRequest({ emailId: 'email-1', action: 'reject' }, 'sess-1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('INFO_ONLY');

    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        processedEmails: expect.arrayContaining([
          expect.objectContaining({ emailId: 'email-1', status: 'INFO_ONLY' }),
        ]),
      })
    );
  });
});
