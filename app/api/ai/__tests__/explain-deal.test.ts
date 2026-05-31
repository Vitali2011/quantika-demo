/**
 * Tests for POST /api/ai/explain-deal — γv-11
 *
 * Verifies: feature flag, auth, input validation, shim delegation,
 * all 4 sections in output, language hint (EN + AR), timeout error.
 */
import { POST } from '@/app/api/ai/explain-deal/route';
import { NextRequest } from 'next/server';
import type { SessionData, Match, ParsedCargo, ParsedVessel } from '@/lib/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/ai-provider');
jest.mock('@/lib/csrf', () => ({ validateCsrf: jest.fn().mockReturnValue(true) }));
jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  const getSession = jest.fn();
  return {
    getSession,
    requireSession: (req: { cookies: { get: (n: string) => { value: string } | undefined } }) => {
      const sid = req.cookies.get('session_id')?.value;
      if (!sid) return NextResponse.json({ error: 'No session' }, { status: 401 });
      const s = getSession(sid);
      if (!s) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      return { session: s, sessionId: sid };
    },
  };
});
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => ({ prepare: jest.fn(() => ({ run: jest.fn() })) })),
  })),
}));

import { callAiText } from '@/lib/ai-provider';
import { getSession } from '@/lib/session';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseMatch: Match = {
  cargoEmailId: 'c1',
  cargoItemIndex: 0,
  vesselEmailId: 'v1',
  vesselItemIndex: 0,
  score: 82,
  matchLevel: 'good',
  matchReasons: ['DWT fits', 'Route aligns'],
  issues: [],
};

const baseCargo: ParsedCargo = {
  emailId: 'c1',
  itemIndex: 0,
  originPort: { value: 'Dubai', confidence: 'confirmed' },
  originCountry: 'AE',
  destinationPort: { value: 'Singapore', confidence: 'confirmed' },
  destinationCountry: 'SG',
  cargoDescription: { value: 'steel coils', confidence: 'confirmed' },
  weightMt: { value: 25000, confidence: 'confirmed' },
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'BULK',
  containerType: null,
  quantity: null,
  incoterms: 'FOB',
  preferredDates: null,
  laycan: '2026-06-01/15',
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: [],
};

const baseVessel: ParsedVessel = {
  emailId: 'v1',
  itemIndex: 0,
  vesselName: { value: 'MV Test Star', confidence: 'confirmed' },
  imo: '1234567',
  flag: 'PA',
  built: 2015,
  classSociety: 'BV',
  pandi: null,
  dwtSummer: { value: 28000, confidence: 'confirmed' },
  dwcc: null,
  draftMax: null,
  loa: null,
  beam: null,
  grt: null,
  nrt: null,
  holdsCount: 4,
  hatchesCount: 4,
  grainCapacity: null,
  grainCapacityUnit: null,
  baleCapacity: null,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: true,
  craneCapacity: '25T',
  hatchType: null,
  vesselType: 'bulk carrier',
  openPosition: { value: 'Dubai', confidence: 'confirmed' },
  openDate: { value: '2026-06-01', confidence: 'confirmed' },
  direction: null,
  restrictions: [],
  lastCargoes: null,
  speedLaden: null,
  speedBallast: null,
  consumption: null,
  deckCapacity: null,
  specialFeatures: [],
};

const baseSession: SessionData = {
  id: 'sess-1',
  accessToken: 'tok',
  createdAt: new Date(),
  emails: [],
  classifications: [],
  processedEmails: [],
  parsedCargos: [baseCargo],
  parsedVessels: [baseVessel],
  parsedFixtureRecaps: [],
  matches: [baseMatch],
  recaps: [],
  commissionSummary: null,
  counterparties: [],
};

/** Build a 4-section EN response body (as the LLM would return) */
const EN_NARRATIVE = `Market Context
Steel coil demand from Middle East is strong in Q2 2026. Bunker prices are elevated.

Deal Rationale
MV Test Star has DWT of 28,000 MT vs cargo 25,000 MT — good fit with 12% margin.

Key Risks
- Port congestion at Singapore
- Weather risk on the Arabian Sea route
- ETS costs may impact TCE

Recommended Next Steps
Contact vessel owners to confirm open position. Negotiate demurrage terms.`;

const AR_NARRATIVE = `سياق السوق
الطلب على ملفات الصلب من الشرق الأوسط قوي في الربع الثاني من 2026.

مبررات الصفقة
سفينة MV Test Star بحمولة 28,000 طن مناسبة للبضاعة 25,000 طن.

المخاطر الرئيسية
- ازدحام ميناء سنغافورة
- مخاطر الطقس في بحر العرب

الخطوات التالية الموصى بها
تواصل مع ملاك السفينة لتأكيد الموضع المفتوح.`;

function makeRequest(
  body: unknown,
  sessionId?: string,
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
  };
  if (sessionId) headers['cookie'] = `session_id=${sessionId}`;
  return new NextRequest('http://localhost/api/ai/explain-deal', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/ai/explain-deal', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, EXPLAIN_DEAL_ENABLED: 'true' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Feature flag ───────────────────────────────────────────────────────────

  it('returns 403 feature_disabled when EXPLAIN_DEAL_ENABLED is not set', async () => {
    delete process.env.EXPLAIN_DEAL_ENABLED;
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('feature_disabled');
  });

  it('returns 403 feature_disabled when EXPLAIN_DEAL_ENABLED=false', async () => {
    process.env.EXPLAIN_DEAL_ENABLED = 'false';
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('feature_disabled');
  });

  it('proceeds when EXPLAIN_DEAL_ENABLED=true', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('returns 401 when no session cookie', async () => {
    const req = makeRequest({ matchIndex: 0 });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    const req = makeRequest({ matchIndex: 0 }, 'bad-session');
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it('returns 400 on missing matchIndex', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({}, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on negative matchIndex', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({ matchIndex: -1 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-integer matchIndex', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({ matchIndex: 1.5 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid language value', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({ matchIndex: 0, language: 'fr' }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when matchIndex out of bounds', async () => {
    mockGetSession.mockReturnValue(baseSession);
    const req = makeRequest({ matchIndex: 99 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── Shim delegation ────────────────────────────────────────────────────────

  it('calls callAiText with EXPLAIN_DEAL scope', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    await POST(req);
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    const [scope] = mockCallAiText.mock.calls[0];
    expect(scope).toBe('EXPLAIN_DEAL');
  });

  it('passes system prompt and user prompt to callAiText', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    await POST(req);
    const [, systemPrompt, userPrompt] = mockCallAiText.mock.calls[0];
    expect(systemPrompt).toContain('Market Context');
    expect(userPrompt).toContain('Dubai');
    expect(userPrompt).toContain('82'); // match score
  });

  // ── 4-section output ───────────────────────────────────────────────────────

  it('returns 4 sections in EN response', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toHaveLength(4);
    expect(body.sections.map((s: { heading: string }) => s.heading)).toEqual([
      'Market Context',
      'Deal Rationale',
      'Key Risks',
      'Recommended Next Steps',
    ]);
  });

  it('each section has non-empty content in EN response', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    for (const section of body.sections as { heading: string; content: string }[]) {
      expect(section.content.length).toBeGreaterThan(0);
    }
  });

  it('Market Context section contains market-relevant text', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    const mc = body.sections.find((s: { heading: string }) => s.heading === 'Market Context');
    expect(mc?.content).toContain('Steel coil');
  });

  it('Key Risks section contains risk text', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    const risks = body.sections.find((s: { heading: string }) => s.heading === 'Key Risks');
    expect(risks?.content).toContain('congestion');
  });

  it('Recommended Next Steps contains action text', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    const steps = body.sections.find((s: { heading: string }) => s.heading === 'Recommended Next Steps');
    expect(steps?.content).toContain('Contact');
  });

  // ── Language hint ──────────────────────────────────────────────────────────

  it('passes Arabic system prompt when language=ar', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(AR_NARRATIVE);
    const req = makeRequest({ matchIndex: 0, language: 'ar' }, 'sess-1');
    await POST(req);
    const [, systemPrompt] = mockCallAiText.mock.calls[0];
    // Arabic system prompt contains Arabic text
    expect(systemPrompt).toContain('سياق السوق');
  });

  it('returns Arabic section headers when language=ar', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(AR_NARRATIVE);
    const req = makeRequest({ matchIndex: 0, language: 'ar' }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.language).toBe('ar');
    expect(body.sections.map((s: { heading: string }) => s.heading)).toEqual([
      'سياق السوق',
      'مبررات الصفقة',
      'المخاطر الرئيسية',
      'الخطوات التالية الموصى بها',
    ]);
  });

  it('defaults to EN when language is not specified', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    expect(body.language).toBe('en');
  });

  // ── Response shape ─────────────────────────────────────────────────────────

  it('response includes model field', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValue(EN_NARRATIVE);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    expect(body.model).toBeTruthy();
  });

  // ── Timeout error ──────────────────────────────────────────────────────────

  it('returns 504 with retryable flag on LLMTimeoutError', async () => {
    const { LLMTimeoutError } = jest.requireActual('@/lib/openai') as {
      LLMTimeoutError: new (msg: string) => Error;
    };
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new LLMTimeoutError('timed out'));
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('ai_timeout');
    expect(body.retryable).toBe(true);
  });

  it('re-throws non-timeout errors', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockRejectedValue(new Error('unexpected'));
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    await expect(POST(req)).rejects.toThrow('unexpected');
  });

  // Regression: parseSections must anchor header matches so prose mentions
  // like "Considering the Market Context" don't false-split a section.
  it('does not false-match header inside body prose', async () => {
    mockGetSession.mockReturnValue(baseSession);
    // Model output where "Market Context" appears INSIDE Deal Rationale prose
    // before the real "Deal Rationale" header — naive indexOf would split here.
    mockCallAiText.mockResolvedValue(`Market Context
Bulk freight market is firm.

Deal Rationale
Considering the Market Context above, this vessel matches the cargo well.
DWT 25,000 fits the stem of 20,000 MT.

Key Risks
- Tight laycan window
- Port congestion at discharge

Recommended Next Steps
Verify vessel certificates and confirm bunker plan.`);
    const req = makeRequest({ matchIndex: 0 }, 'sess-1');
    const res = await POST(req);
    const body = await res.json();
    const drs = body.sections.find((s: { heading: string }) => s.heading === 'Deal Rationale');
    // Deal Rationale must contain its full prose, not be truncated at the
    // "Market Context" mention.
    expect(drs.content).toContain('Considering the Market Context above');
    expect(drs.content).toContain('DWT 25,000');
  });

  // ── Demo mode ──────────────────────────────────────────────────────────────

  describe('DEMO_MODE', () => {
    const origDemo = process.env.DEMO_MODE;

    beforeEach(() => {
      process.env.DEMO_MODE = 'true';
    });

    afterEach(() => {
      if (origDemo === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = origDemo;
    });

    it('returns 200 with 4 EN sections without calling callAiText', async () => {
      mockGetSession.mockReturnValue(baseSession);
      const req = makeRequest({ matchIndex: 0 }, 'sess-1');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockCallAiText).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.sections).toHaveLength(4);
      expect(body.sections.map((s: { heading: string }) => s.heading)).toEqual([
        'Market Context',
        'Deal Rationale',
        'Key Risks',
        'Recommended Next Steps',
      ]);
    });

    it('returns model="demo" and language="en"', async () => {
      mockGetSession.mockReturnValue(baseSession);
      const req = makeRequest({ matchIndex: 0 }, 'sess-1');
      const res = await POST(req);
      const body = await res.json();
      expect(body.model).toBe('demo');
      expect(body.language).toBe('en');
    });

    it('Deal Rationale section contains vessel name from match data', async () => {
      mockGetSession.mockReturnValue(baseSession);
      const req = makeRequest({ matchIndex: 0 }, 'sess-1');
      const res = await POST(req);
      const body = await res.json();
      const rationale = body.sections.find((s: { heading: string }) => s.heading === 'Deal Rationale');
      // baseVessel has vesselName.value = 'MV Test Star'
      expect(rationale.content).toContain('MV Test Star');
    });

    it('Deal Rationale section contains match score', async () => {
      mockGetSession.mockReturnValue(baseSession);
      const req = makeRequest({ matchIndex: 0 }, 'sess-1');
      const res = await POST(req);
      const body = await res.json();
      const rationale = body.sections.find((s: { heading: string }) => s.heading === 'Deal Rationale');
      // baseMatch has score: 82
      expect(rationale.content).toContain('82/100');
    });

    it('returns Arabic section headers when language=ar', async () => {
      mockGetSession.mockReturnValue(baseSession);
      const req = makeRequest({ matchIndex: 0, language: 'ar' }, 'sess-1');
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockCallAiText).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.language).toBe('ar');
      expect(body.sections.map((s: { heading: string }) => s.heading)).toEqual([
        'سياق السوق',
        'مبررات الصفقة',
        'المخاطر الرئيسية',
        'الخطوات التالية الموصى بها',
      ]);
    });

    it('still requires a valid session in demo mode', async () => {
      mockGetSession.mockReturnValue(null);
      const req = makeRequest({ matchIndex: 0 }, 'bad-sess');
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('still validates matchIndex bounds in demo mode', async () => {
      mockGetSession.mockReturnValue(baseSession);
      const req = makeRequest({ matchIndex: 99 }, 'sess-1');
      const res = await POST(req);
      expect(res.status).toBe(404);
    });
  });
});
