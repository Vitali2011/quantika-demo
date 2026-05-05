/**
 * Tests for draft-reply route — γv-05
 * Verifies: shim delegation, both cases (emailId / pendingItems), both providers, error paths
 */
import { POST } from '@/app/api/ai/draft-reply/route';
import { NextRequest } from 'next/server';
import { Email, SessionData, ParsedCargo } from '@/lib/types';

// Mock the ai-provider shim (NOT lib/openai directly)
jest.mock('@/lib/ai-provider');

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

// Mock CSRF
jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

// Mock session-store for ai-provider audit
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn() })),
    })),
  })),
}));

import { callAiText } from '@/lib/ai-provider';
import { getSession } from '@/lib/session';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

function makeRequest(body: unknown, sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/ai/draft-reply', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const baseEmail: Email = {
  id: 'email-1',
  threadId: 'thread-1',
  from: 'Alice Freight <alice@logistics.com>',
  fromName: 'Alice Freight',
  fromEmail: 'alice@logistics.com',
  to: 'agent@freight.com',
  subject: 'Cargo inquiry — missing dimensions',
  date: new Date().toISOString(),
  body: 'Please send me a quote for the shipment.',
  snippet: 'Please send me a quote',
  labelIds: ['INBOX'],
};

const baseParsedCargo: ParsedCargo = {
  emailId: 'email-1',
  itemIndex: 0,
  originPort: { value: 'Hamburg', confidence: 0.9 },
  originCountry: 'DE',
  destinationPort: { value: 'Dubai', confidence: 0.9 },
  destinationCountry: 'AE',
  cargoDescription: { value: 'machinery', confidence: 0.85 },
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'FCL',
  containerType: '40HQ',
  quantity: 5,
  incoterms: null,
  preferredDates: null,
  laycan: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: ['cargo dimensions', 'weight per unit'],
};

const baseSession: SessionData = {
  id: 'session-1',
  accessToken: 'token',
  createdAt: new Date(),
  emails: [baseEmail],
  classifications: [],
  processedEmails: [],
  parsedCargos: [baseParsedCargo],
  parsedVessels: [],
  parsedFixtureRecaps: [],
  matches: [],
  recaps: [],
  commissionSummary: null,
  counterparties: [],
};

describe('POST /api/ai/draft-reply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest({ emailId: 'email-1' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest({ emailId: 'email-1' }, 'bad-session');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty body (no emailId, no pendingItems)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({}, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Case 1: emailId — missing info follow-up ──────────────────────────────

  it('calls callAiText from shim with DRAFT_REPLY scope for emailId case', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft reply for missing info');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    const [scope] = mockCallAiText.mock.calls[0];
    expect(scope).toBe('DRAFT_REPLY');
  });

  it('returns { draft } response for emailId case', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Follow-up reply draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ draft: 'Follow-up reply draft' });
  });

  it('includes missing info items in user prompt', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('cargo dimensions');
    expect(userPrompt).toContain('weight per unit');
  });

  it('extracts client name from fromName field', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('Alice Freight');
  });

  it('falls back to email local part when fromName is null', async () => {
    const emailNoName = { ...baseEmail, fromName: null, from: 'bob@carrier.com' };
    mockGetSession.mockReturnValue({ ...baseSession, emails: [emailNoName] });
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('bob');
  });

  it('falls back to "the client" when no from field', async () => {
    const emailEmpty = { ...baseEmail, fromName: null, from: '' };
    mockGetSession.mockReturnValue({ ...baseSession, emails: [emailEmpty] });
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('the client');
  });

  // ── Case 2: pendingItems — negotiation follow-up ───────────────────────────

  it('calls callAiText from shim with DRAFT_REPLY scope for pendingItems case', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Pending items reply draft');
    const pendingItems = [{ item: 'freight rate', status: 'pending' }];
    const req = makeRequest({ pendingItems }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    const [scope] = mockCallAiText.mock.calls[0];
    expect(scope).toBe('DRAFT_REPLY');
  });

  it('returns { draft } response for pendingItems case', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Pending follow-up draft');
    const pendingItems = [{ item: 'detention fee', status: 'disputed' }];
    const req = makeRequest({ pendingItems }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ draft: 'Pending follow-up draft' });
  });

  it('includes pending item data in user prompt', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const pendingItems = [{ item: 'detention fee', amount: 1500 }];
    const req = makeRequest({ pendingItems }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('detention fee');
  });

  // ── Provider routing (shim) ────────────────────────────────────────────────

  it('passes system prompt and timeoutMs to shim for emailId case', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    expect(mockCallAiText).toHaveBeenCalledWith(
      'DRAFT_REPLY',
      expect.any(String),   // system prompt
      expect.any(String),   // user prompt
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it('passes system prompt and timeoutMs to shim for pendingItems case', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ pendingItems: [{ item: 'price' }] }, 'session-1');
    await POST(req);
    expect(mockCallAiText).toHaveBeenCalledWith(
      'DRAFT_REPLY',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  // ── Timeout error handling ─────────────────────────────────────────────────

  it('returns 504 with retryable flag on LLMTimeoutError (emailId case)', async () => {
    const { LLMTimeoutError } = jest.requireActual('@/lib/openai') as { LLMTimeoutError: new (msg: string) => Error };
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new LLMTimeoutError('timed out'));
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('ai_timeout');
    expect(body.retryable).toBe(true);
  });

  it('returns 504 with retryable flag on LLMTimeoutError (pendingItems case)', async () => {
    const { LLMTimeoutError } = jest.requireActual('@/lib/openai') as { LLMTimeoutError: new (msg: string) => Error };
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new LLMTimeoutError('timed out'));
    const req = makeRequest({ pendingItems: [{ item: 'price' }] }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('ai_timeout');
    expect(body.retryable).toBe(true);
  });

  it('re-throws non-timeout errors (emailId case)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new Error('provider error'));
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await expect(POST(req)).rejects.toThrow('provider error');
  });

  it('re-throws non-timeout errors (pendingItems case)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new Error('network failure'));
    const req = makeRequest({ pendingItems: [{ item: 'price' }] }, 'session-1');
    await expect(POST(req)).rejects.toThrow('network failure');
  });
});
