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

  it('excludes nothing when cargo has no weight (null fields)', () => {
    const nums = buildPayloadNumberSet(fixtureMatchA, fixtureCargoA, fixtureVesselA);
    // Only vessel DWT should be present; no cargo weight
    expect(nums.size).toBe(1);
    expect(nums.has(58000)).toBe(true);
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

  it('retries once when first LLM response contains invented numbers', async () => {
    mockGetSession.mockReturnValue(baseSession);

    // First call: hallucinated response (50,000 MT invented, 55,500 DWCC invented)
    const hallucinatedResponse =
      'Market Context\nGrain market is active.\n\n' +
      'Deal Rationale\nThis 50,000 MT grain parcel fits the 55,500 MT DWCC vessel well.\n\n' +
      'Key Risks\n- Tight laycan\n\n' +
      'Recommended Next Steps\nContact owner.';

    // Second call: corrected response (cites actual 58,000 DWT, no invented numbers)
    const correctedResponse =
      'Market Context\nGrain market is active in Black Sea.\n\n' +
      'Deal Rationale\nMV Black Sea Star (58,000 DWT) is suitable. Cargo weight is not specified.\n\n' +
      'Key Risks\n- Cargo weight not confirmed\n\n' +
      'Recommended Next Steps\nConfirm cargo quantity before fixing.';

    mockCallAiText
      .mockResolvedValueOnce(hallucinatedResponse)
      .mockResolvedValueOnce(correctedResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-qa');
    const res = await POST(req);

    expect(res.status).toBe(200);
    // Route must have called callAiText twice (initial + retry)
    expect(mockCallAiText).toHaveBeenCalledTimes(2);

    const body = await res.json();
    // Response should use the corrected (second) text
    const rationale = body.sections.find(
      (s: { heading: string }) => s.heading === 'Deal Rationale',
    );
    expect(rationale?.content).toContain('58,000 DWT');
    expect(rationale?.content).not.toContain('50,000 MT');
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

  it('retry prompt contains the invented numbers and correction instruction', async () => {
    mockGetSession.mockReturnValue(baseSession);

    const hallucinatedResponse =
      'Market Context\nGrain market.\n\n' +
      'Deal Rationale\n50,000 MT grain fits 55,500 DWCC.\n\n' +
      'Key Risks\n- None\n\n' +
      'Recommended Next Steps\nFix the deal.';

    const correctedResponse =
      'Market Context\nGrain market.\n\n' +
      'Deal Rationale\nVessel 58,000 DWT suits bulk grain. Weight not specified.\n\n' +
      'Key Risks\n- Weight unknown\n\n' +
      'Recommended Next Steps\nConfirm weight.';

    mockCallAiText
      .mockResolvedValueOnce(hallucinatedResponse)
      .mockResolvedValueOnce(correctedResponse);

    const req = makeRequest({ matchIndex: 0 }, 'sess-qa');
    await POST(req);

    // The second callAiText call (retry) must pass the correction prompt
    const [, , retryUserPrompt] = mockCallAiText.mock.calls[1];
    expect(retryUserPrompt).toContain('CORRECTION REQUIRED');
    expect(retryUserPrompt).toContain('50000');
    expect(retryUserPrompt).toContain('55500');
  });
});
