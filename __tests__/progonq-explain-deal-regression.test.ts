/**
 * Regression tests for #589 R3 — Gemini hallucination hardening.
 *
 * These tests lock the key invariants discovered through the progonq adversarial loop
 * (R3, 2026-05-27). They use the production validator and route code against synthetic
 * fixtures to catch regressions if prompt, validator, or buildUserPrompt is changed.
 *
 * PI2: behavioral tests using real route code (POST handler) and real validator functions.
 * PI3: do NOT relax these expectations — they represent confirmed production failures.
 *
 * Failures repaired by R3:
 *  - Gemini invented "50,000 MT" when cargo weight was NOT_PROVIDED
 *  - Gemini invented "55,500 MT DWCC" when dwcc was NOT_PROVIDED
 *  - Gemini invented "DNV" class society when not in payload
 *  - Gemini invented "gearless" status when vessel.geared was null
 *  - Progonq runner used different buildUserPrompt than production → invalid eval
 *  - buildPayloadNumberSet missed loading rates, description weights, IMO numbers
 */
import {
  extractSpecNumbers,
  buildPayloadNumberSet,
  validateExplainDealResponse,
  stripInventedContent,
} from '@/lib/explain-deal-validator';
import { buildExplainDealUserPrompt, fmtAnchorValue } from '@/lib/explain-deal-prompt';
import { POST } from '@/app/api/ai/explain-deal/route';
import { NextRequest } from 'next/server';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// ── Fixtures (QA-walker failure scenario) ─────────────────────────────────────

const nullWeightMatch: Match = {
  cargoEmailId: 'c-589',
  cargoItemIndex: 0,
  vesselEmailId: 'v-589',
  vesselItemIndex: 0,
  score: 74,
  matchLevel: 'good',
  matchReasons: ['Bulk carrier for bulk cargo'],
  issues: [],
};

const nullWeightCargo: ParsedCargo = {
  emailId: 'c-589',
  itemIndex: 0,
  originPort: { value: 'Constanta', confidence: 'confirmed' },
  originCountry: 'RO',
  destinationPort: { value: 'Alexandria', confidence: 'confirmed' },
  destinationCountry: 'EG',
  cargoDescription: { value: 'bulk grain', confidence: 'confirmed' },
  weightMt: null,
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'BULK',
  containerType: null,
  quantity: null,
  incoterms: null,
  preferredDates: null,
  laycan: '2026-07-01/15',
  loadingRate: '1500 MTPD SHINC',
  dischargeRate: '1000 MTPD SHINC',
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: ['weight'],
};

const nullClassVessel: ParsedVessel = {
  emailId: 'v-589',
  itemIndex: 0,
  vesselName: { value: 'MV Black Sea Star', confidence: 'confirmed' },
  imo: '9876543',
  flag: 'GR',
  built: 2018,
  classSociety: null,
  pandi: null,
  dwtSummer: { value: 58000, confidence: 'confirmed' },
  dwcc: null,
  draftMax: null,
  loa: null,
  beam: null,
  grt: null,
  nrt: null,
  holdsCount: 5,
  hatchesCount: 5,
  grainCapacity: null,
  grainCapacityUnit: null,
  baleCapacity: null,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: null,
  craneCapacity: null,
  hatchType: null,
  vesselType: 'bulk carrier',
  openPosition: { value: 'Constanta', confidence: 'confirmed' },
  openDate: { value: '2026-07-01', confidence: 'confirmed' },
  direction: null,
  restrictions: [],
  lastCargoes: null,
  speedLaden: null,
  speedBallast: null,
  consumption: null,
  deckCapacity: null,
  specialFeatures: [],
};

// ── R3 regression: buildPayloadNumberSet improvements ─────────────────────────

describe('buildPayloadNumberSet — R3 regression (#589)', () => {
  it('includes loading/discharge rates from string fields', () => {
    // 1500 and 1000 from loadingRate/dischargeRate strings
    const nums = buildPayloadNumberSet(nullWeightMatch, nullWeightCargo, nullClassVessel);
    expect(nums.has(1500)).toBe(true);
    expect(nums.has(1000)).toBe(true);
  });

  it('includes vessel IMO number from string field', () => {
    const nums = buildPayloadNumberSet(nullWeightMatch, nullWeightCargo, nullClassVessel);
    expect(nums.has(9876543)).toBe(true);
  });

  it('includes numbers embedded in cargo description', () => {
    const cargo: ParsedCargo = {
      ...nullWeightCargo,
      cargoDescription: { value: '15000 MT steel pipes + 3500 MT equipment', confidence: 'confirmed' },
    };
    const nums = buildPayloadNumberSet(nullWeightMatch, cargo, nullClassVessel);
    expect(nums.has(15000)).toBe(true);
    expect(nums.has(3500)).toBe(true);
  });

  it('still correctly excludes invented cargo weight when weightMt is null', () => {
    const nums = buildPayloadNumberSet(nullWeightMatch, nullWeightCargo, nullClassVessel);
    expect(nums.has(50000)).toBe(false);
    expect(nums.has(55500)).toBe(false);
  });

  it('includes custom tce/marketTce economics fields from corpus format', () => {
    const matchWithTce: Match = {
      ...nullWeightMatch,
      economics: { tce: 14200, marketTce: 15800 } as unknown as Match['economics'],
    };
    const nums = buildPayloadNumberSet(matchWithTce, nullWeightCargo, nullClassVessel);
    expect(nums.has(14200)).toBe(true);
    expect(nums.has(15800)).toBe(true);
  });
});

// ── R3 regression: buildExplainDealUserPrompt (production prompt builder) ────

describe('buildExplainDealUserPrompt — R3 production parity', () => {
  it('includes MATCH PAYLOAD anchor, NOT_PROVIDED markers, FORBIDDEN, CALIBRATION sections', () => {
    const prompt = buildExplainDealUserPrompt(nullWeightMatch, nullWeightCargo, nullClassVessel, 0);
    expect(prompt).toContain('MATCH PAYLOAD');
    expect(prompt).toContain('NOT_PROVIDED');
    expect(prompt).toContain('cargo.weight_mt: NOT_PROVIDED');
    expect(prompt).toContain('vessel.dwcc: NOT_PROVIDED');
    expect(prompt).toContain('vessel.class_society: NOT_PROVIDED');
    expect(prompt).toContain('vessel.geared: NOT_PROVIDED');
    expect(prompt).toContain('FORBIDDEN');
    expect(prompt).toContain('CALIBRATION');
    expect(prompt).toContain('vessel.dwt_summer: 58000 MT');
  });

  it('includes loading/discharge rates in anchor section', () => {
    const prompt = buildExplainDealUserPrompt(nullWeightMatch, nullWeightCargo, nullClassVessel, 0);
    expect(prompt).toContain('cargo.loading_rate: 1500 MTPD SHINC');
    expect(prompt).toContain('cargo.discharge_rate: 1000 MTPD SHINC');
  });

  it('includes supplementary context section with JSON data', () => {
    const prompt = buildExplainDealUserPrompt(nullWeightMatch, nullWeightCargo, nullClassVessel, 0);
    expect(prompt).toContain('SUPPLEMENTARY CONTEXT ONLY');
    expect(prompt).toContain('DO NOT extract any value from below');
  });

  it('calibration example shows correct vs wrong output', () => {
    const prompt = buildExplainDealUserPrompt(nullWeightMatch, nullWeightCargo, nullClassVessel, 0);
    expect(prompt).toContain('CORRECT:');
    expect(prompt).toContain('WRONG:');
    expect(prompt).toContain('50,000 and 55,500 are invented');
  });
});

// ── R3 regression: fmtAnchorValue ────────────────────────────────────────────

describe('fmtAnchorValue', () => {
  it('returns NOT_PROVIDED for null', () => expect(fmtAnchorValue(null)).toBe('NOT_PROVIDED'));
  it('returns NOT_PROVIDED for undefined', () => expect(fmtAnchorValue(undefined)).toBe('NOT_PROVIDED'));
  it('returns NOT_PROVIDED for empty string', () => expect(fmtAnchorValue('')).toBe('NOT_PROVIDED'));
  it('unwraps { value } objects', () => expect(fmtAnchorValue({ value: 'Constanta' })).toBe('Constanta'));
  it('returns NOT_PROVIDED for { value: null }', () => expect(fmtAnchorValue({ value: null })).toBe('NOT_PROVIDED'));
  it('converts numbers to string', () => expect(fmtAnchorValue(58000)).toBe('58000'));
});

// ── R3 regression: POST route + temperature ───────────────────────────────────

describe('POST /api/ai/explain-deal — R3 temperature + strip (#589)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, EXPLAIN_DEAL_ENABLED: 'true' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function makeRequest(body: unknown, sessionId: string): NextRequest {
    return new NextRequest('http://localhost/api/ai/explain-deal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: `session_id=${sessionId}`,
      },
      body: JSON.stringify(body),
    });
  }

  const baseSession = {
    id: 'sess-r3',
    accessToken: 'tok',
    createdAt: new Date(),
    emails: [],
    classifications: [],
    processedEmails: [],
    parsedCargos: [nullWeightCargo],
    parsedVessels: [nullClassVessel],
    parsedFixtureRecaps: [],
    matches: [nullWeightMatch],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
  };

  it('route passes temperature: 0.3 to callAiText (R3 hallucination fix)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValueOnce(
      'Market Context\nBlack Sea grain routes.\n\nDeal Rationale\nMV Black Sea Star (58,000 DWT). Cargo weight not specified.\n\nKey Risks\n- Weight unconfirmed\n\nRecommended Next Steps\nConfirm stem with charterer.',
    );

    const req = makeRequest({ matchIndex: 0 }, 'sess-r3');
    await POST(req);

    const [, , , opts] = mockCallAiText.mock.calls[0];
    expect((opts as { temperature?: number })?.temperature).toBe(0.3);
  });

  it('route uses buildExplainDealUserPrompt (production parity — R3 BUG-A fix)', async () => {
    mockGetSession.mockReturnValue(baseSession);
    mockCallAiText.mockResolvedValueOnce(
      'Market Context\nMarket.\n\nDeal Rationale\nDeal.\n\nKey Risks\nRisks.\n\nRecommended Next Steps\nSteps.',
    );

    const req = makeRequest({ matchIndex: 0 }, 'sess-r3');
    await POST(req);

    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    // Production builder has CALIBRATION section (absent in old runner)
    expect(userPrompt).toContain('CALIBRATION');
    expect(userPrompt).toContain('MATCH PAYLOAD');
    expect(userPrompt).toContain('SUPPLEMENTARY CONTEXT ONLY');
  });

  it('strips 50,000 MT and 55,500 DWCC hallucinations (core #589 scenario)', async () => {
    mockGetSession.mockReturnValue(baseSession);

    const hallucinatedResponse =
      'Market Context\nGrain exports active.\n\n' +
      'Deal Rationale\nThis 50,000 MT grain parcel fits the 55,500 MT DWCC vessel. DNV classed.\n\n' +
      'Key Risks\n- Tight laycan\n\n' +
      'Recommended Next Steps\nContact owner.';

    mockCallAiText.mockResolvedValueOnce(hallucinatedResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-r3');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    const rationale = body.sections.find((s: { heading: string }) => s.heading === 'Deal Rationale');
    // Hallucinated numbers stripped
    expect(rationale?.content).not.toContain('50,000');
    expect(rationale?.content).not.toContain('55,500');
    expect(rationale?.content).not.toContain('DNV');
    // Redaction markers indicate strip ran
    expect(rationale?.content).toContain('[redacted');
    // Warnings surfaced
    expect(body.warnings).toBeDefined();
    const numWarn = body.warnings?.find((w: { type: string }) => w.type === 'invented_numerics');
    expect(numWarn?.values).toEqual(expect.arrayContaining([50000, 55500]));
    const tokWarn = body.warnings?.find((w: { type: string }) => w.type === 'forbidden_tokens');
    expect(tokWarn?.values).toContain('DNV');
  });

  it('does NOT strip loading rate (1500 MTPD) from response — R3 validator fix', async () => {
    mockGetSession.mockReturnValue(baseSession);

    const validResponse =
      'Market Context\nBlack Sea routes.\n\n' +
      'Deal Rationale\nMV Black Sea Star (58,000 DWT) is suitable.\n\n' +
      'Key Risks\n- Weight unconfirmed\n\n' +
      'Recommended Next Steps\nConfirm the loading rate of 1500 MTPD SHINC with the owner.';

    mockCallAiText.mockResolvedValueOnce(validResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-r3');
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    const steps = body.sections.find((s: { heading: string }) => s.heading === 'Recommended Next Steps');
    // 1500 MTPD is from payload loadingRate — must NOT be stripped
    expect(steps?.content).toContain('1500');
    expect(body.warnings).toBeUndefined();
  });
});
