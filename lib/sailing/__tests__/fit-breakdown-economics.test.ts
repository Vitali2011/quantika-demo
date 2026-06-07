/**
 * Tests for Task 1: graded economics factor (~18pt) in fitPercent.
 *
 * Coverage:
 *   - FIT_WEIGHTS now includes 'economics' at 18; other 9 factors scaled ×82/100; total still 100
 *   - economicsNorm mapping: null/undefined → 0.5 (neutral), profit → toward 1, loss → toward 0
 *   - monotonicity: higher TCE → higher economics score
 *   - economics component appears in breakdown components list
 *   - old binary tce<0 → ceiling 40 cap is REMOVED (no appliedCap on negative TCE)
 *   - smooth gradient: negative TCE gives low-but-nonzero score (not hard cap)
 *   - class breakeven thresholds match pair-analyzer.ts:835-838 (1500/3000/5500/7500)
 */

import {
  FIT_WEIGHTS,
  computeFitBreakdown,
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

// ── Weight table ──────────────────────────────────────────────────────────────

describe('FIT_WEIGHTS — economics factor added', () => {
  it('economics weight is 18', () => {
    expect(FIT_WEIGHTS.economics).toBe(18);
  });

  it('total weight is exactly 100', () => {
    const sum = Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('all 10 factors present', () => {
    const factors = Object.keys(FIT_WEIGHTS);
    expect(factors).toContain('economics');
    expect(factors).toContain('utilisation');
    expect(factors).toContain('timing');
    expect(factors).toContain('ballast');
    expect(factors).toContain('classFit');
    expect(factors).toContain('cargoType');
    expect(factors).toContain('cranes');
    expect(factors).toContain('volume');
    expect(factors).toContain('draft');
    expect(factors).toContain('vetting');
  });

  it('proposed rounded set matches spec exactly', () => {
    expect(FIT_WEIGHTS.utilisation).toBe(19);
    expect(FIT_WEIGHTS.timing).toBe(15);
    expect(FIT_WEIGHTS.ballast).toBe(15);
    expect(FIT_WEIGHTS.classFit).toBe(9);
    expect(FIT_WEIGHTS.cargoType).toBe(6);
    expect(FIT_WEIGHTS.cranes).toBe(6);
    expect(FIT_WEIGHTS.volume).toBe(3);
    expect(FIT_WEIGHTS.draft).toBe(2);
    expect(FIT_WEIGHTS.vetting).toBe(7);
    expect(FIT_WEIGHTS.economics).toBe(18);
  });
});

// ── Economics component in breakdown ─────────────────────────────────────────

describe('computeFitBreakdown — economics component present', () => {
  const cargo = makeCargo();
  const vessel = makeVessel();

  it('economics component appears in breakdown when tceUsdPerDay provided', () => {
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 4000,
    });
    const econ = fb.components.find((c) => c.factor === 'economics');
    expect(econ).toBeDefined();
    expect(econ!.weight).toBe(18);
    expect(econ!.score).toBeGreaterThanOrEqual(0);
    expect(econ!.score).toBeLessThanOrEqual(18);
  });

  it('economics component appears in breakdown when tceUsdPerDay absent (neutral)', () => {
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
    });
    const econ = fb.components.find((c) => c.factor === 'economics');
    expect(econ).toBeDefined();
    // null/undefined → 0.5 norm → 9 pts
    expect(econ!.score).toBe(9);
  });

  it('components list has exactly 10 entries', () => {
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 5000,
    });
    expect(fb.components).toHaveLength(10);
  });
});

// ── economicsNorm mapping ─────────────────────────────────────────────────────

describe('economics score — gradient mapping', () => {
  const cargo = makeCargo();

  function econScore(tce: number | undefined, dwtSummer: number): number {
    const vessel = makeVessel({ dwtSummer: { value: dwtSummer, confidence: 'confirmed' } });
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: tce,
    });
    return fb.components.find((c) => c.factor === 'economics')!.score;
  }

  it('null TCE → neutral 9 pts (round(18*0.5))', () => {
    const score = econScore(undefined, 5200);
    expect(score).toBe(9);
  });

  // Handysize class: DWT ≤ 15000, breakeven = 1500 $/day
  it('Handysize at breakeven (1500 $/day) → ~9 pts (neutral)', () => {
    // tanh(0) = 0 → norm = 0.5 → 9 pts
    const score = econScore(1500, 5200);
    expect(score).toBe(9);
  });

  it('Handysize well above breakeven → > 9 pts', () => {
    const score = econScore(5000, 5200);
    expect(score).toBeGreaterThan(9);
  });

  it('Handysize below breakeven (loss) → < 9 pts', () => {
    const score = econScore(-500, 5200);
    expect(score).toBeLessThan(9);
  });

  it('Handysize below breakeven score > 0 (no hard zero)', () => {
    // gradient, not binary cap
    const score = econScore(-500, 5200);
    expect(score).toBeGreaterThan(0);
  });

  // Small vessel class: DWT ≤ 15000, breakeven = 1500 $/day
  it('Small vessel (8000 dwt) at breakeven 1500 → ~9 pts', () => {
    const score = econScore(1500, 8000);
    expect(score).toBe(9);
  });

  // Handymax class: 15001-40000, breakeven = 3000
  it('Handymax (30000 dwt) at breakeven 3000 → ~9 pts', () => {
    const score = econScore(3000, 30000);
    expect(score).toBe(9);
  });

  it('Handymax (30000 dwt) above breakeven 3000 → > 9 pts', () => {
    const score = econScore(8000, 30000);
    expect(score).toBeGreaterThan(9);
  });

  // Supramax/Ultramax class: 40001-65000, breakeven = 5500
  it('Supramax (55000 dwt) at breakeven 5500 → ~9 pts', () => {
    const score = econScore(5500, 55000);
    expect(score).toBe(9);
  });

  // Panamax+ class: > 65000, breakeven = 7500
  it('Panamax (75000 dwt) at breakeven 7500 → ~9 pts', () => {
    const score = econScore(7500, 75000);
    expect(score).toBe(9);
  });

  // Monotonicity: higher TCE → higher score
  it('monotonicity: higher TCE → higher or equal economics score', () => {
    const low = econScore(0, 5200);
    const mid = econScore(3000, 5200);
    const high = econScore(8000, 5200);
    expect(mid).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(mid);
  });

  it('max score bounded by weight (≤ 18)', () => {
    // very high TCE → tanh approaches 1 → norm approaches 1 → score ≤ 18
    const score = econScore(100_000, 5200);
    expect(score).toBeLessThanOrEqual(18);
  });

  it('min score ≥ 0 (never negative)', () => {
    // very large loss → tanh approaches -1 → norm approaches 0 → score ≥ 0
    const score = econScore(-100_000, 5200);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ── Cap removal ───────────────────────────────────────────────────────────────

describe('binary tce<0 ceiling cap is removed', () => {
  const cargo = makeCargo();

  it('negative TCE does NOT trigger appliedCap', () => {
    const vessel = makeVessel();
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: -500,
    });
    // The old cap set ceiling:40 for tce<0; it should be gone
    expect(fb.appliedCap).toBeNull();
  });

  it('negative TCE: fitPercent > 40 for an otherwise good pair', () => {
    // ideal timing + good util + short ballast + geared vessel — only economics is weak
    // Without binary cap the fit should be well above 40
    const vessel = makeVessel();
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: -200,
    });
    expect(fb.fitPercent).toBeGreaterThan(40);
  });

  it('positive TCE does not trigger tce cap', () => {
    const vessel = makeVessel();
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 5000,
    });
    expect(fb.appliedCap).toBeNull();
  });

  // Other caps still apply
  it('late verdict still triggers its own cap', () => {
    const vessel = makeVessel();
    const late = { ...READY_IDEAL, verdict: 'late' as const, gapDays: -10 };
    const fb = computeFitBreakdown({
      cargo, vessel, readiness: late,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 5000,
    });
    expect(fb.appliedCap).not.toBeNull();
    expect(fb.appliedCap!.ceiling).toBe(38);
  });
});

// ── Fit impact comparison ─────────────────────────────────────────────────────

describe('economics factor raises fit for profitable voyages vs neutral', () => {
  const cargo = makeCargo();
  const vessel = makeVessel();

  it('profitable TCE yields higher fitPercent than absent TCE', () => {
    const neutral = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
    });
    // Handysize breakeven 1500; 8000 $/day is well above → economics near max
    const profitable = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 8000,
    });
    expect(profitable.fitPercent).toBeGreaterThan(neutral.fitPercent);
  });

  it('loss-making TCE yields lower fitPercent than absent TCE', () => {
    const neutral = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
    });
    const losing = computeFitBreakdown({
      cargo, vessel, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: -2000,
    });
    expect(losing.fitPercent).toBeLessThan(neutral.fitPercent);
  });
});
