/**
 * TDD regression: H3 — board-demote floor must use live bunker price.
 *
 * Before the fix, analyzePairs() is called without bunkerPriceUsdPerMt so the
 * breakeven floor check uses DEFAULT_BUNKER=600 while the displayed TCE uses the
 * live NLRTM/VLSFO price (~$791). A pair that clears $600 but fails $791 wrongly
 * stays on the board.
 *
 * This test pins the behaviour: a near-floor pair (TCE above $5,500 at $600 but
 * below $5,500 at $791) must land in lowConfidenceMatches when analyzePairs is
 * called with bunkerPriceUsdPerMt=791.
 */

import { analyzePairs, type AiScorer, type RawMatch } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import type { StoredMatchEconomicsResult } from '@/lib/matching/stored-match-economics';

// ── Core pair-analysis mocks (same as economics-wiring.test.ts) ──────────────

jest.mock('@/lib/sailing/readiness-gap', () => ({
  calculateReadinessGap: jest.fn().mockReturnValue({
    verdict: 'ideal',
    gapDays: 5,
    sailingDays: 3,
    explanation: 'ok',
    distanceNm: 500,
    arrivalDate: null,
    openDate: null,
    laycanStart: null,
    laycanEnd: null,
    speedKn: null,
  }),
  detectSpot: jest.fn().mockReturnValue(false),
  classifyVesselByDwt: jest.fn().mockReturnValue('supramax'),
}));

jest.mock('@/lib/sailing/match-filters', () => ({
  runHardFilters: jest.fn().mockReturnValue({
    pass: true,
    failures: [],
    checks: {
      draft: { pass: true },
      crane: { pass: true },
      volume: { pass: true },
      cargoVessel: { pass: true },
    },
  }),
}));

jest.mock('@/lib/sailing/match-scoring', () => ({
  applyReadinessScoring: jest.fn().mockImplementation((m) => m),
  computeScoreBreakdown: jest.fn().mockReturnValue({
    components: [],
    basePhysical: 75,
    readinessAdjustment: 0,
    sanctionsAdjustment: 0,
    finalScore: 75, // → 'good' → main match bucket
  }),
  deriveMatchLevel: jest.fn().mockImplementation((score: number) =>
    score > 70 ? 'good' : score > 40 ? 'possible' : 'weak',
  ),
  deriveMatchLevelFromFit: jest.fn().mockImplementation((fit: number) =>
    fit >= 70 ? 'good' : fit >= 60 ? 'possible' : 'weak',
  ),
  applyBallastSizeCap: jest.fn().mockImplementation((input) => input.match),
  isPartCargo: jest.fn().mockReturnValue(false),
  BALLAST_GOOD_MAX_NM: { handysize: 1500, supramax: 2000, panamax: 2500, capesize: 4000 },
}));

jest.mock('@/lib/sailing/date-parsing', () => ({
  parseLaycan: jest.fn().mockReturnValue(null),
  parseVesselOpenDate: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/sailing/date-sanity', () => ({
  validateDates: jest.fn().mockReturnValue({ valid: true, issues: [] }),
  isLaycanValid: jest.fn().mockReturnValue({ valid: true }),
}));

jest.mock('@/lib/validation/sanctions', () => ({
  ...jest.requireActual('@/lib/validation/sanctions'),
  checkSanctions: jest.fn().mockReturnValue({ risk: 'NONE', blocking: false }),
}));

jest.mock('@/lib/matching/reason-enricher', () => ({
  enrichReasons: jest.fn().mockImplementation((reasons: string[], issues: string[]) => ({ reasons, issues })),
}));

jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn().mockReturnValue({ nm: 3000, exact: true }),
}));

// ── Economics mock: returns TCE determined by bunker price ──────────────────
// Supramax (50k DWT) breakeven = $5,500/day.
// At $600 bunker → TCE $6,200 (above floor → stays on board).
// At $791 bunker → TCE $4,800 (below floor → board-demotes to lowConfidence).
const mockComputeStoredMatchEconomics = jest.fn();
jest.mock('@/lib/matching/stored-match-economics', () => ({
  computeStoredMatchEconomics: (...args: unknown[]) => mockComputeStoredMatchEconomics(...args),
}));

function makeEconomicsResult(tceUsdPerDay: number): StoredMatchEconomicsResult {
  return {
    tce_usd_per_day: tceUsdPerDay,
    freight_rate_usd_per_mt: 22,
    freight_rate_source: 'market',
    distance_nm: 3000,
    tce_breakdown: null,
    consumption_estimated: false,
    ballast_distance_nm: null,
    economics: {
      tceUsdPerDay,
      freightRateUsdPerMt: 22,
      freightRateSource: 'market',
      breakdown: {
        bunkerCost: 50000,
        bunkerPort: 'NLRTM',
        euEtsAmount: 0,
        euEtsApplicable: false,
        warRiskPremium: 0,
        warRiskZones: [],
      },
      totalUsd: 50000,
      calculatedAt: '2026-01-01T00:00:00.000Z',
      dataFreshness: { bunker: '2026-01-01', eua: '2026-01-01' },
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'cargo-h3',
    itemIndex: 0,
    originPort: { value: 'Rotterdam', confidence: 'confirmed' } as unknown as ParsedCargo['originPort'],
    originCountry: null,
    destinationPort: { value: 'Durban', confidence: 'confirmed' } as unknown as ParsedCargo['destinationPort'],
    destinationCountry: null,
    cargoDescription: null,
    weightMt: { value: 45000, confidence: 'confirmed' } as unknown as ParsedCargo['weightMt'],
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
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
    ...overrides,
  };
}

function makeVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'vessel-h3',
    itemIndex: 0,
    vesselName: { value: 'MV Test', confidence: 'confirmed' } as unknown as ParsedVessel['vesselName'],
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    // 50,000 DWT → breakeven = $5,500/day (supramax/handymax tier)
    dwtSummer: { value: 50000, confidence: 'confirmed' } as unknown as ParsedVessel['dwtSummer'],
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
    geared: null,
    craneCapacity: null,
    hatchType: null,
    vesselType: null,
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '13 knots',
    speedBallast: null,
    consumption: '28 mt/day',
    deckCapacity: null,
    specialFeatures: [],
    ...overrides,
  };
}

function rawMatchFor(cargo: ParsedCargo, vessel: ParsedVessel, score = 80): RawMatch {
  return {
    cargo_email_id: cargo.emailId,
    cargo_item_index: cargo.itemIndex,
    vessel_email_id: vessel.emailId,
    vessel_item_index: vessel.itemIndex,
    score,
    match_level: 'good',
    match_reasons: ['DWT fits cargo'],
    issues: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('H3 board-demote floor uses live bunker price', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: economics mock derives TCE from the bunker price argument.
    // At $600 → $6,200 TCE (above $5,500 breakeven → stays on board).
    // At $791 → $4,800 TCE (below $5,500 breakeven → demoted).
    mockComputeStoredMatchEconomics.mockImplementation(
      ({ bunkerPriceUsdPerMt }: { bunkerPriceUsdPerMt?: number }) => {
        const price = bunkerPriceUsdPerMt ?? 600;
        const tce = price > 700 ? 4_800 : 6_200;
        return makeEconomicsResult(tce);
      },
    );
  });

  it('near-floor pair demotes to lowConfidenceMatches when live bunker price 791 is passed', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatchFor(cargo, vessel)]);

    const result = await analyzePairs([cargo], [vessel], aiScorer, {
      bunkerPriceUsdPerMt: 791,
    });

    // Pair must NOT appear in main matches
    expect(result.matches).toHaveLength(0);
    // Pair MUST appear in lowConfidenceMatches with breakeven-economics issue
    expect(result.lowConfidenceMatches).toHaveLength(1);
    const demoted = result.lowConfidenceMatches[0];
    expect(demoted.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Below-breakeven economics')]),
    );
  });

  it('same near-floor pair stays on board when no bunker price is passed (defaults to 600)', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatchFor(cargo, vessel)]);

    // No bunkerPriceUsdPerMt → internal default 600 → TCE 6200 > 5500 breakeven
    const result = await analyzePairs([cargo], [vessel], aiScorer);

    expect(result.matches).toHaveLength(1);
    expect(result.lowConfidenceMatches).toHaveLength(0);
  });

  it('computeStoredMatchEconomics receives live bunker price when passed via analyzePairs', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatchFor(cargo, vessel)]);

    await analyzePairs([cargo], [vessel], aiScorer, { bunkerPriceUsdPerMt: 791 });

    expect(mockComputeStoredMatchEconomics).toHaveBeenCalledWith(
      expect.objectContaining({ bunkerPriceUsdPerMt: 791 }),
    );
  });
});
