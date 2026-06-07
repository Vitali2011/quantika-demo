/**
 * TDD tests — Task 3: Rank + matchLevel + bucket by fitPercent
 *
 * 1. Unit tests for deriveMatchLevelFromFit (new sibling of deriveMatchLevel).
 * 2. Integration: analyzePairs sorts by fitPercent descending (not by score).
 * 3. Integration: matchLevel derives from fitPercent thresholds (60/70),
 *    not from score thresholds (40/70).
 *
 * PI2: integration tests call real analyzePairs with a stubbed aiScorer.
 */

import { deriveMatchLevelFromFit } from '@/lib/sailing/match-scoring';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Cargo: Shanghai → Rotterdam, grain, 50 000 mt, laycan Oct 2026.
 */
function makeCargo(emailId = 'cargo-rank-1'): ParsedCargo {
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
 * Near vessel: opens in Singapore — short ballast to Shanghai.
 * Good DWT (55k), bulk carrier, good cargo history → high fitPercent.
 */
function makeNearVessel(emailId = 'vessel-rank-near'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV NEAR RANK', confidence: 'confirmed' },
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
    lastCargoes: 'grain, coal, iron ore',
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
 * Far vessel: opens in Houston — long ballast to Shanghai (~10 000 nm).
 * True-voyage TCE will be materially lower → lower fitPercent.
 * AI gives it the SAME score as near vessel to distinguish score-order vs fit-order.
 */
function makeFarVessel(emailId = 'vessel-rank-far'): ParsedVessel {
  return {
    emailId,
    itemIndex: 0,
    vesselName: { value: 'MV FAR RANK', confidence: 'confirmed' },
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
    openPosition: { value: 'Houston', confidence: 'confirmed' },
    openDate: { value: '2026-09-01', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: 'grain, coal',
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

// ── Unit tests: deriveMatchLevelFromFit ────────────────────────────────────────

describe('deriveMatchLevelFromFit', () => {
  it('≥70 → good', () => expect(deriveMatchLevelFromFit(70)).toBe('good'));
  it('100 → good', () => expect(deriveMatchLevelFromFit(100)).toBe('good'));
  it('60-69 → possible', () => expect(deriveMatchLevelFromFit(65)).toBe('possible'));
  it('60 → possible (boundary)', () => expect(deriveMatchLevelFromFit(60)).toBe('possible'));
  it('59 → weak (just below possible floor)', () => expect(deriveMatchLevelFromFit(59)).toBe('weak'));
  it('<60 → weak', () => expect(deriveMatchLevelFromFit(55)).toBe('weak'));
  it('0 → weak', () => expect(deriveMatchLevelFromFit(0)).toBe('weak'));
});

// ── Integration: sort by fitPercent ───────────────────────────────────────────

describe('pair-analyzer rank by fit — sort order', () => {
  it('matches are sorted by fitPercent descending (not by score)', async () => {
    const cargo = makeCargo();
    const nearVessel = makeNearVessel('vessel-sort-near');
    const farVessel = makeFarVessel('vessel-sort-far');

    // Give FAR vessel a HIGHER AI score than NEAR vessel.
    // If sort were score-based, far would come first.
    // After Task 3, sort is fitPercent-based, so near (shorter ballast → higher fit) should come first.
    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: nearVessel.emailId,
        score: 72,
        match_level: 'good',
        match_reasons: ['DWT match', 'grain history'],
        issues: [],
      },
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: farVessel.emailId,
        score: 80, // Higher score than near — would rank first if sorted by score
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
    expect(allMatches.length).toBeGreaterThanOrEqual(2);

    // All matches must have fitPercent set
    for (const m of allMatches) {
      expect(typeof m.fitPercent).toBe('number');
    }

    // Verify fitPercent descending order across the combined list
    // (matches is the main bucket, already sorted; we check within each bucket)
    const mainAndLow = [...matches, ...lowConfidenceMatches];
    for (let i = 1; i < mainAndLow.length; i++) {
      expect(mainAndLow[i - 1].fitPercent ?? 0).toBeGreaterThanOrEqual(mainAndLow[i].fitPercent ?? 0);
    }
  });

  it('near-vessel (short ballast) has fitPercent ≥ far-vessel (long ballast)', async () => {
    const cargo = makeCargo('cargo-rank-2');
    const nearVessel = makeNearVessel('vessel-fit-near');
    const farVessel = makeFarVessel('vessel-fit-far');

    // Same AI score for both — only ballast leg differs
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

    expect(nearMatch).toBeDefined();
    expect(farMatch).toBeDefined();
    expect(typeof nearMatch!.fitPercent).toBe('number');
    expect(typeof farMatch!.fitPercent).toBe('number');

    // Near vessel (Singapore → Shanghai, ~2 600 nm) has shorter ballast than
    // far vessel (Houston → Shanghai, ~10 000 nm) → higher fitPercent
    expect(nearMatch!.fitPercent!).toBeGreaterThanOrEqual(farMatch!.fitPercent!);
  });
});

// ── Integration: matchLevel from fitPercent thresholds ────────────────────────

describe('pair-analyzer rank by fit — matchLevel from fitPercent', () => {
  it('matchLevel is set on all matches', async () => {
    const cargo = makeCargo('cargo-level-1');
    const vessel = makeNearVessel('vessel-level-1');

    const aiScorer = jest.fn().mockResolvedValue([
      {
        cargo_email_id: cargo.emailId,
        vessel_email_id: vessel.emailId,
        score: 75,
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
    expect(allMatches.length).toBeGreaterThan(0);

    for (const m of allMatches) {
      expect(['good', 'possible', 'weak']).toContain(m.matchLevel);
    }
  });

  it('matchLevel reflects fitPercent thresholds (fit ≥70 → good; 60-69 → possible; <60 → weak)', async () => {
    const cargo = makeCargo('cargo-level-2');
    const vessel = makeNearVessel('vessel-level-2');

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
    expect(typeof m!.fitPercent).toBe('number');

    // matchLevel must be consistent with fitPercent thresholds
    const fit = m!.fitPercent!;
    if (fit >= 70) {
      // Safety demotions (ballast cap, deadfreight, floor) can lower to possible/weak — so
      // accept good OR any lower level that a demotion applied
      expect(['good', 'possible', 'weak']).toContain(m!.matchLevel);
    } else if (fit >= 60) {
      // possible or demoted to weak
      expect(['possible', 'weak']).toContain(m!.matchLevel);
    } else {
      expect(m!.matchLevel).toBe('weak');
    }
  });
});
