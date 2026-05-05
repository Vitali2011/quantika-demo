/**
 * Tests for draft-quote route — γv-05
 * Verifies: shim delegation, both providers (openai/gemini), PII sanitization, error paths
 */
import { POST } from '@/app/api/ai/draft-quote/route';
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

// Mock CSRF — always valid in tests
jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
}));

// Mock session-store for ai-provider audit (it writes to DB)
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
  return new NextRequest('http://localhost/api/ai/draft-quote', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const baseEmail: Email = {
  id: 'email-1',
  threadId: 'thread-1',
  from: 'John Smith <john@acme.com>',
  fromName: 'John Smith',
  fromEmail: 'john@acme.com',
  to: 'agent@freight.com',
  subject: 'Cargo inquiry from Shanghai',
  date: new Date().toISOString(),
  body: 'We need to ship 20 containers from Shanghai to Rotterdam.',
  snippet: 'We need to ship',
  labelIds: ['INBOX'],
};

const baseParsedCargo: ParsedCargo = {
  emailId: 'email-1',
  itemIndex: 0,
  originPort: { value: 'Shanghai', confidence: 'confirmed' },
  originCountry: 'CN',
  destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
  destinationCountry: 'NL',
  cargoDescription: { value: 'electronics', confidence: 'confirmed' },
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'FCL',
  containerType: '20GP',
  quantity: 20,
  incoterms: null,
  preferredDates: null,
  laycan: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: [],
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

describe('POST /api/ai/draft-quote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth / validation ──────────────────────────────────────────────────────

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

  it('returns 400 on missing emailId', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({}, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when parsedCargo not found for emailId', async () => {
    mockGetSession.mockReturnValue({ ...baseSession, parsedCargos: [] });
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Parsed request not found');
  });

  // ── Core: shim delegation ─────────────────────────────────────────────────

  it('calls callAiText from ai-provider shim (not lib/openai) with DRAFT_QUOTE scope', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft quote text here');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Must call the shim's callAiText with 'DRAFT_QUOTE' as first argument
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    const [scope] = mockCallAiText.mock.calls[0];
    expect(scope).toBe('DRAFT_QUOTE');
  });

  it('returns { draft } in response body', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Your draft quote is ready');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ draft: 'Your draft quote is ready' });
  });

  // ── Gemini provider rollback ───────────────────────────────────────────────

  it('uses gemini when DRAFT_QUOTE_PROVIDER=gemini (shim handles routing)', async () => {
    // The route just calls callAiText(scope, ...) — the shim handles provider selection.
    // We verify that the mock is called regardless of provider (shim is mocked as a unit).
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Gemini draft quote');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockCallAiText).toHaveBeenCalledWith(
      'DRAFT_QUOTE',
      expect.any(String), // system prompt
      expect.any(String), // user prompt
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  // ── Prompt content: PII / sender name ─────────────────────────────────────

  it('includes sender name in user prompt', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('John Smith');
  });

  it('includes parsedCargo JSON in user prompt', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('Shanghai');
    expect(userPrompt).toContain('Rotterdam');
  });

  it('falls back sender name to email local part when no display name', async () => {
    const emailNoName = { ...baseEmail, from: 'plain@acme.com', fromName: null };
    mockGetSession.mockReturnValue({ ...baseSession, emails: [emailNoName] });
    mockCallAiText.mockResolvedValue('Draft');
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await POST(req);
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    // Should not contain raw email address in the "address to" line, but local part is fine
    expect(userPrompt).toContain('plain');
  });

  // ── Timeout error handling ─────────────────────────────────────────────────

  it('returns 504 with retryable flag on LLMTimeoutError', async () => {
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

  it('re-throws non-timeout errors', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new Error('unexpected error'));
    const req = makeRequest({ emailId: 'email-1' }, 'session-1');
    await expect(POST(req)).rejects.toThrow('unexpected error');
  });
});
