/**
 * TDD tests for ATLAS DWCC overload hard tier guard (βf2-01).
 *
 * Verifies that a cargo exceeding vessel DWCC is always downgraded to
 * matchLevel='weak' with score ≤ 35 and an OVERLOAD warning in issues,
 * regardless of aggregate score from other components.
 */
import { applyReadinessScoring, applyOverloadGuard } from '@/lib/sailing/match-scoring';
import type { Match, MatchReadiness, ParsedCargo, ParsedVessel } from '@/lib/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score: 75,
    matchLevel: 'good',
    matchReasons: ['Test match'],
    issues: [],
    ...overrides,
  };
}

function makeCargo(weightMt: number, weightMtMin?: number | null, weightMtMax?: number | null): ParsedCargo {
  return {
    emailId: 'c1',
    itemIndex: 0,
    originPort: null,
    originCountry: null,
    destinationPort: null,
    destinationCountry: null,
    cargoDescription: null,
    weightMt: { value: weightMt, confidence: 'confirmed' },
    weightMtMin: weightMtMin ?? null,
    weightMtMax: weightMtMax ?? null,
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
    dwtSummer: null,
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

function idealReadiness(): MatchReadiness {
  return {
    openDate: '2025-09-05',
    laycanStart: '2025-09-15',
    laycanEnd: '2025-09-25',
    distanceNm: 200,
    speedKn: 12.5,
    sailingDays: 0.67,
    arrivalDate: '2025-09-06',
    gapDays: 9,
    verdict: 'ideal',
    explanation: 'ideal timing',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DWCC overload hard tier guard (βf2-01)', () => {
  /**
   * TDD-1: Clear overload case — cargo 8500mt on 4900 DWCC vessel.
   * This is the exact user-reported scenario. Guard must fire.
   */
  it('TDD-1: overload triggers weak tier + score ≤ 35 + OVERLOAD issue', () => {
    const match = baseMatch({ score: 75, matchLevel: 'good' });
    const cargo = makeCargo(8500);
    const vessel = makeVessel(4900);

    const result = applyOverloadGuard(match, cargo, vessel);

    expect(result.matchLevel).toBe('weak');
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(true);
  });

  /**
   * TDD-2: Boundary — cargo exactly equals DWCC. Not overload.
   */
  it('TDD-2: boundary equal (cargo === DWCC) — NOT overload', () => {
    const match = baseMatch({ score: 70, matchLevel: 'good' });
    const cargo = makeCargo(4900);
    const vessel = makeVessel(4900);

    const result = applyOverloadGuard(match, cargo, vessel);

    expect(result.matchLevel).toBe('good');
    expect(result.score).toBe(70);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(false);
  });

  /**
   * TDD-3: Boundary +1 — cargo one MT above DWCC triggers overload.
   */
  it('TDD-3: boundary +1 (cargo = DWCC + 1) → overload, weak', () => {
    const match = baseMatch({ score: 70, matchLevel: 'good' });
    const cargo = makeCargo(4901);
    const vessel = makeVessel(4900);

    const result = applyOverloadGuard(match, cargo, vessel);

    expect(result.matchLevel).toBe('weak');
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(true);
  });

  /**
   * TDD-4: Range cargo — weightMtMax 5500, DWCC 4900.
   * Max exceeds DWCC → overload. Guard uses weightMtMax when present.
   */
  it('TDD-4: cargo range (min 4500, max 5500), DWCC 4900 → overload (max > DWCC)', () => {
    const match = baseMatch({ score: 72, matchLevel: 'good' });
    // weightMt = 4500, weightMtMax = 5500 — max exceeds DWCC
    const cargo = makeCargo(4500, 4500, 5500);
    const vessel = makeVessel(4900);

    const result = applyOverloadGuard(match, cargo, vessel);

    expect(result.matchLevel).toBe('weak');
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(true);
  });

  /**
   * TDD-5: No DWCC on vessel — guard does not fire.
   */
  it('TDD-5: vessel DWCC null → guard does not trigger', () => {
    const match = baseMatch({ score: 70, matchLevel: 'good' });
    const cargo = makeCargo(8500);
    const vessel = makeVessel(null);

    const result = applyOverloadGuard(match, cargo, vessel);

    expect(result.matchLevel).toBe('good');
    expect(result.score).toBe(70);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(false);
  });

  /**
   * TDD-6: No readiness passed to applyReadinessScoring — guard still fires.
   * Overload check is independent of readiness verdict.
   */
  it('TDD-6: no readiness arg → guard still fires when cargo > DWCC', () => {
    const match = baseMatch({ score: 75, matchLevel: 'good' });
    const cargo = makeCargo(8500);
    const vessel = makeVessel(4900);

    const result = applyReadinessScoring(match, undefined, cargo, vessel);

    expect(result.matchLevel).toBe('weak');
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(true);
  });

  /**
   * TDD-7: Regression nominal — good match stays good.
   * cargo 4500mt, DWCC 4900mt, ideal timing → tier='good'.
   */
  it('TDD-7: regression nominal — cargo 4500mt, DWCC 4900mt, ideal → still good', () => {
    // Base score 62 + ideal bonus (+10) = 72 → good
    const match = baseMatch({ score: 62, matchLevel: 'possible' });
    const cargo = makeCargo(4500);
    const vessel = makeVessel(4900);
    const readiness = idealReadiness();

    const result = applyReadinessScoring(match, readiness, cargo, vessel);

    expect(result.matchLevel).toBe('good');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.issues.some((i) => i.includes('OVERLOAD'))).toBe(false);
  });
});
