// Mock ai-provider shim BEFORE importing route
jest.mock('@/lib/ai-provider', () => ({
  callAiText: jest.fn(),
}));

// Mock session helpers
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

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST } from '@/app/api/ai/parse-recap/route';
import { callAiText } from '@/lib/ai-provider';
import { getSession, updateSession } from '@/lib/session';
import { parseRecapAIResponse } from '@/lib/parsing/parse-recap-helpers';
import type { SessionData } from '@/lib/types';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) {
    headers['Cookie'] = `session_id=${sessionId}`;
  }
  return new NextRequest('http://localhost/api/ai/parse-recap', {
    method: 'POST',
    headers,
  });
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess-1',
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
    ...overrides,
  };
}

function makeRecapEmail(id: string) {
  return {
    id,
    threadId: `thread-${id}`,
    from: 'broker@example.com',
    fromName: 'Broker',
    fromEmail: 'broker@example.com',
    to: 'me@example.com',
    subject: 'FIXTURE RECAP MV TEST',
    date: '2026-01-01',
    body: 'MV TEST / OWNER CO / CHARTER CO / RTM / SGP / 35 USD/MT',
    snippet: 'MV TEST',
    labelIds: [],
  };
}

function makeRecapClassification(emailId: string) {
  return {
    emailId,
    category: 'FIXTURE_RECAP' as const,
    isUnanswered: false,
    urgency: 'low' as const,
    daysWithoutReply: 0,
    confidence: 0.95,
    originalSender: 'Broker',
    originalSenderCompany: null,
  };
}

const FULL_RECAP_JSON = JSON.stringify({
  vessel_name: { value: 'MV TEST', confidence: 'confirmed' },
  owners: { value: 'Owner Co', confidence: 'confirmed' },
  charterers: { value: 'Charter Co', confidence: 'confirmed' },
  load_port: { value: 'Rotterdam', confidence: 'confirmed' },
  disch_port: { value: 'Singapore', confidence: 'confirmed' },
  freight_rate: { value: '35 USD/MT', confidence: 'confirmed' },
  commission_percent: 2.5,
  commission_base: 'freight',
  commission_currency: 'USD',
  subs: [],
  additional_terms: [],
  unknown_terms: [],
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Route tests: shim integration ─────────────────────────────────────────────

describe('parse-recap route — shim integration', () => {
  it('calls callAiText from ai-provider shim with scope PARSE_RECAP', async () => {
    const session = makeSession({
      emails: [makeRecapEmail('email-1')],
      classifications: [makeRecapClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(FULL_RECAP_JSON);

    const req = makeRequest('sess-1');
    await POST(req);

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    // First argument must be scope='PARSE_RECAP'
    const [scope, system, user] = mockCallAiText.mock.calls[0];
    expect(scope).toBe('PARSE_RECAP');
    expect(typeof system).toBe('string');
    expect(system.length).toBeGreaterThan(10);
    expect(typeof user).toBe('string');
    expect(user).toContain('MV TEST');
  });

  it('returns count matching parsed emails', async () => {
    const session = makeSession({
      emails: [makeRecapEmail('email-1'), makeRecapEmail('email-2')],
      classifications: [
        makeRecapClassification('email-1'),
        makeRecapClassification('email-2'),
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(FULL_RECAP_JSON);

    const req = makeRequest('sess-1');
    const res = await POST(req);
    const body = await res.json();

    expect(body).toEqual({ count: 2 });
    expect(mockCallAiText).toHaveBeenCalledTimes(2);
  });

  it('returns count:0 and does not call shim when no FIXTURE_RECAP emails', async () => {
    mockGetSession.mockReturnValue(makeSession({ classifications: [] }));
    const req = makeRequest('sess-1');
    const res = await POST(req);

    expect(mockCallAiText).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual({ count: 0 });
    expect(mockUpdateSession).toHaveBeenCalledWith('sess-1', {
      parsedFixtureRecaps: [],
      commissionSummary: null,
    });
  });

  it('passes timeoutMs in opts to shim', async () => {
    const session = makeSession({
      emails: [makeRecapEmail('email-1')],
      classifications: [makeRecapClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(FULL_RECAP_JSON);

    await POST(makeRequest('sess-1'));

    const opts = mockCallAiText.mock.calls[0][3];
    expect(opts).toBeDefined();
    expect(typeof opts?.timeoutMs).toBe('number');
    expect(opts?.timeoutMs).toBeGreaterThan(0);
  });

  it('stores parsed recap and commission summary in session', async () => {
    const session = makeSession({
      emails: [makeRecapEmail('email-1')],
      classifications: [makeRecapClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiText.mockResolvedValue(FULL_RECAP_JSON);

    await POST(makeRequest('sess-1'));

    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    const [, update] = mockUpdateSession.mock.calls[0];
    const upd = update as { parsedFixtureRecaps: unknown[]; commissionSummary: unknown };
    expect(upd.parsedFixtureRecaps).toHaveLength(1);
    expect(upd.commissionSummary).toBeDefined();
  });

  it('skips errored email (timeout) and returns partial count', async () => {
    const { LLMTimeoutError } = jest.requireActual('@/lib/openai') as { LLMTimeoutError: new (msg: string) => Error };
    const session = makeSession({
      emails: [makeRecapEmail('email-1'), makeRecapEmail('email-2')],
      classifications: [
        makeRecapClassification('email-1'),
        makeRecapClassification('email-2'),
      ],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiText
      .mockResolvedValueOnce(FULL_RECAP_JSON)
      .mockRejectedValueOnce(new LLMTimeoutError('timed out'));

    const res = await POST(makeRequest('sess-1'));
    const body = await res.json();
    // one email parsed, one timed out → count:1
    expect(body).toEqual({ count: 1 });
  });
});

// ── CSRF guard ────────────────────────────────────────────────────────────────

describe('CSRF guard', () => {
  it('returns 403 when CSRF validation fails', async () => {
    // No origin header → CSRF fails
    const req = new NextRequest('http://localhost/api/ai/parse-recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await req; // just to ensure NextRequest type
    void res;
    const result = await POST(
      new NextRequest('http://localhost/api/ai/parse-recap', {
        method: 'POST',
        // Missing CSRF origin header
      }),
    );
    expect(result.status).toBe(403);
  });
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('auth guard', () => {
  it('returns 401 when no session_id cookie', async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'No session' });
  });

  it('returns 401 when session is expired', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Session expired' });
  });
});

// ── parseRecapAIResponse (corpus regression) ─────────────────────────────────

describe('parseRecapAIResponse', () => {
  it('parses a full recap with commission fields', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'MV TEST', confidence: 'confirmed' },
      owners: { value: 'Owner Co', confidence: 'confirmed' },
      charterers: { value: 'Charter Co', confidence: 'confirmed' },
      load_port: { value: 'Rotterdam', confidence: 'confirmed' },
      disch_port: { value: 'Singapore', confidence: 'confirmed' },
      freight_rate: { value: '35 USD/MT', confidence: 'confirmed' },
      commission_percent: 2.5,
      commission_base: 'freight',
      commission_currency: 'USD',
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-1');
    expect(result.emailId).toBe('email-1');
    expect(result.vesselName?.value).toBe('MV TEST');
    expect(result.commissionPercent).toBe(2.5);
    expect(result.commissionBase).toBe('freight');
    expect(result.commissionCurrency).toBe('USD');
  });

  it('returns null commissionPercent when commission fields are absent', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'MV NOCOMM', confidence: 'confirmed' },
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-2');
    expect(result.commissionPercent).toBeNull();
    expect(result.commissionAmount).toBeNull();
  });

  it('falls back to commission_pct when commission_percent is absent', () => {
    const raw = JSON.stringify({
      commission_pct: 3.75,
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-3');
    expect(result.commissionPercent).toBe(3.75);
  });

  it('returns a minimal record with null fields on malformed JSON', () => {
    const result = parseRecapAIResponse('not-valid-json{{', 'email-4');
    expect(result.emailId).toBe('email-4');
    expect(result.vesselName).toBeNull();
    expect(result.commissionPercent).toBeNull();
    expect(result.subs).toEqual([]);
  });

  it('strips markdown fences before parsing', () => {
    const inner = JSON.stringify({
      vessel_name: { value: 'FENCED', confidence: 'confirmed' },
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const raw = '```json\n' + inner + '\n```';
    const result = parseRecapAIResponse(raw, 'email-5');
    expect(result.vesselName?.value).toBe('FENCED');
  });

  it('returns defaults when fields are missing (empty string → null)', () => {
    const raw = JSON.stringify({
      subs: ['SUBJ TO OWNER'],
      additional_terms: ['ITFWTSA'],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-6');
    expect(result.subs).toEqual(['SUBJ TO OWNER']);
    expect(result.additionalTerms).toEqual(['ITFWTSA']);
    expect(result.broker).toBeNull();
    expect(result.vesselName).toBeNull();
  });

  it('handles vesselGeared boolean correctly', () => {
    const raw = JSON.stringify({
      vessel_geared: true,
      vessel_dwt: '75000',
      vessel_draft: 14.5,
      subs: [],
      additional_terms: [],
      unknown_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-7');
    expect(result.vesselGeared).toBe(true);
    expect(result.vesselDwt).toBe(75000);
    expect(result.vesselDraft).toBe(14.5);
  });

  // Regression: PR #223 renamed unknown_terms inner key from "note" to "context"
  // to match GT, but UI + ParsedFixtureRecap.unknownTerms still read .note.
  // Parser must normalize both shapes to canonical .note so UI keeps working.
  it('normalizes unknown_terms.context (new Gemini schema) to .note', () => {
    const raw = JSON.stringify({
      unknown_terms: [
        { term: 'APP B FITTED', context: 'Vessel description anomaly' },
        { term: 'DM', context: 'Draft maximum suffix non-standard' },
      ],
      subs: [],
      additional_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-ctx');
    expect(result.unknownTerms).toHaveLength(2);
    expect(result.unknownTerms[0]).toEqual({
      term: 'APP B FITTED',
      note: 'Vessel description anomaly',
    });
    expect(result.unknownTerms[1].note).toBe('Draft maximum suffix non-standard');
  });

  it('preserves unknown_terms.note (legacy shape) unchanged', () => {
    const raw = JSON.stringify({
      unknown_terms: [{ term: 'LEGACY', note: 'old shape' }],
      subs: [],
      additional_terms: [],
    });
    const result = parseRecapAIResponse(raw, 'email-legacy');
    expect(result.unknownTerms[0].note).toBe('old shape');
  });
});
