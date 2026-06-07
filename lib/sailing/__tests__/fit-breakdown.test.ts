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
  it('ANCHOR-HIGH: slabs-like (util 99%, 205nm, geared, ideal timing) → fit ≥ 80', () => {
    // NOTE: threshold updated from 88 → 80 after Task 1 (economics factor added,
    // weights rescaled ×82/100). Without explicit TCE the economics component
    // scores neutral (9/18 = 9 pts). The anchor is still clearly HIGH.
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
    expect(fb.fitPercent).toBeGreaterThanOrEqual(80);
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
    // NOTE: scores updated in Task 1 (economics factor added, weights ×82/100).
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

    expect(fb.fitPercent).toBe(84.5);
    expect(fb.components.map((c) => ({ factor: c.factor, score: c.score }))).toEqual([
      { factor: 'utilisation', score: 19 },
      { factor: 'timing',      score: 15 },
      { factor: 'ballast',     score: 11.7 },
      { factor: 'classFit',    score: 9 },
      { factor: 'cargoType',   score: 6 },
      { factor: 'cranes',      score: 6 },
      { factor: 'volume',      score: 2.6 },
      { factor: 'draft',       score: 2 },
      { factor: 'vetting',     score: 4.2 },
      { factor: 'economics',   score: 9 },
    ]);
  });

  it('breakdown lists all ten factors with non-null rationale', () => {
    // NOTE: updated from 9 → 10 in Task 1 (economics factor added).
    const cargo = makeCargo();
    const vessel = makeVessel();
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS });
    expect(fb.components).toHaveLength(10);
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
    const cargo = makeCargo({ destinationPort: { value: 'East Coast Greece port (unspecified)', confidence: 'uncertain' } });
    const vessel = makeVessel({ built: 1998 }); // age 28 @ refYear 2026
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });

  it('25yr+ vessel + VAGUE EU discharge "East Coast Italy port (unspecified)" → capped ≤55', () => {
    const cargo = makeCargo({ destinationPort: { value: 'East Coast Italy port (unspecified)', confidence: 'uncertain' } });
    const vessel = makeVessel({ built: 1998 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });

  it('25yr+ vessel + non-EU vague discharge "Egypt Mediterranean port (unspecified)" → NO EU-age cap', () => {
    const cargo = makeCargo({ destinationPort: { value: 'Egypt Mediterranean port (unspecified)', confidence: 'uncertain' } });
    const vessel = makeVessel({ built: 1998 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge|EU PSC/i);
  });
});

describe('computeFitBreakdown — EU-discharge false-positive guard (cold QA 2026-06-02)', () => {
  // Concrete NON-EU place names that merely CONTAIN an EU-country word must NOT
  // trigger the 25yr+ EU-discharge cap. The loose country-substring fallback
  // (EU_DISCHARGE_KEYWORDS) wrongly flagged these real, non-European ports.
  it.each([
    ['Dutch Harbor', 'Alaska — real US port'],
    ['New Germany', 'Durban suburb, South Africa'],
    ['Poland Spring', 'Maine, USA'],
    ['Spanish Town', 'Jamaica'],
    ['Spanish Wells', 'Bahamas'],
    ['French Guiana', 'South America'],
  ])('25yr+ vessel + non-EU "%s" (%s) → NO EU-age cap', (port) => {
    const cargo = makeCargo({ destinationPort: { value: port, confidence: 'confirmed' } });
    const vessel = makeVessel({ built: 1998 }); // age 28 @ refYear 2026
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeGreaterThan(55);
  });

  // Vague EU region descriptors (no concrete port resolves) MUST still cap —
  // guards the fix doesn't over-correct into false negatives. "European
  // continent" specifically is not flagged vague by isVagueRegion, so it locks
  // in the inline qualifier regex's coverage of "continent".
  it.each([
    'East Coast Greece port (unspecified)',
    'East Coast Italy port (unspecified)',
    'European continent',
  ])('25yr+ vessel + vague EU "%s" → still capped ≤55', (port) => {
    const cargo = makeCargo({ destinationPort: { value: port, confidence: 'uncertain' } });
    const vessel = makeVessel({ built: 1998 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });
});

describe('computeFitBreakdown — EU-discharge by resolved country (Gate5 2026-06-03)', () => {
  // Real named EU ports NOT in the region map were missed (resolvePort!==null → false).
  // Detection must be by the resolved port's COUNTRY (isEuCountry), not region map.
  it.each([
    ['Monfalcone', 'IT — founder Gate5: 1986 vessel showed fit 70, no flag'],
    ['Catania', 'IT'],
    ['Gijón', 'ES'],
    ['Sagunto', 'ES'],
    ['Thisvi', 'GR'],
  ])('25yr+ vessel + EU port "%s" (%s) → capped ≤55 with age flag', (port) => {
    const cargo = makeCargo({ destinationPort: { value: port, confidence: 'confirmed' } });
    const vessel = makeVessel({ built: 1986 }); // age 40 @ refYear 2026
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
  });

  // Non-EU Mediterranean ports (Africa) must NOT cap — the region map ('europe'
  // includes Mediterranean) wrongly flagged these as EU.
  it.each([
    ['Bejaia', 'DZ — Algeria'],
    ['Alexandria', 'EG — Egypt'],
    ['Tartus', 'SY — Syria'],
  ])('25yr+ vessel + non-EU Med "%s" (%s) → NO EU-age cap', (port) => {
    const cargo = makeCargo({ destinationPort: { value: port, confidence: 'confirmed' } });
    const vessel = makeVessel({ built: 1986 });
    const fb = computeFitBreakdown({ cargo, vessel, readiness: READY_IDEAL, sanctions: SANCTIONS_OK, hardFilters: HF_PASS, refYear: 2026 });
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/EU discharge|EU PSC/i);
  });
});

describe('computeFitBreakdown — economic cap (C3 #783)', () => {
  // Base fixture: wheat 75% util, 580nm → baseline fit ∈ [70,85] — well above the 60 main-board floor
  const cargo75 = makeCargo({
    cargoDescription: { value: 'wheat in bulk', confidence: 'confirmed' },
    weightMtMax: 3750, weightMt: { value: 3750, confidence: 'confirmed' },
  });
  const readiness580: MatchReadiness = { ...READY_IDEAL, distanceNm: 580 };

  it('negative TCE → economics gradient (no binary cap), lower than neutral but > 40', () => {
    // NOTE: Task 1 removed the binary tce<0 → ceiling 40 cap.
    // Now economics is a smooth gradient — negative TCE lowers the score
    // but does NOT trigger appliedCap. Hard money-loser exclusion is done
    // by pair-analyzer.ts bucket routing (floor), not by a cap here.
    const fb = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: -5000,
    });
    expect(fb.fitPercent).toBeGreaterThan(40);
    expect(fb.appliedCap).toBeNull();
  });

  it('undefined TCE (absent) → NO cap, fit unchanged vs no-TCE baseline', () => {
    const baseline = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
    });
    const withUndef = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: undefined,
    });
    expect(withUndef.fitPercent).toBe(baseline.fitPercent);
    expect(withUndef.appliedCap?.reason ?? '').not.toMatch(/loss|uneconomic/i);
  });

  it('null TCE → NO cap (conservative)', () => {
    const fb = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: null as unknown as number,
    });
    expect(fb.fitPercent).toBeGreaterThan(40);
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/loss|uneconomic/i);
  });

  it('zero TCE → NO cap (only strictly negative triggers)', () => {
    const fb = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 0,
    });
    expect(fb.fitPercent).toBeGreaterThan(40);
    expect(fb.appliedCap?.reason ?? '').not.toMatch(/loss|uneconomic/i);
  });

  it('small-positive TCE (500 $/day) → NO cap', () => {
    const fb = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 500,
    });
    expect(fb.fitPercent).toBeGreaterThan(40);
  });

  it('large-positive TCE (20 000 $/day) → NO cap, fit HIGHER than neutral baseline', () => {
    // NOTE: Task 1 — economics is now a gradient reward, not just a penalty cap.
    // Large positive TCE rewards the pair with near-maximum economics score (≈18).
    const baseline = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
    });
    const fb = computeFitBreakdown({
      cargo: cargo75, vessel: makeVessel(), readiness: readiness580,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      tceUsdPerDay: 20000,
    });
    expect(fb.fitPercent).toBeGreaterThan(baseline.fitPercent);
    expect(fb.appliedCap).toBeNull();
  });

  it('negative TCE + EU-age cap: EU-age cap still applies, economics is gradient', () => {
    // NOTE: Task 1 removed the binary tce<0 ceiling cap.
    // EU-age cap (ceiling 55) still applies for 25yr+ vessel discharging in EU.
    // Negative TCE lowers fit via gradient economics — no separate cap.
    const cargoEU = makeCargo({ destinationPort: { value: 'Constanța', confidence: 'confirmed' } });
    const vesselOld = makeVessel({ built: 1999 }); // 27yr @ refYear 2026
    const fb = computeFitBreakdown({
      cargo: cargoEU, vessel: vesselOld, readiness: READY_IDEAL,
      sanctions: SANCTIONS_OK, hardFilters: HF_PASS,
      refYear: 2026, tceUsdPerDay: -3000,
    });
    // EU-age cap (ceiling 55) should still be applied
    expect(fb.fitPercent).toBeLessThanOrEqual(55);
    expect(fb.appliedCap?.reason).toMatch(/EU discharge|EU PSC/i);
  });
});
