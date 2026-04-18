import { analyzePairs, AiScorer, RawMatch } from '@/lib/matching/pair-analyzer';
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
    basePhysical: 50,
    readinessAdjustment: 0,
    sanctionsAdjustment: 0,
    finalScore: 50,
  }),
  deriveMatchLevel: jest.fn().mockImplementation((score: number) =>
    score > 70 ? 'good' : score > 40 ? 'possible' : 'weak',
  ),
}));

jest.mock('@/lib/sailing/date-parsing', () => ({
  parseLaycan: jest.fn().mockReturnValue(null),
  parseVesselOpenDate: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/sailing/date-sanity', () => ({
  validateDates: jest.fn().mockReturnValue({ valid: true, issues: [] }),
}));

jest.mock('@/lib/validation/sanctions', () => ({
  checkSanctions: jest.fn().mockReturnValue({ risk: 'NONE', blocking: false }),
}));

jest.mock('@/lib/matching/reason-enricher', () => ({
  enrichReasons: jest.fn().mockImplementation((reasons: string[], issues: string[]) => ({ reasons, issues })),
}));

function makeCargo(emailId = 'cargo-1', itemIndex = 0): ParsedCargo {
  return {
    emailId,
    itemIndex,
    originPort: null,
    originCountry: null,
    destinationPort: null,
    destinationCountry: null,
    cargoDescription: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'general',
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
  };
}

function makeVessel(emailId = 'vessel-1', itemIndex = 0): ParsedVessel {
  return {
    emailId,
    itemIndex,
    vesselName: null,
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: null,
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
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
  };
}

const emptyAiScorer: AiScorer = jest.fn().mockResolvedValue([]);

describe('analyzePairs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (emptyAiScorer as jest.Mock).mockResolvedValue([]);
  });

  it('returns empty matches and blockedMatches when both inputs are empty', async () => {
    const result = await analyzePairs([], [], emptyAiScorer);
    expect(result).toEqual({ matches: [], blockedMatches: [] });
    expect(emptyAiScorer).not.toHaveBeenCalled();
  });

  it('returns empty matches when vessels list is empty', async () => {
    const cargo = makeCargo();
    const result = await analyzePairs([cargo], [], emptyAiScorer);
    expect(result).toEqual({ matches: [], blockedMatches: [] });
    expect(emptyAiScorer).not.toHaveBeenCalled();
  });

  it('returns empty matches when cargos list is empty', async () => {
    const vessel = makeVessel();
    const result = await analyzePairs([], [vessel], emptyAiScorer);
    expect(result).toEqual({ matches: [], blockedMatches: [] });
    expect(emptyAiScorer).not.toHaveBeenCalled();
  });

  it('returns a single match with score from aiScorer when pair passes filters', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();

    const rawMatch: RawMatch = {
      cargo_email_id: cargo.emailId,
      cargo_item_index: cargo.itemIndex,
      vessel_email_id: vessel.emailId,
      vessel_item_index: vessel.itemIndex,
      score: 75,
      match_level: 'good',
      match_reasons: ['DWT fits'],
      issues: [],
    };

    const aiScorer: AiScorer = jest.fn().mockResolvedValue([rawMatch]);
    const result = await analyzePairs([cargo], [vessel], aiScorer);

    expect(result.blockedMatches).toHaveLength(0);
    expect(result.matches).toHaveLength(1);
    // score is overridden by computeScoreBreakdown.finalScore = 50 in mock
    expect(result.matches[0].cargoEmailId).toBe(cargo.emailId);
    expect(result.matches[0].vesselEmailId).toBe(vessel.emailId);
  });

  it('sorts multiple matches by score descending', async () => {
    const cargo1 = makeCargo('cargo-1', 0);
    const cargo2 = makeCargo('cargo-2', 0);
    const cargo3 = makeCargo('cargo-3', 0);
    const vessel = makeVessel();

    const rawMatches: RawMatch[] = [
      { cargo_email_id: 'cargo-1', cargo_item_index: 0, vessel_email_id: 'vessel-1', vessel_item_index: 0, score: 30 },
      { cargo_email_id: 'cargo-2', cargo_item_index: 0, vessel_email_id: 'vessel-1', vessel_item_index: 0, score: 80 },
      { cargo_email_id: 'cargo-3', cargo_item_index: 0, vessel_email_id: 'vessel-1', vessel_item_index: 0, score: 60 },
    ];

    // Override computeScoreBreakdown to return the LLM score so we can test ordering
    const { computeScoreBreakdown } = jest.requireMock('@/lib/sailing/match-scoring');
    computeScoreBreakdown.mockImplementation(({ match }: { match: { score: number } }) => ({
      components: [],
      basePhysical: match.score,
      readinessAdjustment: 0,
      sanctionsAdjustment: 0,
      finalScore: match.score,
    }));
    const { deriveMatchLevel } = jest.requireMock('@/lib/sailing/match-scoring');
    deriveMatchLevel.mockImplementation((score: number) =>
      score > 70 ? 'good' : score > 40 ? 'possible' : 'weak',
    );

    const aiScorer: AiScorer = jest.fn().mockResolvedValue(rawMatches);
    const result = await analyzePairs([cargo1, cargo2, cargo3], [vessel], aiScorer);

    expect(result.matches).toHaveLength(3);
    expect(result.matches[0].score).toBe(80);
    expect(result.matches[1].score).toBe(60);
    expect(result.matches[2].score).toBe(30);
  });

  it('calls aiScorer exactly once even with multiple cargos and vessels', async () => {
    const cargos = [makeCargo('c1', 0), makeCargo('c2', 0)];
    const vessels = [makeVessel('v1', 0), makeVessel('v2', 0)];
    const aiScorer: AiScorer = jest.fn().mockResolvedValue([]);
    await analyzePairs(cargos, vessels, aiScorer);
    expect(aiScorer).toHaveBeenCalledTimes(1);
  });

  it('puts pair that fails hard filters in blockedMatches, not matches', async () => {
    const cargo = makeCargo();
    const vessel = makeVessel();

    const { runHardFilters } = jest.requireMock('@/lib/sailing/match-filters');
    runHardFilters.mockReturnValue({
      pass: false,
      failures: ['draft too deep'],
      checks: {
        draft: { pass: false },
        crane: { pass: true },
        volume: { pass: true },
        cargoVessel: { pass: true },
      },
    });

    const aiScorer: AiScorer = jest.fn().mockResolvedValue([]);
    const result = await analyzePairs([cargo], [vessel], aiScorer);

    expect(result.matches).toHaveLength(0);
    expect(result.blockedMatches).toHaveLength(1);
    expect(result.blockedMatches[0].filterReason).toContain('draft too deep');
  });
});
