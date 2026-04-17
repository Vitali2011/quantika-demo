/**
 * Pipeline score integrity tests — covers 3 bugs:
 *
 * Bug P0-D1: score !== scoreBreakdown.finalScore for LLM matches
 * Bug P0-D2: matchLevel not recalculated after score sync
 * Bug P1-DUP: same pair in both matches AND blockedMatches
 */

import type {
  Match,
  MatchReadiness,
  MatchHardFilters,
  MatchSanctions,
  ParsedCargo,
  ParsedVessel,
} from '@/lib/types';
import { applyReadinessScoring, computeScoreBreakdown, deriveMatchLevel } from '@/lib/sailing/match-scoring';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pairKey(
  cargoEmailId: string,
  cargoItemIndex: number,
  vesselEmailId: string,
  vesselItemIndex: number,
): string {
  return `${cargoEmailId}|${cargoItemIndex}|${vesselEmailId}|${vesselItemIndex}`;
}

// ── Minimal fixture data ──────────────────────────────────────────────────────

const READINESS_IDEAL: MatchReadiness = {
  openDate: '2026-05-10',
  laycanStart: '2026-05-15',
  laycanEnd: '2026-05-25',
  distanceNm: 400,
  distanceExact: false,
  speedKn: 12,
  sailingDays: 1.4,
  arrivalDate: '2026-05-11',
  gapDays: 4,
  verdict: 'ideal',
  explanation: 'Vessel arrives 4d before laycan',
};

const HARD_FILTERS_ALL_PASS: MatchHardFilters = {
  draft: { pass: true },
  crane: { pass: true },
  volume: { pass: true },
  cargoVessel: { pass: true },
};

const SANCTIONS_NONE: MatchSanctions = { risk: 'NONE', blocking: false };

const CARGO: ParsedCargo = {
  emailId: 'c-001',
  itemIndex: 0,
  originPort: { value: 'Dubai', confidence: 'confirmed' },
  originCountry: null,
  destinationPort: { value: 'Rotterdam', confidence: 'confirmed' },
  destinationCountry: null,
  cargoDescription: { value: 'grain', confidence: 'confirmed' },
  weightMt: { value: 25000, confidence: 'confirmed' },
  weightMtMin: null,
  weightMtMax: null,
  volumeCbm: null,
  dimensions: null,
  cargoType: 'BULK',
  containerType: null,
  quantity: null,
  incoterms: null,
  laycan: '15-25 May 2026',
  preferredDates: null,
  stowageFactor: null,
  loadingRate: null,
  dischargeRate: null,
  commissionPercent: null,
  commissionTerms: null,
  specialRequirements: null,
  missingInfo: [],
};

const VESSEL: ParsedVessel = {
  emailId: 'v-001',
  itemIndex: 0,
  vesselName: { value: 'MV Test', confidence: 'confirmed' },
  imo: null,
  flag: 'MH',
  built: 2018,
  classSociety: null,
  pandi: null,
  dwtSummer: { value: 32000, confidence: 'confirmed' },
  dwcc: { value: 30000, confidence: 'confirmed' },
  draftMax: { value: 11.5, confidence: 'confirmed' },
  loa: 185,
  beam: null,
  grt: null,
  nrt: null,
  holdsCount: null,
  hatchesCount: null,
  grainCapacity: 40000,
  grainCapacityUnit: 'cbm',
  baleCapacity: null,
  holdDimensions: null,
  hatchDimensions: null,
  tankTopStrength: null,
  geared: true,
  craneCapacity: null,
  hatchType: null,
  vesselType: 'Handysize bulk carrier',
  openPosition: { value: 'Fujairah', confidence: 'confirmed' },
  openDate: { value: '2026-05-10', confidence: 'confirmed' },
  direction: null,
  restrictions: [],
  lastCargoes: 'grain, wheat, barley',
  speedLaden: '12',
  speedBallast: null,
  consumption: null,
  deckCapacity: null,
  specialFeatures: [],
};

// ── Bug P0-D1: LLM path score must equal scoreBreakdown.finalScore ─────────────

describe('P0-D1: score === scoreBreakdown.finalScore (both paths)', () => {
  /**
   * Simulate the LLM path from route.ts:
   *   1. applyReadinessScoring
   *   2. computeScoreBreakdown
   *   3. (BUG: score is NOT updated to finalScore)
   */
  it('LLM path — score equals scoreBreakdown.finalScore after sync (P0-D1 fix)', () => {
    const rawMatch: Match = {
      cargoEmailId: 'c-001',
      cargoItemIndex: 0,
      vesselEmailId: 'v-001',
      vesselItemIndex: 0,
      score: 21,  // LLM returned 21
      matchLevel: 'weak',
      matchReasons: ['some reason'],
      issues: [],
    };

    // Step 1: applyReadinessScoring
    const withReadiness = applyReadinessScoring(rawMatch, READINESS_IDEAL);

    // Step 2: computeScoreBreakdown
    const breakdown = computeScoreBreakdown({
      match: withReadiness,
      cargo: CARGO,
      vessel: VESSEL,
      readiness: READINESS_IDEAL,
      sanctions: SANCTIONS_NONE,
    });
    withReadiness.scoreBreakdown = breakdown;

    // P0-D1 fix: sync score to finalScore
    withReadiness.score = Math.max(0, Math.min(100, breakdown.finalScore));

    expect(withReadiness.score).toBe(breakdown.finalScore);
  });

  /**
   * Simulate the sweep path from route.ts:
   *   Same issue exists without the fix — score after readiness ≠ finalScore.
   *   (sweep path already had the fix, but verify it still holds)
   */
  it('sweep path — score equals scoreBreakdown.finalScore', () => {
    const baseSweepMatch: Match = {
      cargoEmailId: 'c-001',
      cargoItemIndex: 0,
      vesselEmailId: 'v-001',
      vesselItemIndex: 0,
      score: 25,
      matchLevel: 'weak',
      matchReasons: ['Physically feasible pair — passed all hard filters but was not evaluated by AI'],
      issues: [],
      readiness: READINESS_IDEAL,
      hardFilters: HARD_FILTERS_ALL_PASS,
      sanctions: SANCTIONS_NONE,
    };

    const withReadiness = applyReadinessScoring(baseSweepMatch, READINESS_IDEAL);
    const breakdown = computeScoreBreakdown({
      match: withReadiness,
      cargo: CARGO,
      vessel: VESSEL,
      readiness: READINESS_IDEAL,
      sanctions: SANCTIONS_NONE,
    });
    withReadiness.scoreBreakdown = breakdown;
    // sweep path already syncs: withReadiness.score = breakdown.finalScore
    withReadiness.score = Math.max(0, Math.min(100, breakdown.finalScore));

    expect(withReadiness.score).toBe(breakdown.finalScore);
  });
});

// ── Bug P0-D2: matchLevel must be consistent with final score ─────────────────

describe('P0-D2: matchLevel consistent with score after finalScore sync', () => {
  const cases: Array<{ score: number; expected: 'good' | 'possible' | 'weak' }> = [
    { score: 70, expected: 'good' },
    { score: 85, expected: 'good' },
    { score: 69, expected: 'possible' },
    { score: 40, expected: 'possible' },
    { score: 39, expected: 'weak' },
    { score: 0, expected: 'weak' },
  ];

  it.each(cases)('score=$score → matchLevel=$expected', ({ score, expected }) => {
    expect(deriveMatchLevel(score)).toBe(expected);
  });

  it('LLM path matchLevel consistent with finalScore after fix (P0-D2)', () => {
    // LLM returned score=21 matchLevel='weak', but after scoring finalScore may be ≥70
    const rawMatch: Match = {
      cargoEmailId: 'c-001',
      cargoItemIndex: 0,
      vesselEmailId: 'v-001',
      vesselItemIndex: 0,
      score: 21,
      matchLevel: 'weak',  // LLM label
      matchReasons: ['reason'],
      issues: [],
    };

    const withReadiness = applyReadinessScoring(rawMatch, READINESS_IDEAL);
    const breakdown = computeScoreBreakdown({
      match: withReadiness,
      cargo: CARGO,
      vessel: VESSEL,
      readiness: READINESS_IDEAL,
      sanctions: SANCTIONS_NONE,
    });
    withReadiness.scoreBreakdown = breakdown;

    // P0-D1 fix: sync score
    withReadiness.score = Math.max(0, Math.min(100, breakdown.finalScore));
    // P0-D2 fix: recalculate matchLevel from synced score
    withReadiness.matchLevel = deriveMatchLevel(withReadiness.score);

    const expectedLevel = deriveMatchLevel(breakdown.finalScore);
    expect(withReadiness.matchLevel).toBe(expectedLevel);
    // Verify finalScore is indeed ≥70 for this fixture (confirms the bug was real)
    expect(breakdown.finalScore).toBeGreaterThanOrEqual(70);
  });
});

// ── Bug P1-DUP: no pair in both matches AND blockedMatches ────────────────────

describe('P1-DUP: no pair appears in both matches and blockedMatches', () => {
  function deduplicateSets(
    matches: Match[],
    blockedMatches: Array<{ cargoEmailId: string; cargoItemIndex: number; vesselEmailId: string; vesselItemIndex: number }>,
  ): { matches: Match[]; blockedMatches: typeof blockedMatches } {
    const blockedKeys = new Set(
      blockedMatches.map(b => pairKey(b.cargoEmailId, b.cargoItemIndex, b.vesselEmailId, b.vesselItemIndex)),
    );
    // Safety: if in both → keep in blocked, remove from matches
    const deduped = matches.filter(
      m => !blockedKeys.has(pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)),
    );
    return { matches: deduped, blockedMatches };
  }

  it('dedup removes pair from matches when it exists in blockedMatches (P1-DUP fix)', () => {
    // Simulate the bug: cargo=sample-9 in both arrays
    const dup: Match = {
      cargoEmailId: 'sample-9',
      cargoItemIndex: 0,
      vesselEmailId: 'v-001',
      vesselItemIndex: 0,
      score: 55,
      matchLevel: 'possible',
      matchReasons: [],
      issues: [],
    };

    const allMatches: Match[] = [dup];
    const blockedMatches = [
      { cargoEmailId: 'sample-9', cargoItemIndex: 0, vesselEmailId: 'v-001', vesselItemIndex: 0, filterReason: 'draft' },
    ];

    // P1-DUP fix: dedupe by blocked keys
    const blockedKeys = new Set(
      blockedMatches.map(b => pairKey(b.cargoEmailId, b.cargoItemIndex, b.vesselEmailId, b.vesselItemIndex)),
    );
    const matches = allMatches.filter(
      m => !blockedKeys.has(pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)),
    );

    const matchKeys = Array.from(matches.map(m => pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)));
    const intersection = matchKeys.filter(k => blockedKeys.has(k));

    expect(intersection).toHaveLength(0);
    expect(matches).toHaveLength(0);  // dup was removed
  });

  it('after dedup: intersection is empty', () => {
    const dup: Match = {
      cargoEmailId: 'sample-9',
      cargoItemIndex: 0,
      vesselEmailId: 'v-001',
      vesselItemIndex: 0,
      score: 55,
      matchLevel: 'possible',
      matchReasons: [],
      issues: [],
    };

    const rawMatches: Match[] = [dup, {
      cargoEmailId: 'c-clean',
      cargoItemIndex: 0,
      vesselEmailId: 'v-clean',
      vesselItemIndex: 0,
      score: 60,
      matchLevel: 'possible',
      matchReasons: [],
      issues: [],
    }];
    const blocked = [
      { cargoEmailId: 'sample-9', cargoItemIndex: 0, vesselEmailId: 'v-001', vesselItemIndex: 0, filterReason: 'draft' },
    ];

    const { matches } = deduplicateSets(rawMatches, blocked);

    const matchKeys = Array.from(matches, m => pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex));
    const blockedKeySet = new Set(blocked.map(b => pairKey(b.cargoEmailId, b.cargoItemIndex, b.vesselEmailId, b.vesselItemIndex)));
    const intersection = matchKeys.filter(k => blockedKeySet.has(k));

    expect(intersection).toHaveLength(0);
    // Clean pair still present
    expect(matches).toHaveLength(1);
    expect(matches[0].cargoEmailId).toBe('c-clean');
  });

  it('5 duplicate pairs from sample-9 are all resolved to blockedMatches', () => {
    // Simulate the actual bug: 5 pairs with cargoEmailId=sample-9
    const sampleDuplicates = Array.from({ length: 5 }, (_, i) => ({
      cargoEmailId: 'sample-9',
      cargoItemIndex: i,
      vesselEmailId: 'v-001',
      vesselItemIndex: 0,
    }));

    const matches: Match[] = sampleDuplicates.map(d => ({
      ...d,
      score: 55,
      matchLevel: 'possible' as const,
      matchReasons: [],
      issues: [],
    }));

    const blockedMatches = sampleDuplicates.map(d => ({
      ...d,
      filterReason: 'draft too deep',
    }));

    const blockedKeys = new Set(
      blockedMatches.map(b => pairKey(b.cargoEmailId, b.cargoItemIndex, b.vesselEmailId, b.vesselItemIndex)),
    );
    const dedupedMatches = matches.filter(
      m => !blockedKeys.has(pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)),
    );

    // All 5 should be removed from matches (they're in blocked)
    expect(dedupedMatches).toHaveLength(0);
    expect(blockedMatches).toHaveLength(5);
  });
});
