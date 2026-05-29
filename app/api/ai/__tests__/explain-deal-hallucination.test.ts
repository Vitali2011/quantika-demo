/**
 * Behavioral eval: #589 AI Deal Analysis hallucination guard.
 *
 * PBT principles: regex-extract numerics from LLM response text,
 * cross-check against match payload. Three fixture matches covering
 * the QA-walker failure scenario (50k MT invented, 55.5k DWCC invented).
 *
 * PI2: exercises real validator functions + real route retry logic.
 * callAiText is mocked (no live Gemini call) but the validator and
 * route wiring run the actual production code.
 */
import {
  extractSpecNumbers,
  buildPayloadNumberSet,
  validateExplainDealResponse,
  buildRetryPrompt,
  stripInventedContent,
} from '@/lib/explain-deal-validator';
import { POST } from '@/app/api/ai/explain-deal/route';
import { NextRequest } from 'next/server';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

// ── Mocks (same infrastructure as explain-deal.test.ts) ────────────────────────

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

/** Fixture A: vessel DWT=58000, cargo weightMt=null — matches the QA-walker reported case. */
const fixtureMatchA: Match = {
  cargoEmailId: 'c-qa',
  cargoItemIndex: 0,
  vesselEmailId: 'v-qa',
  vesselItemIndex: 0,
  score: 74,
  matchLevel: 'good',
  matchReasons: ['Bulk carrier for bulk cargo', 'Route aligns'],
  issues: [],
};

const fixtureCargoA: ParsedCargo = {
  emailId: 'c-qa',
  itemIndex: 0,
  originPort: { value: 'Constanta', confidence: 'confirmed' },
  originCountry: 'RO',
  destinationPort: { value: 'Alexandria', confidence: 'confirmed' },
  destinationCountry: 'EG',
  cargoDescription: { value: 'bulk grain', confidence: 'confirmed' },
  weightMt: null,         // no weight specified — LLM must NOT invent one
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
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  stowageFactor: null,
  missingInfo: ['weight'],
};

const fixtureVesselA: ParsedVessel = {
  emailId: 'v-qa',
  itemIndex: 0,
  vesselName: { value: 'MV Black Sea Star', confidence: 'confirmed' },
  imo: '9876543',
  flag: 'GR',
  built: 2018,
  classSociety: 'LR',
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
  geared: false,
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

/** Fixture B: both cargo weight and vessel DWT available. */
const fixtureMatchB: Match = {
  cargoEmailId: 'c-b',
  cargoItemIndex: 0,
  vesselEmailId: 'v-b',
  vesselItemIndex: 0,
  score: 88,
  matchLevel: 'good',
  matchReasons: ['DWT fits', 'Geared for grab-discharge'],
  issues: [],
};

const fixtureCargoB: ParsedCargo = {
  ...fixtureCargoA,
  emailId: 'c-b',
  weightMt: { value: 35000, confidence: 'confirmed' },
  weightMtMin: 33000,
  weightMtMax: 37000,
  cargoDescription: { value: 'coal', confidence: 'confirmed' },
};

const fixtureVesselB: ParsedVessel = {
  ...fixtureVesselA,
  emailId: 'v-b',
  vesselName: { value: 'MV Coal Runner', confidence: 'confirmed' },
  dwtSummer: { value: 42000, confidence: 'confirmed' },
  geared: true,
};

/** Fixture C: economics available. */
const fixtureMatchC: Match = {
  ...fixtureMatchA,
  cargoEmailId: 'c-c',
  vesselEmailId: 'v-c',
  economics: {
    breakdown: {
      bunkerCost: 85000,
      bunkerPort: 'Fujairah',
      euEtsAmount: 0,
      euEtsApplicable: false,
      warRiskPremium: 0,
      warRiskZones: [],
    },
    totalUsd: 92000,
    calculatedAt: '2026-07-01T00:00:00Z',
    dataFreshness: { bunker: '2026-07-01T00:00:00Z', eua: '2026-07-01T00:00:00Z' },
  },
};

// ── Unit tests: extractSpecNumbers ────────────────────────────────────────────

describe('extractSpecNumbers', () => {
  it('extracts comma-formatted large numbers', () => {
    const nums = extractSpecNumbers('The vessel has 58,000 DWT and 55,500 DWCC.');
    expect(nums).toContain(58000);
    expect(nums).toContain(55500);
  });

  it('ignores numbers below threshold (scores, percentages, small counts)', () => {
    const nums = extractSpecNumbers('Score 82/100. Commission 1.25%. Holds: 5. Built 2018.');
    expect(nums).toHaveLength(0);
  });

  it('ignores year-like numbers', () => {
    const nums = extractSpecNumbers('Built in 2015, open from 2026.');
    expect(nums).toHaveLength(0);
  });

  it('returns unique values', () => {
    const nums = extractSpecNumbers('50,000 MT parcel. Approx 50,000 MT.');
    expect(nums).toEqual([50000]);
  });

  it('extracts numbers without unit context', () => {
    const nums = extractSpecNumbers('The cargo stem is approximately 28000.');
    expect(nums).toContain(28000);
  });
});

// ── Unit tests: buildPayloadNumberSet ─────────────────────────────────────────

describe('buildPayloadNumberSet', () => {
  it('includes vessel DWT in allowlist', () => {
    const nums = buildPayloadNumberSet(fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(nums.has(58000)).toBe(true);
  });

  it('excludes cargo weight when null; includes vessel DWT and IMO string-number', () => {
    const nums = buildPayloadNumberSet(fixtureMatchA, fixtureCargoA, fixtureVesselA);
    // fixtureVesselA.imo = '9876543' — extracted from string field to prevent false-positive strips
    expect(nums.has(58000)).toBe(true);   // vessel DWT
    expect(nums.has(9876543)).toBe(true); // IMO number from string field
    // no cargo weight added (weightMt null)
    expect(nums.has(50000)).toBe(false);
    expect(nums.has(55500)).toBe(false);
  });

  it('includes cargo weightMt and weightMtMin/Max when present', () => {
    const nums = buildPayloadNumberSet(fixtureMatchB, fixtureCargoB, fixtureVesselB);
    expect(nums.has(35000)).toBe(true);
    expect(nums.has(33000)).toBe(true);
    expect(nums.has(37000)).toBe(true);
    expect(nums.has(42000)).toBe(true);
  });

  it('includes economics values when present', () => {
    const nums = buildPayloadNumberSet(fixtureMatchC, fixtureCargoA, fixtureVesselA);
    expect(nums.has(85000)).toBe(true);
    expect(nums.has(92000)).toBe(true);
  });

  it('excludes year-like built year', () => {
    const nums = buildPayloadNumberSet(fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(nums.has(2018)).toBe(false);
  });
});

// ── Unit tests: validateExplainDealResponse ───────────────────────────────────

describe('validateExplainDealResponse — QA walker failure scenario', () => {
  it('flags invented 50,000 MT when cargo.weightMt is null', () => {
    const text =
      'This is a 50,000 MT grain parcel suitable for the vessel 55,500 MT DWCC.';
    const result = validateExplainDealResponse(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(result.valid).toBe(false);
    expect(result.inventedNumbers).toContain(50000);
    expect(result.inventedNumbers).toContain(55500);
  });

  it('passes when response cites actual vessel DWT (58,000)', () => {
    const text =
      'MV Black Sea Star has a DWT of 58,000 MT. Cargo weight is not specified in this inquiry.';
    const result = validateExplainDealResponse(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(result.valid).toBe(true);
    expect(result.inventedNumbers).toHaveLength(0);
  });

  it('passes when response cites all payload numbers for fixture B', () => {
    const text =
      'MV Coal Runner (42,000 DWT) is well suited for the 35,000 MT coal stem (tolerance 33,000–37,000 MT).';
    const result = validateExplainDealResponse(text, fixtureMatchB, fixtureCargoB, fixtureVesselB);
    expect(result.valid).toBe(true);
  });

  it('flags a number close to but outside 2% tolerance of DWT', () => {
    // 55,500 vs 58,000 DWT: 4.3% diff — exceeds 2% tolerance
    const text = 'The vessel is 55,500 DWT, a close match for the parcel.';
    const result = validateExplainDealResponse(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(result.valid).toBe(false);
    expect(result.inventedNumbers).toContain(55500);
  });

  it('passes when response number is within 2% tolerance of payload number', () => {
    // 58500 vs 58000 DWT: 0.86% diff — within tolerance
    const text = 'The vessel is approximately 58,500 DWT.';
    const result = validateExplainDealResponse(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(result.valid).toBe(true);
  });
});

// ── Unit tests: buildRetryPrompt ──────────────────────────────────────────────

describe('buildRetryPrompt', () => {
  it('includes invented numbers in the correction notice', () => {
    const payload = new Set<number>([58000]);
    const retry = buildRetryPrompt('Original prompt', [50000, 55500], payload);
    expect(retry).toContain('50000');
    expect(retry).toContain('55500');
    expect(retry).toContain('CORRECTION REQUIRED');
  });

  it('lists payload numbers as allowed values', () => {
    const payload = new Set<number>([58000, 35000]);
    const retry = buildRetryPrompt('Original prompt', [50000], payload);
    expect(retry).toContain('58000');
    expect(retry).toContain('35000');
  });

  it('preserves the original prompt', () => {
    const payload = new Set<number>([58000]);
    const retry = buildRetryPrompt('MATCH DATA (index 0):', [50000], payload);
    expect(retry).toContain('MATCH DATA (index 0):');
  });
});

// ── Unit tests: stripInventedContent (R2 strip-not-retry) ────────────────────

describe('stripInventedContent — numeric stripping (#589 R2)', () => {
  it('strips comma-formatted invented numbers', () => {
    const text = 'A 50,000 MT grain parcel for the vessel.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).not.toContain('50,000');
    expect(r.text).toContain('[redacted: not in match data]');
    expect(r.inventedNumbers).toContain(50000);
  });

  it('strips unformatted 4+ digit invented numbers (e.g. 50000 without comma)', () => {
    const text = 'The cargo is 50000 MT and DWCC 55500 MT.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).not.toMatch(/\b50000\b/);
    expect(r.text).not.toMatch(/\b55500\b/);
    expect(r.inventedNumbers).toEqual(expect.arrayContaining([50000, 55500]));
  });

  it('preserves payload numbers (58,000 DWT is real for fixtureA)', () => {
    const text = 'MV Black Sea Star has 58,000 DWT.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).toContain('58,000');
    expect(r.inventedNumbers).toHaveLength(0);
  });

  it('preserves numbers within 2% tolerance', () => {
    const text = 'The vessel is approximately 58,500 DWT.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).toContain('58,500');
    expect(r.inventedNumbers).toHaveLength(0);
  });

  it('does not strip year-like numbers (2018, 2026)', () => {
    const text = 'Built in 2018, open from 2026-07-01.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).toContain('2018');
    expect(r.text).toContain('2026');
  });

  it('does not strip small numbers (scores, hold counts)', () => {
    const text = 'Score 74/100 with 5 holds and 5 hatches.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).toContain('74');
    expect(r.text).toContain('5 holds');
  });
});

describe('stripInventedContent — qualitative tokens (#589 R2)', () => {
  it('strips stowage factor mentions when cargo.stowageFactor is null', () => {
    const text = 'The cargo has a stowage factor of 1.25 m³/MT.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).not.toContain('1.25');
    expect(r.text).toContain('[redacted: stowage factor not in match data]');
    expect(r.forbiddenTokens.some((t) => /stowage\s*factor/i.test(t))).toBe(true);
  });

  it('strips invented class society (DNV when vessel.classSociety=LR)', () => {
    const text = 'The vessel is DNV classed and operates under Greek flag.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).not.toContain('DNV');
    expect(r.text).toContain('[redacted: class society not in match data]');
    expect(r.forbiddenTokens).toContain('DNV');
  });

  it('preserves the payload-listed class society (LR)', () => {
    const text = 'The vessel is LR classed.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).toContain('LR');
    expect(r.forbiddenTokens.filter((t) => t === 'LR')).toHaveLength(0);
  });

  it('strips ABS/NK/BV/RINA when not in payload', () => {
    const text = 'Class: ABS. Survey by BV recently. Listed in NK registry.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).not.toContain('ABS');
    expect(r.text).not.toContain('BV');
    expect(r.text).not.toContain('NK');
  });

  it('strips gear status when vessel.geared is null', () => {
    const vesselNullGear: ParsedVessel = { ...fixtureVesselA, geared: null };
    const text = 'The vessel is gearless, with no cranes onboard.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, vesselNullGear);
    expect(r.text).not.toContain('gearless');
    expect(r.text).toContain('[redacted: gear status not in match data]');
    expect(r.forbiddenTokens).toContain('gearless');
  });

  it('does NOT strip gear status when vessel.geared is explicit (false in fixtureA)', () => {
    // fixtureVesselA.geared = false — payload provides this field
    const text = 'The vessel is gearless.';
    const r = stripInventedContent(text, fixtureMatchA, fixtureCargoA, fixtureVesselA);
    expect(r.text).toContain('gearless');
    expect(r.forbiddenTokens).not.toContain('gearless');
  });

  it('preserves stowage factor when cargo.stowageFactor is provided', () => {
    const cargoWithSF: ParsedCargo = { ...fixtureCargoA, stowageFactor: '1.30' };
    const text = 'The cargo stowage factor of 1.30 is typical for coal.';
    const r = stripInventedContent(text, fixtureMatchA, cargoWithSF, fixtureVesselA);
    expect(r.text).toContain('1.30');
  });
});

// ── Behavioral: route retry flow ──────────────────────────────────────────────

describe('POST /api/ai/explain-deal — hallucination retry (#589)', () => {
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
    id: 'sess-qa',
    accessToken: 'tok',
    createdAt: new Date(),
    emails: [],
    classifications: [],
    processedEmails: [],
    parsedCargos: [fixtureCargoA],
    parsedVessels: [fixtureVesselA],
    parsedFixtureRecaps: [],
    matches: [fixtureMatchA],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
  };

  it('strips invented numbers from response (R2: no retry, post-process inline)', async () => {
    mockGetSession.mockReturnValue(baseSession);

    // Hallucinated response: 50,000 MT and 55,500 MT DWCC are NOT in the payload
    // (cargoWeight=null, dwcc=null, only dwt=58000 is real).
    const hallucinatedResponse =
      'Market Context\nGrain market is active.\n\n' +
      'Deal Rationale\nThis 50,000 MT grain parcel fits the 55,500 MT DWCC vessel well.\n\n' +
      'Key Risks\n- Tight laycan\n\n' +
      'Recommended Next Steps\nContact owner.';

    mockCallAiText.mockResolvedValueOnce(hallucinatedResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-qa');
    const res = await POST(req);

    expect(res.status).toBe(200);
    // R2: strip-not-retry — exactly one LLM call, then post-process
    expect(mockCallAiText).toHaveBeenCalledTimes(1);

    const body = await res.json();
    const rationale = body.sections.find(
      (s: { heading: string }) => s.heading === 'Deal Rationale',
    );
    // Invented numerics replaced with redaction marker; no raw "50,000" or "55,500"
    expect(rationale?.content).not.toContain('50,000');
    expect(rationale?.content).not.toContain('55,500');
    expect(rationale?.content).toContain('[redacted: not in match data]');
    // Warnings exposed in response metadata
    expect(body.warnings).toBeDefined();
    const numericWarning = body.warnings.find(
      (w: { type: string }) => w.type === 'invented_numerics',
    );
    expect(numericWarning?.values).toEqual(expect.arrayContaining([50000, 55500]));
  });

  it('does not retry when first LLM response has no invented numbers', async () => {
    mockGetSession.mockReturnValue(baseSession);

    const validResponse =
      'Market Context\nBlack Sea grain exports are seasonal.\n\n' +
      'Deal Rationale\nMV Black Sea Star (58,000 DWT) can handle this bulk inquiry. Cargo weight is not specified.\n\n' +
      'Key Risks\n- Cargo weight unconfirmed\n\n' +
      'Recommended Next Steps\nRequest cargo weight from charterer.';

    mockCallAiText.mockResolvedValueOnce(validResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-qa');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
  });

  it('anchor prompt includes NOT_PROVIDED markers and FORBIDDEN clause', async () => {
    mockGetSession.mockReturnValue(baseSession);

    const validResponse =
      'Market Context\nGrain market.\n\n' +
      'Deal Rationale\nVessel 58,000 DWT suits bulk grain. Weight not specified.\n\n' +
      'Key Risks\n- Weight unknown\n\n' +
      'Recommended Next Steps\nConfirm weight.';

    mockCallAiText.mockResolvedValueOnce(validResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-qa');
    await POST(req);

    // R2 hard-anchor: prompt must list NOT_PROVIDED for missing fields and
    // include the FORBIDDEN section so Gemini knows what to skip.
    const [, , userPrompt] = mockCallAiText.mock.calls[0];
    expect(userPrompt).toContain('MATCH PAYLOAD');
    expect(userPrompt).toContain('NOT_PROVIDED');
    expect(userPrompt).toContain('cargo.weight_mt: NOT_PROVIDED');
    expect(userPrompt).toContain('vessel.dwcc: NOT_PROVIDED');
    expect(userPrompt).toContain('cargo.stowage_factor: NOT_PROVIDED');
    expect(userPrompt).toContain('FORBIDDEN');
    expect(userPrompt).toContain('vessel.dwt_summer: 58000 MT');
  });
});
