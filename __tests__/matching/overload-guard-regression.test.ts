/**
 * Regression tests for βf2-01: applyOverloadGuard idempotency
 * and analyzePairs performance on edge fixture (cargo > DWCC).
 *
 * Requirements:
 * - applyOverloadGuard is idempotent (calling twice → same result)
 * - analyzePairs completes in <500ms on edge fixture (cargo > DWCC)
 * - applyOverloadGuard does NOT remove OVERLOAD issue on second call
 */

import { applyReadinessScoring, applyOverloadGuard } from '@/lib/sailing/match-scoring';
import { analyzePairs } from '@/lib/matching/pair-analyzer';
import type { AiScorer } from '@/lib/matching/pair-analyzer';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

// Re-use fixture builders similar to utilization-overload-guard.test.ts

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score: 75,
    matchLevel: 'good',
    matchReasons: ['Test'],
    issues: [],
    ...overrides,
  };
}

function makeCargo(weightMt: number): ParsedCargo {
  return {
    emailId: 'c1',
    itemIndex: 0,
    originPort: null,
    originCountry: null,
    destinationPort: null,
    destinationCountry: null,
    cargoDescription: null,
    weightMt: { value: weightMt, confidence: 'confirmed' },
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
  };
}

function makeVessel(dwccValue: number | null): ParsedVessel {
  return {
    emailId: 'v1',
    itemIndex: 0,
    vesselName: null,
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: dwccValue ?? 10000, confidence: 'confirmed' },
    dwcc: dwccValue != null ? { value: dwccValue, confidence: 'confirmed' } : null,
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
    vesselType: 'Bulk carrier',
    openPosition: null,
    openDate: { value: 'spot', confidence: 'confirmed' as const },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: '12',
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('applyOverloadGuard idempotency (βf2-01 regression)', () => {
  /**
   * R-1: Calling applyOverloadGuard twice on same overload pair
   * must yield identical result (no double-penalty, no cleared issues).
   */
  it('R-1: idempotent — calling guard twice gives same result', () => {
    const match = baseMatch({ score: 75, matchLevel: 'good' });
    const cargo = makeCargo(8500);
    const vessel = makeVessel(4900);

    const first = applyOverloadGuard(match, cargo, vessel);
    const second = applyOverloadGuard({ ...first }, cargo, vessel);

    expect(second.score).toBe(first.score);
    expect(second.matchLevel).toBe(first.matchLevel);
    // Issues should not duplicate OVERLOAD entry
    const overloadCount = second.issues.filter((i) => i.includes('OVERLOAD')).length;
    expect(overloadCount).toBe(1);
  });

  /**
   * R-2: applyReadinessScoring with no readiness — guard idempotent.
   * Second call through applyReadinessScoring does not un-guard.
   */
  it('R-2: applyReadinessScoring idempotent — guard not removed on second pass', () => {
    const match = baseMatch({ score: 75, matchLevel: 'good' });
    const cargo = makeCargo(8500);
    const vessel = makeVessel(4900);

    const first = applyReadinessScoring(match, undefined, cargo, vessel);
    const second = applyReadinessScoring({ ...first }, undefined, cargo, vessel);

    expect(second.matchLevel).toBe('weak');
    expect(second.score).toBeLessThanOrEqual(35);
    const overloadCount = second.issues.filter((i) => i.includes('OVERLOAD')).length;
    expect(overloadCount).toBe(1);
  });
});

describe('analyzePairs performance edge fixture (βf2-01 regression)', () => {
  /**
   * R-3: analyzePairs with cargo > DWCC must complete in <500ms.
   * aiScorer mock resolves instantly (no network).
   * This catches any infinite loop in overload guard path.
   */
  it('R-3: analyzePairs <500ms with cargo > DWCC edge fixture', async () => {
    const cargo = makeCargo(8500);
    const vessel = makeVessel(4900);

    const aiScorer: AiScorer = async () => [];

    const start = Date.now();
    const result = await analyzePairs([cargo], [vessel], aiScorer, {
      refYear: 2025,
      today: new Date('2025-09-01'),
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    // The overloaded pair — may be in blocked or in matches with OVERLOAD issue
    // (depends on whether other filters also fire). Either way, no infinite loop.
    expect(result).toBeDefined();
  }, 5000);
});
