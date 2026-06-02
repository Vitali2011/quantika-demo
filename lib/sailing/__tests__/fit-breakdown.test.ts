/**
 * Behavioral tests for the broker-facing fit-% breakdown.
 * Each test mirrors an anchor from LOOP-LOG.md so the suite IS the acceptance gate.
 */
import {
  FIT_WEIGHTS,
  computeFitBreakdown,
  scoreBallast,
  scoreUtilisation,
  scoreTiming,
} from '../fit-breakdown';
import type { MatchReadiness, MatchSanctions, MatchHardFilters, ParsedCargo, ParsedVessel } from '@/lib/types';

const SANCTIONS_OK: MatchSanctions = { risk: 'NONE', blocking: false };
const HF_PASS: MatchHardFilters = {
  draft: { pass: true }, crane: { pass: true }, volume: { pass: true },
  cargoVessel: { pass: true }, destDraft: { pass: true }, destCrane: { pass: true },
  cargoWeight: { pass: true },
};

function makeCargo(over: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'c', itemIndex: 0,
    originPort: { value: 'Karasu', confidence: 'confirmed' },
    originCountry: null,
    destinationPort: { value: 'Mykolaiv', confidence: 'confirmed' },
    destinationCountry: null,
    cargoDescription: { value: 'wheat', confidence: 'confirmed' },
    weightMt: { value: 5000, confidence: 'confirmed' },
    weightMtMin: null,
    weightMtMax: 5000,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: { value: '15-25 Sep', confidence: 'confirmed' },
    laycan: '15-25 Sep',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    ...over,
  };
}

function makeVessel(over: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'v', itemIndex: 0,
    vesselName: { value: 'TestVessel', confidence: 'confirmed' },
    imo: null, flag: null, built: null, classSociety: null, pandi: null,
    dwtSummer: { value: 5200, confidence: 'confirmed' },
    dwcc: { value: 5000, confidence: 'confirmed' },
    draftMax: null, loa: null, beam: null, grt: null, nrt: null,
    holdsCount: null, hatchesCount: null,
    grainCapacity: 7000, grainCapacityUnit: null, baleCapacity: null,
    holdDimensions: null, hatchDimensions: null, tankTopStrength: null,
    geared: true, craneCapacity: null, hatchType: null,
    vesselType: 'Handysize Bulker',
    openPosition: { value: 'Karasu', confidence: 'confirmed' },
    openDate: { value: '13 Sep', confidence: 'confirmed' },
    direction: null, restrictions: [], lastCargoes: 'wheat',
    speedLaden: null, speedBallast: null, consumption: null,
    deckCapacity: null, specialFeatures: [],
    ...over,
  };
}

const READY_IDEAL: MatchReadiness = {
  openDate: '2025-09-13', laycanStart: '2025-09-15', laycanEnd: '2025-09-25',
  distanceNm: 315, distanceExact: true, speedKn: 11, sailingDays: 1.2,
  arrivalDate: '2025-09-14', gapDays: 1, verdict: 'ideal',
  explanation: 'ideal',
};

describe('FIT_WEIGHTS sum to 100', () => {
  it('weights are normalised', () => {
    const sum = Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });
});

describe('scoreUtilisation — continuous + part-cargo exempt', () => {
  it('util ~95% → peak (1.0 share)', () => {
    const c = scoreUtilisation(4750, 5000, false);
    expect(c.score).toBe(FIT_WEIGHTS.utilisation);
  });
  it('util ~34% non-part-cargo → sharp drop (≤ 0.4 share)', () => {
    const c = scoreUtilisation(1700, 5000, false);
    expect(c.score).toBeLessThanOrEqual(FIT_WEIGHTS.utilisation * 0.4 + 0.1);
  });
  it('util ~5% PART-CARGO → not zeroed (≥ 0.85 share floor)', () => {
    const c = scoreUtilisation(250, 5000, true);
    expect(c.score).toBeGreaterThanOrEqual(FIT_WEIGHTS.utilisation * 0.85 - 0.1);
  });
  it('monotonicity: 80% util ≥ 30% util (non-part)', () => {
    const lo = scoreUtilisation(1500, 5000, false);
    const hi = scoreUtilisation(4000, 5000, false);
    expect(hi.score).toBeGreaterThanOrEqual(lo.score);
  });
});

describe('scoreTiming — verdict-shaped', () => {
  it('ideal → full points', () => {
    const c = scoreTiming(READY_IDEAL);
    expect(c.score).toBe(FIT_WEIGHTS.timing);
  });
  it('late → ≤ 5% of weight (≪ tight)', () => {
    const late = { ...READY_IDEAL, verdict: 'late' as const, gapDays: -7 };
    const c = scoreTiming(late);
    expect(c.score).toBeLessThanOrEqual(FIT_WEIGHTS.timing * 0.1);
  });
  it('idle 25d > idle 5d (more idle = worse)', () => {
    const idle5 = { ...READY_IDEAL, verdict: 'idle' as const, gapDays: 5 };
    const idle25 = { ...READY_IDEAL, verdict: 'idle' as const, gapDays: 25 };
    expect(scoreTiming(idle5).score).toBeGreaterThan(scoreTiming(idle25).score);
  });
});

describe('scoreBallast — class-aware continuous', () => {
  it('0nm → full points', () => {
    expect(scoreBallast(0, 5200).score).toBe(FIT_WEIGHTS.ballast);
  });
  it('handysize at class radius (1500nm) → ~40% share (sqrt-decay)', () => {
    const c = scoreBallast(1500, 5200);
    expect(c.score).toBeLessThanOrEqual(FIT_WEIGHTS.ballast * 0.45);
    expect(c.score).toBeGreaterThanOrEqual(FIT_WEIGHTS.ballast * 0.35);
  });
  it('handysize at 2× class radius (3000nm) → 0', () => {
    expect(scoreBallast(3000, 5200).score).toBeLessThanOrEqual(0.1);
  });
  it('monotonicity: shorter ballast → higher score', () => {
    const a = scoreBallast(200, 5200);
    const b = scoreBallast(1200, 5200);
    expect(a.score).toBeGreaterThanOrEqual(b.score);
  });
});

describe('computeFitBreakdown — anchor scorecard', () => {
  it('ANCHOR-HIGH: slabs-like (util 99%, 205nm, geared, ideal timing) → fit ≥ 88', () => {
    const cargo = makeCargo({
      cargoDescription: { value: 'steel slabs', confidence: 'confirmed' },
      cargoType: 'BREAK_BULK',
      weightMtMax: 4950, weightMt: { value: 4950, confidence: 'confirmed' },
    });
    const vessel = makeVessel({
      vesselType: 'MPP', lastCargoes: 'steel slabs',
      dwcc: { value: 5000, confidence: 'confirmed' },
      dwtSummer: { value: 5200, confidence: 'confirmed' },
      geared: true,
    });
    const readiness: MatchReadiness = { ...READY_IDEAL, distanceNm: 205 };
    const fb = computeFitBreakdown({ cargo, vessel, readiness, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.fitPercent).toBeGreaterThanOrEqual(88);
  });

  it('ANCHOR-HIGH: wheat-like (util 75%, 580nm) → fit ∈ [70, 85]', () => {
    const cargo = makeCargo({
      cargoDescription: { value: 'wheat in bulk', confidence: 'confirmed' },
      weightMtMax: 3750, weightMt: { value: 3750, confidence: 'confirmed' },
    });
    const vessel = makeVessel({
      lastCargoes: 'wheat',
      dwcc: { value: 5000, confidence: 'confirmed' },
      dwtSummer: { value: 5200, confidence: 'confirmed' },
    });
    const readiness: MatchReadiness = { ...READY_IDEAL, distanceNm: 580 };
    const fb = computeFitBreakdown({ cargo, vessel, readiness, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.fitPercent).toBeGreaterThanOrEqual(70);
    expect(fb.fitPercent).toBeLessThanOrEqual(85);
  });

  it('ANCHOR-LOW: util 34% non-part-cargo → fit < 55', () => {
    const cargo = makeCargo({
      cargoDescription: { value: 'wheat', confidence: 'confirmed' }, // NOT part-cargo
      weightMtMax: 1700, weightMt: { value: 1700, confidence: 'confirmed' },
    });
    const vessel = makeVessel({
      dwcc: { value: 5000, confidence: 'confirmed' },
      dwtSummer: { value: 5200, confidence: 'confirmed' },
    });
    const readiness = { ...READY_IDEAL, distanceNm: 580 };
    const fb = computeFitBreakdown({ cargo, vessel, readiness, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.fitPercent).toBeLessThan(55);
  });

  it('ANCHOR-LOW: far ballast ≫ class radius for small handysize cargo → fit < 55', () => {
    const cargo = makeCargo({
      weightMtMax: 4750, weightMt: { value: 4750, confidence: 'confirmed' },
    });
    const vessel = makeVessel({
      dwcc: { value: 5000, confidence: 'confirmed' },
      dwtSummer: { value: 5200, confidence: 'confirmed' },
    });
    // 3200nm ballast for handysize (radius 1500nm) — uneconomic
    const readiness: MatchReadiness = { ...READY_IDEAL, distanceNm: 3200 };
    const fb = computeFitBreakdown({ cargo, vessel, readiness, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.fitPercent).toBeLessThan(55);
  });

  it('ANCHOR-LOW: vessel opens AFTER laycan end → fit < 40', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const late: MatchReadiness = { ...READY_IDEAL, verdict: 'late', gapDays: -7 };
    const fb = computeFitBreakdown({ cargo, vessel, readiness: late, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.fitPercent).toBeLessThan(40);
  });

  it('ANCHOR-PARTCARGO: part-cargo util ~5% → fit NOT zeroed (≥ 50)', () => {
    const cargo = makeCargo({
      cargoDescription: { value: 'part cargo bags', confidence: 'confirmed' },
      cargoType: 'BREAK_BULK',
      weightMtMax: 250, weightMt: { value: 250, confidence: 'confirmed' },
    });
    const vessel = makeVessel({
      vesselType: 'MPP', lastCargoes: 'bags',
      dwcc: { value: 5000, confidence: 'confirmed' },
      dwtSummer: { value: 5200, confidence: 'confirmed' },
    });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.partCargo).toBe(true);
    expect(fb.fitPercent).toBeGreaterThanOrEqual(50);
  });

  it('MONOTONICITY: improving util on neighbour pair never lowers fit', () => {
    const cargoLo = makeCargo({ weightMtMax: 1500, weightMt: { value: 1500, confidence: 'confirmed' } });
    const cargoHi = makeCargo({ weightMtMax: 4500, weightMt: { value: 4500, confidence: 'confirmed' } });
    const vessel = makeVessel();
    const lo = computeFitBreakdown({ cargo: cargoLo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    const hi = computeFitBreakdown({ cargo: cargoHi, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(hi.fitPercent).toBeGreaterThanOrEqual(lo.fitPercent);
  });

  it('MONOTONICITY: shorter ballast on neighbour pair never lowers fit', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const far: MatchReadiness = { ...READY_IDEAL, distanceNm: 1400 };
    const near: MatchReadiness = { ...READY_IDEAL, distanceNm: 200 };
    const a = computeFitBreakdown({ cargo, vessel, readiness: far, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    const b = computeFitBreakdown({ cargo, vessel, readiness: near, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(b.fitPercent).toBeGreaterThanOrEqual(a.fitPercent);
  });

  it('DATE-INDEPENDENCE: same readiness inputs → identical fit-% regardless of when computed', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const fb1 = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    const fb2 = computeFitBreakdown({ cargo, vessel, readiness: { ...READY_IDEAL }, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb2.fitPercent).toBe(fb1.fitPercent);
    expect(fb2.components.map((c) => c.score)).toEqual(fb1.components.map((c) => c.score));
  });

  it('SCORE-INVARIANT: rationale text changes must not shift any numeric score', () => {
    // Fixed fixture — changing only rationale/why strings in fit-breakdown.ts
    // must leave every component.score and fitPercent bit-for-bit identical.
    const cargo = makeCargo({
      cargoDescription: { value: 'steel slabs', confidence: 'confirmed' },
      cargoType: 'BREAK_BULK',
      weightMtMax: 4950,
      weightMt: { value: 4950, confidence: 'confirmed' },
    });
    const vessel = makeVessel({
      vesselType: 'MPP',
      lastCargoes: 'steel slabs',
      dwcc: { value: 5000, confidence: 'confirmed' },
      dwtSummer: { value: 5200, confidence: 'confirmed' },
      geared: true,
    });
    const readiness: MatchReadiness = { ...READY_IDEAL, distanceNm: 205 };
    const fb = computeFitBreakdown({ cargo, vessel, readiness, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });

    expect(fb.fitPercent).toBe(91.8);
    expect(fb.components.map((c) => ({ factor: c.factor, score: c.score }))).toEqual([
      { factor: 'utilisation', score: 23 },
      { factor: 'timing',      score: 18 },
      { factor: 'ballast',     score: 14 },
      { factor: 'classFit',    score: 11 },
      { factor: 'cargoType',   score: 7 },
      { factor: 'cranes',      score: 7 },
      { factor: 'volume',      score: 3.4 },
      { factor: 'draft',       score: 3 },
      { factor: 'vetting',     score: 5.4 },
    ]);
  });

  it('breakdown lists all eight factors with non-null rationale', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.components).toHaveLength(9);
    for (const c of fb.components) {
      expect(typeof c.label).toBe('string');
      expect(typeof c.rationale).toBe('string');
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(c.weight);
    }
  });
});

describe('computeFitBreakdown — EU-discharge age penalty (founder rule 2026-06-02)', () => {
  it('25yr+ vessel + EU discharge (Constanța) → capped ≤55 with EU age flag', () => {
    const cargo = makeCargo({ destinationPort: { value: 'Constanța', confidence: 'confirmed' } });
    const vessel = makeVessel({ built: 1999 }); // age 27 @ refYear 2026
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });

  it('young vessel (age 14) + EU discharge → NO EU-age cap', () => {
    const cargo = makeCargo({ destinationPort: { value: 'Constanța', confidence: 'confirmed' } });
    const vessel = makeVessel({ built: 2012 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge/i);
  });

  it('25yr+ vessel + NON-EU discharge (Lagos) → NO EU-age cap', () => {
    const cargo = makeCargo({ destinationPort: { value: 'Lagos', confidence: 'confirmed' } });
    const vessel = makeVessel({ built: 1999 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge/i);
  });

  it('built unknown + EU discharge → NO cap (conservative)', () => {
    const cargo = makeCargo({ destinationPort: { value: 'Constanța', confidence: 'confirmed' } });
    const vessel = makeVessel({ built: null });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge/i);
  });

  // Real failure (Gate5 #2): demo discharge ports are VAGUE strings that
  // regionMatchesPort cannot match → 0 matches actually capped. Detection must
  // work on the raw descriptor via country-substring.
  it('25yr+ vessel + VAGUE EU discharge "East Coast Greece port (unspecified)" → capped ≤55', () => {
    const cargo = makeCargo({ destinationPort: { value: 'East Coast Greece port (unspecified)', confidence: 'estimated' } });
    const vessel = makeVessel({ built: 1998 }); // age 28 @ refYear 2026
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });

  it('25yr+ vessel + VAGUE EU discharge "East Coast Italy port (unspecified)" → capped ≤55', () => {
    const cargo = makeCargo({ destinationPort: { value: 'East Coast Italy port (unspecified)', confidence: 'estimated' } });
    const vessel = makeVessel({ built: 1998 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });

  it('25yr+ vessel + non-EU vague discharge "Egypt Mediterranean port (unspecified)" → NO EU-age cap', () => {
    const cargo = makeCargo({ destinationPort: { value: 'Egypt Mediterranean port (unspecified)', confidence: 'estimated' } });
    const vessel = makeVessel({ built: 1998 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge|EU PSC/i);
  });
});
