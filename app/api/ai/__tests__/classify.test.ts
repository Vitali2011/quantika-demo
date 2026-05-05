import { POST } from '@/app/api/ai/classify/route';
import { NextRequest } from 'next/server';
import { Email, SessionData } from '@/lib/types';

jest.mock('@/lib/openai', () => {
  const actual = jest.requireActual('@/lib/openai') as typeof import('@/lib/openai');
  return {
    ...actual,
    callAiJson: jest.fn(),
    callAiText: jest.fn(),
  };
});
jest.mock('@/lib/ai-provider', () => ({
  ...jest.requireActual('@/lib/ai-provider'),
  callAiJson: jest.fn(),
}));
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

import { callAiJson } from '@/lib/openai';
import * as aiProvider from '@/lib/ai-provider';
import { getSession, updateSession } from '@/lib/session';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockAiProviderCallAiJson = aiProvider.callAiJson as jest.MockedFunction<typeof aiProvider.callAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

// By default ai-provider shim delegates to openai mock so existing tests keep working.
// When old tests set mockCallAiJson.mockResolvedValue(data), the ai-provider mock
// will forward through to it because it shares the same mockImplementation chain.
beforeEach(() => {
   
  mockAiProviderCallAiJson.mockImplementation(() => mockCallAiJson('', '', '', undefined as any));
});

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

describe('POST /api/ai/classify — provider routing', () => {
  const singleEmail = {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test',
    date: new Date().toISOString(),
    body: 'Some body',
    snippet: 'Some body',
    labelIds: ['INBOX'],
  } satisfies Email;

  const sessionWithEmail: SessionData = {
    id: 'session-1',
    accessToken: 'token',
    createdAt: new Date(),
    emails: [singleEmail],
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSession.mockReturnValue(true);
    mockGetSession.mockReturnValue(sessionWithEmail);
  });

  afterEach(() => {
    delete process.env.CLASSIFY_PROVIDER;
    delete process.env.AI_PROVIDER;
  });

  it('regression: CLASSIFY_PROVIDER=openai — routes through ai-provider shim (callAiJson from @/lib/ai-provider called)', async () => {
    process.env.CLASSIFY_PROVIDER = 'openai';
    mockAiProviderCallAiJson.mockResolvedValue({
      classifications: [{ id: 'email-1', category: 'CARGO_INQUIRY', urgency: 'high', confidence: 0.9 }],
    });

    const req = new NextRequest('http://localhost/api/ai/classify', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: 'session_id=session-1' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // Verify callAiJson from ai-provider shim was called (not bypassed)
    expect(mockAiProviderCallAiJson).toHaveBeenCalledWith(
      'CLASSIFY',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('CLASSIFY_PROVIDER=gemini — routes through ai-provider shim with CLASSIFY scope', async () => {
    process.env.CLASSIFY_PROVIDER = 'gemini';
    mockAiProviderCallAiJson.mockResolvedValue({
      classifications: [{ id: 'email-1', category: 'VESSEL_INQUIRY', urgency: 'low', confidence: 0.8 }],
    });

    const req = new NextRequest('http://localhost/api/ai/classify', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: 'session_id=session-1' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // Verify shim was called with CLASSIFY scope — the shim itself routes to Gemini internally
    expect(mockAiProviderCallAiJson).toHaveBeenCalledWith(
      'CLASSIFY',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    // openai callAiJson should NOT be called directly (route now uses ai-provider)
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  it('graceful fallback: classify endpoint returns 504 on LLMTimeoutError regardless of provider', async () => {
    process.env.CLASSIFY_PROVIDER = 'gemini';
    const { LLMTimeoutError } = jest.requireActual('@/lib/openai') as { LLMTimeoutError: new (message: string) => Error };
    mockAiProviderCallAiJson.mockRejectedValue(new LLMTimeoutError('timed out'));

    const req = new NextRequest('http://localhost/api/ai/classify', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: 'session_id=session-1' },
    });

    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('ai_timeout');
    expect(body.retryable).toBe(true);
  });
});
