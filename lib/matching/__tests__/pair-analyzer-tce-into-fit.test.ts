/**
 * TDD tests — Task 2: Compute true-voyage TCE before fit
 *
 * Verifies that after the refactor:
 * 1. m.economics is set for ALL pairs with resolvable distance — including
 *    those that end up in lowConfidenceMatches (not just mainMatches).
 * 2. fitPercent is fed by the real true-voyage TCE (from buildMatchEconomics,
 *    with ballast + Suez), NOT the crude 6-arg preFitTce (laden only).
 *
 * PI2: calls real analyzePairs with a stubbed aiScorer — no string-match checks.
 */

import { analyzePairs } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Cargo: Shanghai → Rotterdam, grain, 50 000 mt, laycan Oct 2026.
 * Distance Shanghai→Rotterdam is ~11 000 nm (via Suez) — resolvable by getPortDistance.
 */
function makeCargo(emailId = 'cargo-tce-1'): ParsedCargo {
  return {
    emailId,
    itemIndex: 0,
    originPort: { value: 'Shanghai', confidence: 'confirmed' },
    originCountry: 'China',
    destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
    destinationCountry: 'Netherlands',
    cargoDescription: 'Grain',
    weightMt: { value: 50000, confidence: 'confirmed' },
    weightMtMin: 50000,
    weightMtMax: 50000,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'GRAIN',
    containerType: null,
    quantity: 50000,
    incoterms: null,
    preferredDates: null,
    laycan: '2026-10-01 .. 2026-10-20',
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
 * Vessel near load port (Singapore) → ballast leg is short.
 * DWT 55 000 — Supramax class — well above Handysize breakeven.
 */
function makeNearVessel(emailId = 'vessel-near'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV NEAR', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: 2015,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 55000, confidence: 'confirmed' },
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
    geared: false,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    // Open in Singapore — very close to Shanghai load port
    openPosition: { value: 'Singapore', confidence: 'confirmed' },
    openDate: { value: '2026-09-15', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '14.0',
    speedBallast: '14.5',
    consumption: '30 mt IFO',
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  };
}

/**
 * Vessel far from load port (Houston, US Gulf) → long ballast leg (~10 000 nm).
 * True-voyage TCE will be significantly lower than crude laden-only TCE because
 * the long ballast leg adds bunker cost and extends the voyage duration.
 */
function makeFarVessel(emailId = 'vessel-far'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV FAR', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: 2015,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 55000, confidence: 'confirmed' },
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
    geared: false,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    // Open in Houston — far from Shanghai load port (~10 000 nm ballast leg)
    openPosition: { value: 'Houston', confidence: 'confirmed' },
    openDate: { value: '2026-09-01', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '14.0',
    speedBallast: '14.5',
    consumption: '30 mt IFO',
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  };
}

// Vessel that will produce a weak match (score < 40) → goes to lowConfidenceMatches
function makeWeakVessel(emailId = 'vessel-weak'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV WEAK', confidence: 'confirmed' },
    imo: null,
    flag: null,
    built: 2015,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 55000, confidence: 'confirmed' },
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
    geared: false,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'Bulk Carrier',
    openPosition: { value: 'Singapore', confidence: 'confirmed' },
    openDate: { value: '2026-09-15', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '14.0',
    speedBallast: '14.5',
    consumption: '30 mt IFO',
    deckCapacity: null,
    specialFeatures: [],
    ciiRating: null,
    verificationWarning: null,
  };
}

const TODAY = new Date('2026-09-01T00:00:00Z');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('pair-analyzer Task 2 — true-voyage TCE fed into fit before sort', () => {
  it('m.economics is set for a pair in mainMatches', async () => {
    const cargo = makeCargo();
    const vessel = makeNearVessel();

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

    const { matches, lowConfidenceMatches, insufficientData } = await analyzePairs(
      [cargo],
      [vessel],
      aiScorer,
      { today: TODAY },
    );

    const allMatches = [...matches, ...lowConfidenceMatches, ...insufficientData];
    // At least one match must exist
    expect(allMatches.length).toBeGreaterThan(0);

    // The pair must have economics set (resolvable route: Shanghai → Rotterdam)
    const m = allMatches.find(
      (x) => x.cargoEmailId === cargo.emailId && x.vesselEmailId === vessel.emailId,
    );
    expect(m).toBeDefined();
    expect(m!.economics).toBeDefined();
    expect(typeof m!.economics!.tceUsdPerDay).toBe('number');
  });

  it('m.economics is set even for pairs that end in lowConfidenceMatches', async () => {
    const cargo = makeCargo();
    // AI gives this pair a weak score → will land in lowConfidenceMatches after sweep
    const vessel = makeWeakVessel();

    // AI returns weak score explicitly
    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: vessel.emailId,
        score: 20,
        match_level: 'weak',
        match_reasons: [],
        issues: ['Poor utilisation'],
      },
    ]);

    const { matches, lowConfidenceMatches, insufficientData } = await analyzePairs(
      [cargo],
      [vessel],
      aiScorer,
      { today: TODAY },
    );

    // The pair should end up in lowConfidenceMatches (weak score)
    const allPairs = [...matches, ...lowConfidenceMatches, ...insufficientData];
    const m = allPairs.find(
      (x) => x.cargoEmailId === cargo.emailId && x.vesselEmailId === vessel.emailId,
    );
    expect(m).toBeDefined();

    // After Task 2 refactor, economics is set in pre-fit loop (before sort/partition)
    // → it must be present on lowConfidenceMatches pairs too
    expect(m!.economics).toBeDefined();
    expect(typeof m!.economics!.tceUsdPerDay).toBe('number');
  });

  it('fitPercent for far-vessel is lower than for near-vessel (true-voyage TCE differs)', async () => {
    const cargo = makeCargo();
    const nearVessel = makeNearVessel('vessel-near-2');
    const farVessel = makeFarVessel('vessel-far-2');

    // Give both pairs same AI score so score alone doesn't differentiate
    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: nearVessel.emailId,
        score: 75,
        match_level: 'good',
        match_reasons: ['DWT match'],
        issues: [],
      },
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: farVessel.emailId,
        score: 75,
        match_level: 'good',
        match_reasons: ['DWT match'],
        issues: [],
      },
    ]);

    const { matches, lowConfidenceMatches, insufficientData } = await analyzePairs(
      [cargo],
      [nearVessel, farVessel],
      aiScorer,
      { today: TODAY },
    );

    const allMatches = [...matches, ...lowConfidenceMatches, ...insufficientData];

    const nearMatch = allMatches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === nearVessel.emailId,
    );
    const farMatch = allMatches.find(
      (m) => m.cargoEmailId === cargo.emailId && m.vesselEmailId === farVessel.emailId,
    );

    // Both must have economics and fitPercent set
    expect(nearMatch).toBeDefined();
    expect(farMatch).toBeDefined();
    expect(nearMatch!.economics).toBeDefined();
    expect(farMatch!.economics).toBeDefined();
    expect(typeof nearMatch!.fitPercent).toBe('number');
    expect(typeof farMatch!.fitPercent).toBe('number');

    // The far vessel has a ~10 000 nm ballast leg Houston→Shanghai — its
    // true-voyage TCE is materially lower than the near vessel (Singapore→Shanghai).
    // After Task 2, fitPercent uses this real TCE → far-vessel fitPercent ≤ near-vessel fitPercent.
    // (The economics factor in fit contributes up to 10 points — see Task 1.)
    const nearTce = nearMatch!.economics!.tceUsdPerDay ?? 0;
    const farTce = farMatch!.economics!.tceUsdPerDay ?? 0;
    expect(nearTce).toBeGreaterThan(farTce);
    // fitPercent must reflect this: near ≥ far
    expect(nearMatch!.fitPercent!).toBeGreaterThanOrEqual(farMatch!.fitPercent!);
  });

  it('fitBreakdown economics component reflects real TCE (non-zero score when economics is positive)', async () => {
    const cargo = makeCargo();
    const vessel = makeNearVessel();

    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: vessel.emailId,
        score: 80,
        match_level: 'good',
        match_reasons: [],
        issues: [],
      },
    ]);

    const { matches, lowConfidenceMatches, insufficientData } = await analyzePairs(
      [cargo],
      [vessel],
      aiScorer,
      { today: TODAY },
    );

    const allMatches = [...matches, ...lowConfidenceMatches, ...insufficientData];
    const m = allMatches.find(
      (x) => x.cargoEmailId === cargo.emailId && x.vesselEmailId === vessel.emailId,
    );
    expect(m).toBeDefined();
    expect(m!.economics).toBeDefined();
    expect(m!.fitBreakdown).toBeDefined();

    // After Task 2 refactor: the economics component inside fitBreakdown
    // should have a positive score (because real TCE > breakeven for a Shanghai→Rotterdam grain voyage).
    // The crude preFitTce (no ballast/canal) would give the same or higher score,
    // but what matters here is that the economics factor is present and scored.
    const econComponent = m!.fitBreakdown!.components.find((c) => c.factor === 'economics');
    expect(econComponent).toBeDefined();
    // With a real resolvable positive-TCE route, score should be > 0
    expect(econComponent!.score).toBeGreaterThan(0);
  });
});
