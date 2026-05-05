/**
 * Tests for parse-cargo route — γv-02 Gemini shim migration.
 *
 * Covers:
 *   1. βf-11 — timeout / body-trim / regex fallback (regression).
 *   2. γv-02 — provider routing: PARSE_CARGO_PROVIDER=openai|gemini both work.
 *   3. MOLOO RULE invariant: weight_mt = nominal (NOT moloo-max).
 *   4. RANGE RULE invariant: weight_mt = upper bound when explicit range given.
 *   5. source_text verbatim copy invariant.
 */
import { NextRequest } from 'next/dist/server/web/spec-extension/request';

// Mock the ai-provider shim (route.ts imports callAiJson from here)
jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(),
}));

// Keep openai mock for LLMTimeoutError (still imported from openai in route.ts)
jest.mock('@/lib/openai', () => ({
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'LLMTimeoutError';
    }
  },
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

import * as routeModule from '@/app/api/ai/parse-cargo/route';
import { POST } from '@/app/api/ai/parse-cargo/route';
import { MAX_EMAIL_BODY_CHARS, LLM_TIMEOUT_MS } from '@/lib/parse-cargo-helpers';
import { callAiJson as mockShimCallAiJson } from '@/lib/ai-provider';
import { getSession, updateSession } from '@/lib/session';
import type { SessionData } from '@/lib/types';

const mockCallAiJson = mockShimCallAiJson as jest.MockedFunction<typeof mockShimCallAiJson>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(sessionId?: string): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['Cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/ai/parse-cargo', {
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

function makeCargoEmail(id: string, body: string) {
  return {
    id,
    threadId: `thread-${id}`,
    from: 'shipper@example.com',
    fromName: 'Shipper',
    fromEmail: 'shipper@example.com',
    to: 'broker@example.com',
    subject: 'Cargo inquiry',
    date: '2026-05-01',
    body,
    snippet: body.slice(0, 50),
    labelIds: [],
  };
}

function makeClassification(emailId: string) {
  return {
    emailId,
    category: 'CARGO_INQUIRY' as const,
    isUnanswered: true,
    urgency: 'high' as const,
    daysWithoutReply: 1,
    confidence: 0.9,
    originalSender: 'Shipper',
    originalSenderCompany: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset provider env
  delete process.env.PARSE_CARGO_PROVIDER;
  delete process.env.PARSE_CARGO_GEMINI_MODEL;
});

// ─── 1. βf-11 regression ──────────────────────────────────────────────────────

describe('βf-11: parse-cargo timeout & body trim', () => {
  it('exports maxDuration <= 60 (Cloudflare 524 cap)', () => {
    expect(typeof routeModule.maxDuration).toBe('number');
    expect(routeModule.maxDuration).toBeLessThanOrEqual(60);
    expect(routeModule.maxDuration).toBeGreaterThan(0);
  });

  it('exports a sane MAX_EMAIL_BODY_CHARS constant (truncation budget)', () => {
    expect(typeof MAX_EMAIL_BODY_CHARS).toBe('number');
    expect(MAX_EMAIL_BODY_CHARS).toBeGreaterThan(1000);
    expect(MAX_EMAIL_BODY_CHARS).toBeLessThanOrEqual(20_000);
  });

  it('exports a sane LLM_TIMEOUT_MS (< maxDuration)', () => {
    expect(typeof LLM_TIMEOUT_MS).toBe('number');
    expect(LLM_TIMEOUT_MS).toBeLessThan(routeModule.maxDuration * 1000);
    expect(LLM_TIMEOUT_MS).toBeGreaterThan(5_000);
  });

  it('truncates email body > MAX_EMAIL_BODY_CHARS before sending to LLM', async () => {
    const huge = 'A'.repeat(60_000);
    const session = makeSession({
      emails: [makeCargoEmail('email-1', huge)],
      classifications: [makeClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({ items: [] });

    const req = makeRequest('sess-1');
    await POST(req);

    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    // Third argument to callAiJson(scope, system, user, opts) is the user prompt
    const userPrompt = mockCallAiJson.mock.calls[0][2] as string;
    expect(userPrompt.length).toBeLessThan(MAX_EMAIL_BODY_CHARS + 1_000);
    expect(userPrompt).toContain('[truncated]');
  });

  it('LLM timeout → graceful 200 fallback (NOT 524, NOT thrown)', async () => {
    jest.useFakeTimers();
    try {
      const session = makeSession({
        emails: [makeCargoEmail('email-1', 'Steel coils from Rotterdam to Singapore, 5000 mt')],
        classifications: [makeClassification('email-1')],
      });
      mockGetSession.mockReturnValue(session);
      mockCallAiJson.mockImplementation(() => new Promise(() => {}));

      const req = makeRequest('sess-1');
      const resPromise = POST(req);
      await jest.advanceTimersByTimeAsync(LLM_TIMEOUT_MS + 1_000);

      const res = await resPromise;
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('count');
      expect(typeof body.count).toBe('number');
    } finally {
      jest.useRealTimers();
    }
  });
});

// ─── 2. γv-02: provider routing ───────────────────────────────────────────────

describe('γv-02: provider routing via ai-provider shim', () => {
  it('routes through ai-provider shim (not legacy openai.callAiJson)', async () => {
    const session = makeSession({
      emails: [makeCargoEmail('email-1', 'Wheat 5000 mt from Rotterdam to Casablanca')],
      classifications: [makeClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({ items: [] });

    const req = makeRequest('sess-1');
    await POST(req);

    // The shim must have been called
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    // First argument is scope = 'PARSE_CARGO'
    expect(mockCallAiJson.mock.calls[0][0]).toBe('PARSE_CARGO');
  });

  it('passes PARSE_CARGO_GEMINI_MODEL as model override when set', async () => {
    process.env.PARSE_CARGO_GEMINI_MODEL = 'gemini-2.5-pro';
    const session = makeSession({
      emails: [makeCargoEmail('email-1', 'Iron ore 10000 mt Singapore to Busan')],
      classifications: [makeClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({ items: [] });

    const req = makeRequest('sess-1');
    await POST(req);

    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    const opts = mockCallAiJson.mock.calls[0][3] as { model?: string };
    expect(opts?.model).toBe('gemini-2.5-pro');

    delete process.env.PARSE_CARGO_GEMINI_MODEL;
  });

  it('PARSE_CARGO_PROVIDER=openai — regression path returns parsed items', async () => {
    process.env.PARSE_CARGO_PROVIDER = 'openai';
    const session = makeSession({
      emails: [makeCargoEmail('email-1', 'Corn 8000 mt from New Orleans to Rotterdam')],
      classifications: [makeClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'New Orleans', confidence: 'confirmed', source_text: 'New Orleans' },
        destination_port: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
        cargo_description: { value: 'Corn', confidence: 'confirmed', source_text: 'Corn 8000 mt' },
        weight_mt: { value: 8000, confidence: 'confirmed', source_text: '8000 mt' },
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);

    // Session was updated with parsed cargoes
    expect(mockUpdateSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ parsedCargos: expect.arrayContaining([expect.objectContaining({ emailId: 'email-1' })]) }),
    );

    delete process.env.PARSE_CARGO_PROVIDER;
  });

  it('PARSE_CARGO_PROVIDER=gemini — shim called with correct scope', async () => {
    process.env.PARSE_CARGO_PROVIDER = 'gemini';
    const session = makeSession({
      emails: [makeCargoEmail('email-1', 'Coal 15000 mt from Richards Bay to Busan')],
      classifications: [makeClassification('email-1')],
    });
    mockGetSession.mockReturnValue(session);
    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Richards Bay', confidence: 'confirmed', source_text: 'Richards Bay' },
        destination_port: { value: 'Busan', confidence: 'confirmed', source_text: 'Busan' },
        cargo_description: { value: 'Coal', confidence: 'confirmed', source_text: 'Coal 15000 mt' },
        weight_mt: { value: 15000, confidence: 'confirmed', source_text: '15000 mt' },
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);

    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
    expect(mockCallAiJson.mock.calls[0][0]).toBe('PARSE_CARGO');

    delete process.env.PARSE_CARGO_PROVIDER;
  });

  it('no emails classified as CARGO_INQUIRY → returns count:0 without calling shim', async () => {
    const session = makeSession({
      emails: [makeCargoEmail('email-1', 'Payment received')],
      classifications: [{
        emailId: 'email-1',
        category: 'OTHER' as const,
        isUnanswered: false,
        urgency: 'low' as const,
        daysWithoutReply: 0,
        confidence: 0.9,
        originalSender: 'Someone',
        originalSenderCompany: null,
      }],
    });
    mockGetSession.mockReturnValue(session);

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });

  it('sample data session with pre-seeded cargoes → skips LLM, returns cached:true', async () => {
    const session = makeSession({
      isSampleData: true,
      parsedCargos: [{ emailId: 'email-1' } as never],
    });
    mockGetSession.mockReturnValue(session);

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(mockCallAiJson).not.toHaveBeenCalled();
  });
});

// ─── 3. MOLOO RULE invariant ──────────────────────────────────────────────────

describe('γv-02: MOLOO RULE — nominal weight, not max', () => {
  /**
   * MOLOO = "More or Less Owner's Option" — a tolerance clause.
   * "28,000 mts (10% MOLOO)" means nominal = 28,000, tolerance ±10%.
   * weight_mt MUST be 28000 (nominal), NOT 30800 (moloo-max).
   * weight_mt_min = 25200, weight_mt_max = 30800.
   */
  it('MOLOO email: weight_mt = nominal, min/max = tolerance bounds', async () => {
    const emailBody = 'Please quote for: 28,000 mts wheat (10% MOLOO) Odessa to Rotterdam, laycan 1/10 June';
    const session = makeSession({
      emails: [makeCargoEmail('email-moloo', emailBody)],
      classifications: [makeClassification('email-moloo')],
    });
    mockGetSession.mockReturnValue(session);

    // Simulate what a well-behaved LLM returns for MOLOO
    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Odessa', confidence: 'confirmed', source_text: 'Odessa' },
        destination_port: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
        cargo_description: { value: 'wheat', confidence: 'confirmed', source_text: '28,000 mts wheat' },
        weight_mt: { value: 28000, confidence: 'confirmed', source_text: '28,000 mts wheat (10% MOLOO)' },
        weight_mt_min: 25200,
        weight_mt_max: 30800,
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number }; weightMtMin: number | null; weightMtMax: number | null }> }).parsedCargos;
    const parsed = updatedCargos[0];

    // CRITICAL: weight_mt = nominal (28000), not MOLOO max (30800)
    expect(parsed.weightMt).toEqual(expect.objectContaining({ value: 28000 }));
    expect(parsed.weightMtMin).toBe(25200);
    expect(parsed.weightMtMax).toBe(30800);
  });

  it('MOLOO email with "abt" hedge: weight_mt = nominal with interpreted confidence', async () => {
    const emailBody = 'Abt 28,000 mts grain (10% MOLOO) from Black Sea to Algiers, laycan TBD';
    const session = makeSession({
      emails: [makeCargoEmail('email-moloo-abt', emailBody)],
      classifications: [makeClassification('email-moloo-abt')],
    });
    mockGetSession.mockReturnValue(session);

    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Black Sea', confidence: 'uncertain', source_text: 'Black Sea' },
        destination_port: { value: 'Algiers', confidence: 'confirmed', source_text: 'Algiers' },
        cargo_description: { value: 'grain', confidence: 'confirmed', source_text: 'Abt 28,000 mts grain' },
        // "abt" means interpreted confidence, nominal value 28000
        weight_mt: { value: 28000, confidence: 'interpreted', source_text: 'Abt 28,000 mts grain (10% MOLOO)' },
        weight_mt_min: 25200,
        weight_mt_max: 30800,
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number; confidence: string }; weightMtMin: number | null; weightMtMax: number | null }> }).parsedCargos;
    const parsed = updatedCargos[0];

    expect(parsed.weightMt).toEqual(expect.objectContaining({ value: 28000, confidence: 'interpreted' }));
    expect(parsed.weightMtMin).toBe(25200);
    expect(parsed.weightMtMax).toBe(30800);
  });
});

// ─── 4. RANGE RULE invariant ──────────────────────────────────────────────────

describe('γv-02: RANGE RULE — upper bound for explicit weight range', () => {
  /**
   * RANGE RULE: "4000/4800 MT" → weight_mt = 4800 (upper bound), confidence=interpreted.
   * weight_mt_min = 4000, weight_mt_max = 4800.
   */
  it('slash-range "4000/4800 MT": weight_mt = 4800 (upper), min=4000, max=4800', async () => {
    const emailBody = 'Cargo: steel coils 4000/4800 MT, from Pohang to Rotterdam, ASAP laycan';
    const session = makeSession({
      emails: [makeCargoEmail('email-range-1', emailBody)],
      classifications: [makeClassification('email-range-1')],
    });
    mockGetSession.mockReturnValue(session);

    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Pohang', confidence: 'confirmed', source_text: 'Pohang' },
        destination_port: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
        cargo_description: { value: 'steel coils', confidence: 'confirmed', source_text: 'steel coils 4000/4800 MT' },
        weight_mt: { value: 4800, confidence: 'interpreted', source_text: '4000/4800 MT' },
        weight_mt_min: 4000,
        weight_mt_max: 4800,
        cargo_type: 'BREAK_BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number }; weightMtMin: number | null; weightMtMax: number | null }> }).parsedCargos;
    const parsed = updatedCargos[0];

    // Upper bound
    expect(parsed.weightMt).toEqual(expect.objectContaining({ value: 4800 }));
    expect(parsed.weightMtMin).toBe(4000);
    expect(parsed.weightMtMax).toBe(4800);
  });

  it('dash-range "5000-5500 MT": weight_mt = 5500 (upper)', async () => {
    const emailBody = 'Fertilizer 5000-5500 MT bulk, Aqaba to Karachi, laycan 15/20 June 2026';
    const session = makeSession({
      emails: [makeCargoEmail('email-range-2', emailBody)],
      classifications: [makeClassification('email-range-2')],
    });
    mockGetSession.mockReturnValue(session);

    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Aqaba', confidence: 'confirmed', source_text: 'Aqaba' },
        destination_port: { value: 'Karachi', confidence: 'confirmed', source_text: 'Karachi' },
        cargo_description: { value: 'Fertilizer', confidence: 'confirmed', source_text: 'Fertilizer 5000-5500 MT bulk' },
        weight_mt: { value: 5500, confidence: 'interpreted', source_text: '5000-5500 MT' },
        weight_mt_min: 5000,
        weight_mt_max: 5500,
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number }; weightMtMin: number | null; weightMtMax: number | null }> }).parsedCargos;
    const parsed = updatedCargos[0];

    expect(parsed.weightMt).toEqual(expect.objectContaining({ value: 5500 }));
    expect(parsed.weightMtMin).toBe(5000);
    expect(parsed.weightMtMax).toBe(5500);
  });

  it('single definite value: weight_mt = weight_mt_min = weight_mt_max', async () => {
    const emailBody = 'Sugar 10000 MT, Santos to Chittagong, laycan 1/5 July 2026';
    const session = makeSession({
      emails: [makeCargoEmail('email-single', emailBody)],
      classifications: [makeClassification('email-single')],
    });
    mockGetSession.mockReturnValue(session);

    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Santos', confidence: 'confirmed', source_text: 'Santos' },
        destination_port: { value: 'Chittagong', confidence: 'confirmed', source_text: 'Chittagong' },
        cargo_description: { value: 'Sugar', confidence: 'confirmed', source_text: 'Sugar 10000 MT' },
        weight_mt: { value: 10000, confidence: 'confirmed', source_text: '10000 MT' },
        weight_mt_min: 10000,
        weight_mt_max: 10000,
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number }; weightMtMin: number | null; weightMtMax: number | null }> }).parsedCargos;
    const parsed = updatedCargos[0];

    expect(parsed.weightMt).toEqual(expect.objectContaining({ value: 10000 }));
    expect(parsed.weightMtMin).toBe(10000);
    expect(parsed.weightMtMax).toBe(10000);
  });
});

// ─── 5. source_text verbatim invariant ───────────────────────────────────────

describe('γv-02: source_text verbatim copy invariant', () => {
  /**
   * source_text MUST be a verbatim substring of the email body.
   * The route does not validate this at the data layer — the LLM is responsible.
   * These tests verify that when the LLM returns verbatim source_text,
   * it is preserved through parsing and stored in ConfidenceField.sourceText.
   */
  it('source_text from LLM is preserved in parsed ConfidenceField.sourceText', async () => {
    const emailBody = 'Load: Rotterdam. Discharge: Singapore. Cargo: wheat, 28,000 mts (10% MOLOO). Laycan 1/5 May 2026.';
    const session = makeSession({
      emails: [makeCargoEmail('email-st', emailBody)],
      classifications: [makeClassification('email-st')],
    });
    mockGetSession.mockReturnValue(session);

    const verbatimSourceText = '28,000 mts (10% MOLOO)';
    // Verify the source_text is actually in the email body (verbatim subset check)
    expect(emailBody).toContain(verbatimSourceText);

    mockCallAiJson.mockResolvedValue({
      items: [{
        origin_port: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Load: Rotterdam' },
        destination_port: { value: 'Singapore', confidence: 'confirmed', source_text: 'Discharge: Singapore' },
        cargo_description: { value: 'wheat', confidence: 'confirmed', source_text: 'Cargo: wheat' },
        weight_mt: { value: 28000, confidence: 'confirmed', source_text: verbatimSourceText },
        weight_mt_min: 25200,
        weight_mt_max: 30800,
        cargo_type: 'BULK',
      }],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number; sourceText?: string }; originPort: { sourceText?: string } }> }).parsedCargos;
    const parsed = updatedCargos[0];

    // source_text preserved verbatim in ConfidenceField
    expect(parsed.weightMt?.sourceText).toBe(verbatimSourceText);
    expect(parsed.originPort?.sourceText).toBe('Load: Rotterdam');
  });

  it('multi-item email: source_text preserved for each item independently', async () => {
    const emailBody = `
Inquiry 1: Corn 5000 mt from Santos to Hamburg. Laycan 1/10 June.
Inquiry 2: Soybeans 8000 mt from Paranagua to Antwerp. Laycan 15/20 June.
    `.trim();
    const session = makeSession({
      emails: [makeCargoEmail('email-multi', emailBody)],
      classifications: [makeClassification('email-multi')],
    });
    mockGetSession.mockReturnValue(session);

    mockCallAiJson.mockResolvedValue({
      items: [
        {
          origin_port: { value: 'Santos', confidence: 'confirmed', source_text: 'Santos' },
          destination_port: { value: 'Hamburg', confidence: 'confirmed', source_text: 'Hamburg' },
          cargo_description: { value: 'Corn', confidence: 'confirmed', source_text: 'Corn 5000 mt' },
          weight_mt: { value: 5000, confidence: 'confirmed', source_text: 'Corn 5000 mt' },
          cargo_type: 'BULK',
        },
        {
          origin_port: { value: 'Paranagua', confidence: 'confirmed', source_text: 'Paranagua' },
          destination_port: { value: 'Antwerp', confidence: 'confirmed', source_text: 'Antwerp' },
          cargo_description: { value: 'Soybeans', confidence: 'confirmed', source_text: 'Soybeans 8000 mt' },
          weight_mt: { value: 8000, confidence: 'confirmed', source_text: 'Soybeans 8000 mt' },
          cargo_type: 'BULK',
        },
      ],
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);

    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { sourceText?: string } }> }).parsedCargos;
    expect(updatedCargos).toHaveLength(2);
    expect(updatedCargos[0].weightMt?.sourceText).toBe('Corn 5000 mt');
    expect(updatedCargos[1].weightMt?.sourceText).toBe('Soybeans 8000 mt');
  });

  it('concurrent batch of 5 emails: each gets correct source_text independently', async () => {
    const corpus = [
      { id: 'e1', body: 'Iron ore 50000 mt Richards Bay to Qingdao, laycan 1/5 June' },
      { id: 'e2', body: 'Coal 25000 mt from Kembla to Colombo, FIO SHINC' },
      { id: 'e3', body: 'Wheat abt 14000 mt (5% MOLOO) Novorossiysk to Alexandria' },
      { id: 'e4', body: 'Fertilizer 8000/10000 MT bulk, Aqaba to Chittagong' },
      { id: 'e5', body: 'Steel coils 3500 mt BREAK_BULK Pohang to Rotterdam' },
    ];

    const session = makeSession({
      emails: corpus.map(c => makeCargoEmail(c.id, c.body)),
      classifications: corpus.map(c => makeClassification(c.id)),
    });
    mockGetSession.mockReturnValue(session);

    // Each call returns unique source_text tied to that email
    mockCallAiJson.mockImplementation(async (_scope, _system, user) => {
      if (user.includes('Richards Bay')) {
        return { items: [{ origin_port: { value: 'Richards Bay', confidence: 'confirmed', source_text: 'Richards Bay' }, weight_mt: { value: 50000, confidence: 'confirmed', source_text: '50000 mt' }, cargo_type: 'BULK', destination_port: null }] };
      }
      if (user.includes('Kembla')) {
        return { items: [{ origin_port: { value: 'Kembla', confidence: 'confirmed', source_text: 'Kembla' }, weight_mt: { value: 25000, confidence: 'confirmed', source_text: '25000 mt' }, cargo_type: 'BULK', destination_port: null }] };
      }
      if (user.includes('MOLOO')) {
        return { items: [{ origin_port: { value: 'Novorossiysk', confidence: 'confirmed', source_text: 'Novorossiysk' }, weight_mt: { value: 14000, confidence: 'interpreted', source_text: 'abt 14000 mt (5% MOLOO)' }, weight_mt_min: 13300, weight_mt_max: 14700, cargo_type: 'BULK', destination_port: null }] };
      }
      if (user.includes('8000/10000')) {
        return { items: [{ origin_port: { value: 'Aqaba', confidence: 'confirmed', source_text: 'Aqaba' }, weight_mt: { value: 10000, confidence: 'interpreted', source_text: '8000/10000 MT bulk' }, weight_mt_min: 8000, weight_mt_max: 10000, cargo_type: 'BULK', destination_port: null }] };
      }
      return { items: [{ origin_port: { value: 'Pohang', confidence: 'confirmed', source_text: 'Pohang' }, weight_mt: { value: 3500, confidence: 'confirmed', source_text: '3500 mt' }, cargo_type: 'BREAK_BULK', destination_port: null }] };
    });

    const req = makeRequest('sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(5);

    // MOLOO item: weight_mt nominal, not max
    const updatedCargos = (mockUpdateSession.mock.calls[0][1] as { parsedCargos: Array<{ weightMt: { value: number; sourceText?: string }; weightMtMin: number | null; weightMtMax: number | null }> }).parsedCargos;
    const molooItem = updatedCargos.find(c => c.weightMtMax === 14700);
    expect(molooItem).toBeDefined();
    expect(molooItem?.weightMt.value).toBe(14000); // nominal, not 14700
    expect(molooItem?.weightMt.sourceText).toBe('abt 14000 mt (5% MOLOO)');

    // RANGE item: weight_mt = upper bound
    const rangeItem = updatedCargos.find(c => c.weightMtMax === 10000 && c.weightMtMin === 8000);
    expect(rangeItem).toBeDefined();
    expect(rangeItem?.weightMt.value).toBe(10000); // upper bound
  });
});
