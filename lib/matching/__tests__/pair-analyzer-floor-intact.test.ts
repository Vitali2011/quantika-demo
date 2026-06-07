/**
 * TDD tests — Task 4: Economic realism floor still demotes below-breakeven pairs
 *
 * pair-analyzer.ts:829-867: after the fit loop computes m.economics for every pair,
 * the floor block iterates mainMatches and demotes any pair whose
 * m.economics.tceUsdPerDay < class-breakeven to lowConfidenceMatches.
 *
 * Breakevens (from pair-analyzer.ts:854-857):
 *   DWT ≤ 15 000 → $1 500/day
 *   DWT ≤ 40 000 → $3 000/day
 *   DWT ≤ 65 000 → $5 500/day
 *   DWT > 65 000 → $7 500/day
 *
 * Challenge after Tasks 1-3: matchLevel is now derived from fitPercent, so a
 * below-breakeven pair must still reach fitPercent ≥ 60 from non-economics
 * factors to enter mainMatches before the floor fires. We achieve this by:
 *   - using a small coaster vessel (DWT 10 000) with a tightly-fitted cargo
 *   - mocking buildMatchEconomics to return tceUsdPerDay = 500 (below $1 500 breakeven)
 *     — economics still contributes ~4/18 pts so overall fitPercent stays above 60
 *     thanks to strong utilisation + timing + ballast factors.
 *
 * PI2: calls real analyzePairs with a stubbed aiScorer — no string-match checks.
 */

import { analyzePairs } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel, EconomicsResult } from '@/lib/types';

// ── Mock buildMatchEconomics so we control the TCE returned ──────────────────
// We use jest.mock at module scope; the factory is called before any test runs.
// All other exports (parseLeadingNumber, parseConsumption, etc.) are kept real
// via jest.requireActual so pair-analyzer can parse vessel consumption strings.

jest.mock('@/lib/matching/tce-calculator', () => {
  const actual = jest.requireActual('@/lib/matching/tce-calculator') as typeof import('@/lib/matching/tce-calculator');
  return {
    ...actual,
    buildMatchEconomics: jest.fn(),
  };
});

import { buildMatchEconomics } from '@/lib/matching/tce-calculator';
const mockBuildMatchEconomics = buildMatchEconomics as jest.MockedFunction<typeof buildMatchEconomics>;

// ── Shared economics stubs ────────────────────────────────────────────────────

/** Below-breakeven result for a ≤15 000 DWT vessel: $500/day < $1 500 breakeven */
function makeLowTceEconomics(): EconomicsResult {
  return {
    tceUsdPerDay: 500,
    freightRateUsdPerMt: 8,
    freightRateSource: 'estimated',
    breakdown: {
      bunkerCost: 12000,
      bunkerPort: 'Hamburg',
      euEtsAmount: 0,
      euEtsApplicable: false,
      warRiskPremium: 0,
      warRiskZones: [],
    },
    totalUsd: 12000,
    calculatedAt: '2026-10-01T00:00:00.000Z',
    dataFreshness: { bunker: 'estimated', eua: 'estimated' },
  };
}

/** Above-breakeven result for the same vessel class: $4 000/day > $1 500 breakeven */
function makeHighTceEconomics(): EconomicsResult {
  return {
    tceUsdPerDay: 4000,
    freightRateUsdPerMt: 18,
    freightRateSource: 'estimated',
    breakdown: {
      bunkerCost: 8000,
      bunkerPort: 'Hamburg',
      euEtsAmount: 0,
      euEtsApplicable: false,
      warRiskPremium: 0,
      warRiskZones: [],
    },
    totalUsd: 8000,
    calculatedAt: '2026-10-01T00:00:00.000Z',
    dataFreshness: { bunker: 'estimated', eua: 'estimated' },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Small coaster cargo: Hamburg → Rotterdam, 8 000 mt bulk.
 * Short route (~450 nm) — easily resolvable by getPortDistance.
 * Laycan Sept-Oct 2026.
 */
function makeSmallCargo(emailId = 'cargo-floor-1'): ParsedCargo {
  return {
    emailId,
    itemIndex: 0,
    originPort: { value: 'Hamburg', confidence: 'confirmed' },
    originCountry: 'Germany',
    destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
    destinationCountry: 'Netherlands',
    cargoDescription: 'Grain',
    weightMt: { value: 8000, confidence: 'confirmed' },
    weightMtMin: 8000,
    weightMtMax: 8000,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'GRAIN',
    containerType: null,
    quantity: 8000,
    incoterms: null,
    preferredDates: null,
    laycan: '2026-09-15 .. 2026-10-15',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    freightRateUsd: null,
  };
}

/**
 * Small coaster vessel: DWT 10 000 (class ≤15 000, breakeven $1 500/day).
 * Opens in Hamburg — zero ballast leg to load port.
 * Bulk carrier, geared → good fit for grain.
 */
function makeSmallVessel(emailId = 'vessel-floor-1'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV FLOOR TEST', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: 2018,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 10000, confidence: 'confirmed' },
    dwcc: null,
    draftMax: null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: null,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: true,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    // Opens at load port — no ballast leg
    openPosition: { value: 'Hamburg', confidence: 'confirmed' },
    openDate: { value: '2026-09-10', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '11.0',
    speedBallast: '12.0',
    consumption: '18 mt IFO',
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  };
}

const TODAY = new Date('2026-09-01T00:00:00Z');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('pair-analyzer — economic realism floor (Task 4)', () => {
  beforeEach(() => {
    mockBuildMatchEconomics.mockReset();
  });

  it('below-breakeven pair lands in lowConfidenceMatches with floor issue', async () => {
    // buildMatchEconomics returns tceUsdPerDay = 500, below $1 500 breakeven for a 10k DWT vessel
    mockBuildMatchEconomics.mockReturnValue(makeLowTceEconomics());

    const cargo = makeSmallCargo();
    const vessel = makeSmallVessel();

    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: vessel.emailId,
        score: 80,
        match_level: 'good',
        match_reasons: ['DWT match', 'geared vessel'],
        issues: [],
      },
    ]);

    const { matches, lowConfidenceMatches } = await analyzePairs(
      [cargo],
      [vessel],
      aiScorer,
      { today: TODAY },
    );

    // The pair must NOT appear in mainMatches — floor demoted it
    const inMain = matches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId,
    );
    expect(inMain).toBeUndefined();

    // The pair MUST appear in lowConfidenceMatches
    const demoted = lowConfidenceMatches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId,
    );
    expect(demoted).toBeDefined();

    // matchLevel must have been set to 'weak' by the floor
    expect(demoted!.matchLevel).toBe('weak');

    // The floor issue string must be present
    expect(demoted!.issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/below-breakeven/i),
      ]),
    );
  });

  it('above-breakeven pair stays in mainMatches', async () => {
    // buildMatchEconomics returns tceUsdPerDay = 4 000, above $1 500 breakeven
    mockBuildMatchEconomics.mockReturnValue(makeHighTceEconomics());

    const cargo = makeSmallCargo('cargo-floor-2');
    const vessel = makeSmallVessel('vessel-floor-2');

    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: vessel.emailId,
        score: 80,
        match_level: 'good',
        match_reasons: ['DWT match'],
        issues: [],
      },
    ]);

    const { matches, lowConfidenceMatches } = await analyzePairs(
      [cargo],
      [vessel],
      aiScorer,
      { today: TODAY },
    );

    // The pair must stay in mainMatches — TCE is above breakeven
    const inMain = matches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId,
    );
    expect(inMain).toBeDefined();

    // Must not have been sent to lowConfidenceMatches by the floor
    const inLow = lowConfidenceMatches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId,
    );
    expect(inLow).toBeUndefined();

    // matchLevel should reflect fitPercent ≥ 60 (above-breakeven economics boosts fit)
    expect(['good', 'possible']).toContain(inMain!.matchLevel);
  });

  it('floor issue string is exactly "Below-breakeven economics (true-voyage TCE) — manual review"', async () => {
    mockBuildMatchEconomics.mockReturnValue(makeLowTceEconomics());

    const cargo = makeSmallCargo('cargo-floor-3');
    const vessel = makeSmallVessel('vessel-floor-3');

    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: vessel.emailId,
        score: 75,
        match_level: 'good',
        match_reasons: [],
        issues: [],
      },
    ]);

    const { lowConfidenceMatches } = await analyzePairs(
      [cargo],
      [vessel],
      aiScorer,
      { today: TODAY },
    );

    const demoted = lowConfidenceMatches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === vessel.emailId,
    );
    expect(demoted).toBeDefined();
    expect(demoted!.issues).toContain(
      'Below-breakeven economics (true-voyage TCE) — manual review',
    );
  });
});
