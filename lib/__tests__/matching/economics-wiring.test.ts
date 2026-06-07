/**
 * Integration tests — economics wiring in analyzePairs (spec L2 #5 + #6).
 *
 * The matching engine internals are mocked the same way as pair-analyzer.test.ts
 * (readiness `ideal`, hard filters pass, scoring identity) so the test stays
 * deterministic and LLM-free. getPortDistance is mocked because the economics
 * loop derives the laden-voyage distance from it (mirroring compute-matches.ts).
 *
 * Asserts:
 *   - a good/possible main match gets `economics` populated with a finite TCE $/day
 *   - JWC war-risk (#6) flows end-to-end into economics.breakdown for an HRA port
 *   - no resolvable distance → `economics` stays undefined (no crash, no fabrication)
 */

import { analyzePairs, type AiScorer, type RawMatch } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

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
  classifyVesselByDwt: jest.fn().mockReturnValue('handysize'),
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
    basePhysical: 60,
    readinessAdjustment: 0,
    sanctionsAdjustment: 0,
    finalScore: 60, // → 'possible' → main match bucket
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
  checkSanctions: jest.fn().mockReturnValue({ risk: 'NONE', blocking: false }),
}));

jest.mock('@/lib/matching/reason-enricher', () => ({
  enrichReasons: jest.fn().mockImplementation((reasons: string[], issues: string[]) => ({ reasons, issues })),
}));

jest.mock('@/lib/sailing/port-distances', () => ({
  getPortDistance: jest.fn().mockReturnValue({ nm: 3000, exact: true }),
}));

import { getPortDistance } from '@/lib/sailing/port-distances';

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'cargo-1',
    itemIndex: 0,
    originPort: { value: 'Rotterdam', confidence: 'confirmed' } as unknown as ParsedCargo['originPort'],
    originCountry: null,
    destinationPort: { value: 'Hamburg', confidence: 'confirmed' } as unknown as ParsedCargo['destinationPort'],
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
    emailId: 'vessel-1',
    itemIndex: 0,
    vesselName: null,
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
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
    speedLaden: '12 knots',
    speedBallast: null,
    consumption: '25 mt/day',
    deckCapacity: null,
    specialFeatures: [],
    ...overrides,
  };
}

function rawMatchFor(cargo: ParsedCargo, vessel: ParsedVessel, score = 75): RawMatch {
  return {
    cargo_email_id: cargo.emailId,
    cargo_item_index: cargo.itemIndex,
    vessel_email_id: vessel.emailId,
    vessel_item_index: vessel.itemIndex,
    score,
    match_level: 'good',
    match_reasons: ['DWT fits'],
    issues: [],
  };
}

describe('analyzePairs — economics wiring (spec L2 #5 + #6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPortDistance as jest.Mock).mockReturnValue({ nm: 3000, exact: true });
  });

  it('populates economics with a finite TCE $/day on a good/possible main match (#5)', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatchFor(cargo, vessel)]);

    const result = await analyzePairs([cargo], [vessel], aiScorer);

    expect(result.matches).toHaveLength(1);
    const econ = result.matches[0].economics;
    expect(econ).toBeDefined();
    expect(Number.isFinite(econ!.tceUsdPerDay!)).toBe(true);
    expect(econ!.breakdown).toBeDefined();
    expect(typeof econ!.totalUsd).toBe('number');
  });

  it('surfaces JWC war-risk in economics when the load port is in an HRA (#6)', async () => {
    const cargo = makeCargo({
      originPort: { value: 'Lagos', confidence: 'confirmed' } as unknown as ParsedCargo['originPort'],
    });
    const vessel = makeVessel();
    (getPortDistance as jest.Mock).mockReturnValue({ nm: 4200, exact: true });
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatchFor(cargo, vessel)]);

    const result = await analyzePairs([cargo], [vessel], aiScorer);

    const econ = result.matches[0].economics;
    expect(econ).toBeDefined();
    expect(econ!.breakdown.warRiskZones.length).toBeGreaterThan(0);
    expect(econ!.breakdown.warRiskPremium).toBeGreaterThan(0);
  });

  it('leaves economics undefined when distance is unresolvable (no crash)', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    (getPortDistance as jest.Mock).mockReturnValue(null);
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatchFor(cargo, vessel)]);

    const result = await analyzePairs([cargo], [vessel], aiScorer);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].economics).toBeUndefined();
  });
});
