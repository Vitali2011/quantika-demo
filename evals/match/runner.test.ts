/**
 * evals/match/runner.test.ts — 25-scenario eval for the match scoring layer.
 *
 * Tests three distinct behaviors in a single suite:
 *   A. Port-pair resolution  — 6 pairs that were returning readiness=unknown due to
 *      missing matrix entries; now resolved by Phase B v2 additions.
 *   B. Idle penalty scoring  — W1 (60-day idle) must land in 'weak' tier after the
 *      -35 severe-idle penalty; shorter idles must stay 'possible'.
 *   C. Vague-region detection — sea names / country-only inputs must trigger the
 *      -20 vagueRegionAdjustment and return readiness=unknown.
 *
 * Run: npx jest evals/match/runner
 */
import { calculateReadinessGap } from '@/lib/sailing/readiness-gap';
import { computeScoreBreakdown, deriveMatchLevel } from '@/lib/sailing/match-scoring';
import type { Match, MatchReadiness, ParsedCargo, ParsedVessel } from '@/lib/types';

// Fixed reference date — all laycans in these scenarios are in Jun/Jul/Aug 2026.
const TODAY = new Date('2026-06-01T00:00:00Z');
const OPTS = { today: TODAY, refYear: 2026 };

// ── Minimal fixture factories ────────────────────────────────────────────────

function mkMatch(): Match {
  return {
    cargoEmailId: 'eval', cargoItemIndex: 0,
    vesselEmailId: 'eval', vesselItemIndex: 0,
    score: 60, matchLevel: 'possible', matchReasons: [], issues: [],
  };
}

function mkCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'eval', itemIndex: 0,
    originPort: { value: 'Karasu', confidence: 'confirmed' },
    originCountry: null, destinationPort: null, destinationCountry: null,
    cargoDescription: { value: 'steel coils', confidence: 'confirmed' },
    weightMt: { value: 5000, confidence: 'confirmed' },
    weightMtMin: null, weightMtMax: null,
    volumeCbm: null, dimensions: null,
    cargoType: 'BREAK_BULK', containerType: null, quantity: null, incoterms: null,
    preferredDates: null, laycan: '2026-06-10',
    loadingRate: null, dischargeRate: null,
    commissionPercent: null, commissionTerms: null,
    specialRequirements: null, stowageFactor: null,
    missingInfo: [],
    ...overrides,
  };
}

function mkVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'eval', itemIndex: 0,
    vesselName: { value: 'MV EVAL', confidence: 'confirmed' },
    imo: null, flag: null, built: null, classSociety: null, pandi: null,
    dwtSummer: { value: 5000, confidence: 'confirmed' },
    dwcc: null, draftMax: { value: 6.0, confidence: 'confirmed' },
    loa: null, beam: null, grt: null, nrt: null,
    holdsCount: 2, hatchesCount: 2,
    grainCapacity: 6500, grainCapacityUnit: 'cbm',
    baleCapacity: null, holdDimensions: null, hatchDimensions: null,
    tankTopStrength: null, geared: true, craneCapacity: null, hatchType: null,
    vesselType: 'bulk carrier',
    openPosition: { value: 'Karasu', confidence: 'confirmed' },
    openDate: { value: '2026-06-01', confidence: 'confirmed' },
    direction: null, restrictions: [], lastCargoes: null,
    speedLaden: null, speedBallast: null, consumption: null, deckCapacity: null,
    specialFeatures: [], verificationWarning: null,
    ...overrides,
  };
}

// Helper: run readiness + full score breakdown together.
function evalPair(
  vesselPos: string, vesselDate: string,
  cargoPort: string, laycan: string,
  vesselOverrides: Partial<ParsedVessel> = {},
  cargoOverrides: Partial<ParsedCargo> = {},
) {
  const readiness = calculateReadinessGap(
    { openDate: vesselDate, openPosition: vesselPos, speedLaden: null, dwtSummer: 25000 },
    { laycan, originPort: cargoPort },
    OPTS,
  ) as MatchReadiness;
  const bd = computeScoreBreakdown({
    match: mkMatch(),
    cargo: mkCargo({ originPort: { value: cargoPort, confidence: 'confirmed' }, laycan, ...cargoOverrides }),
    vessel: mkVessel({ openPosition: { value: vesselPos, confidence: 'confirmed' }, openDate: { value: vesselDate, confidence: 'confirmed' }, ...vesselOverrides }),
    readiness,
    sanctions: undefined,
  });
  return { readiness, bd };
}

// ── A. Port-pair resolution: 6 pairs that were readiness=unknown ─────────────

describe('A — port-pair resolution (Phase B v2)', () => {
  // Pairs added to DISTANCES_NM: Burgas|Piraeus, Novorossiysk|Piraeus,
  // Marmara|Ravenna, Izmail|Piraeus, Aliaga|Izmail. Varna|Ravenna covered by searoute.

  it('SC-01 Burgas→Piraeus load (short idle 8d) — readiness=idle, score possible', () => {
    const { readiness, bd } = evalPair('Burgas', '2026-06-01', 'Piraeus', '2026-06-11',
      { geared: false, vesselType: 'bulk carrier', dwtSummer: { value: 25000, confidence: 'confirmed' }, grainCapacity: 30000 },
      { cargoType: 'BULK', cargoDescription: { value: 'wheat', confidence: 'confirmed' }, weightMt: { value: 5000, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.distanceNm).toBe(580);
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
    expect(bd.finalScore).toBeLessThan(80);
    expect(deriveMatchLevel(bd.finalScore)).toBe('possible');
  });

  it('SC-02 Novorossiysk→Piraeus load (idle 11d) — readiness=idle, score possible', () => {
    const { readiness, bd } = evalPair('Novorossiysk', '2026-06-01', 'Piraeus', '2026-06-16',
      { geared: false, vesselType: 'bulk carrier', dwtSummer: { value: 25000, confidence: 'confirmed' }, grainCapacity: 30000 },
      { cargoType: 'BULK', cargoDescription: { value: 'wheat', confidence: 'confirmed' }, weightMt: { value: 5000, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.distanceNm).toBe(895);
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
    expect(deriveMatchLevel(bd.finalScore)).toBe('possible');
  });

  it('SC-03 Marmara→Ravenna (idle 20d) — readiness=idle, score possible', () => {
    const { readiness, bd } = evalPair('Marmara', '2026-06-01', 'Ravenna', '2026-06-26',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5500, confidence: 'confirmed' }, grainCapacity: 7000 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.distanceNm).toBe(980);
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
    expect(deriveMatchLevel(bd.finalScore)).toBe('possible');
  });

  it('SC-04 Izmail→Piraeus load (idle 8d) — readiness=idle, score possible', () => {
    const { readiness, bd } = evalPair('Izmail', '2026-06-01', 'Piraeus', '2026-06-12',
      { geared: false, vesselType: 'bulk carrier', dwtSummer: { value: 25000, confidence: 'confirmed' }, grainCapacity: 30000 },
      { cargoType: 'BULK', cargoDescription: { value: 'grain', confidence: 'confirmed' }, weightMt: { value: 5000, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.distanceNm).toBe(840);
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
    expect(deriveMatchLevel(bd.finalScore)).toBe('possible');
  });

  it('SC-05 Aliaga→Izmail load (idle 10d) — readiness=idle, score possible', () => {
    const { readiness, bd } = evalPair('Aliaga', '2026-06-01', 'Izmail', '2026-06-13',
      { geared: true, vesselType: 'bulk carrier', dwtSummer: { value: 25000, confidence: 'confirmed' }, grainCapacity: 30000 },
      { cargoType: 'BULK', cargoDescription: { value: 'wheat', confidence: 'confirmed' }, weightMt: { value: 6000, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.distanceNm).toBe(580);
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
    expect(deriveMatchLevel(bd.finalScore)).toBe('possible');
  });

  it('SC-06 Varna→Ravenna (searoute pair, ideal) — readiness≠unknown', () => {
    const r = calculateReadinessGap(
      { openDate: '2026-06-01', openPosition: 'Varna', speedLaden: null, dwtSummer: 10000 },
      { laycan: '2026-06-10', originPort: 'Ravenna' },
      OPTS,
    );
    expect(r.verdict).not.toBe('unknown');
    expect(r.distanceNm).not.toBeNull();
  });
});

// ── B. Idle penalty scoring ───────────────────────────────────────────────────

describe('B — idle penalty scoring', () => {
  // W1: the headline scenario. Novorossiysk vessel open Jun 1, cargo laycan Aug 1.
  // ~58-day idle. Before Phase B v2: no distance → readiness=unknown → score~65 (possible).
  // After: distance=895nm → readiness=idle(-35) → score≈31 → weak.
  it('SC-07 W1: Novorossiysk→Piraeus 58d idle — score<40 (weak)', () => {
    const { readiness, bd } = evalPair('Novorossiysk', '2026-06-01', 'Piraeus', '2026-08-01',
      { geared: false, vesselType: 'bulk carrier', dwtSummer: { value: 25000, confidence: 'confirmed' }, grainCapacity: 30000 },
      { cargoType: 'BULK', cargoDescription: { value: 'wheat', confidence: 'confirmed' }, weightMt: { value: 5000, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.gapDays).toBeGreaterThan(55);
    expect(bd.readinessAdjustment).toBe(-35);   // severe idle penalty (> 30d)
    expect(bd.finalScore).toBeLessThan(40);
    expect(deriveMatchLevel(bd.finalScore)).toBe('weak');
  });

  it('SC-08 Constanta→Mykolaiv 22d idle — score possible (−25 extended-idle penalty)', () => {
    const { readiness, bd } = evalPair('Constanta', '2026-06-01', 'Mykolaiv', '2026-06-24',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(readiness.gapDays).toBeGreaterThan(20);
    expect(bd.readinessAdjustment).toBe(-25);  // 22d > 14d → -25
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
    expect(deriveMatchLevel(bd.finalScore)).toBe('possible');
  });

  it('SC-09 Marmara→Istanbul 18d idle — score possible (−25 extended-idle penalty)', () => {
    const { readiness, bd } = evalPair('Marmara', '2026-06-01', 'Istanbul', '2026-06-19',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(bd.readinessAdjustment).toBe(-25);  // 18d > 14d → -25
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
  });

  it('SC-10 Taman→Novorossiysk 9d idle — score possible (−15 short-idle penalty)', () => {
    const { readiness, bd } = evalPair('Taman', '2026-06-01', 'Novorossiysk', '2026-06-11',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('idle');
    expect(bd.readinessAdjustment).toBe(-15);  // 9d ≤ 14d → -15
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
  });
});

// ── C. Vague-region detection ─────────────────────────────────────────────────

describe('C — vague-region penalty', () => {
  function vagueEval(vesselPos: string, cargoPort = 'Karasu', cargoOriginConf: 'confirmed' | 'interpreted' = 'confirmed') {
    const readiness = calculateReadinessGap(
      { openDate: '2026-06-01', openPosition: vesselPos, speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-15', originPort: cargoPort },
      OPTS,
    ) as MatchReadiness;
    const bd = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: cargoPort === 'Tunisia'
        ? { value: 'Tunisia', confidence: cargoOriginConf }
        : { value: cargoPort, confidence: cargoOriginConf } }),
      vessel: mkVessel({ openPosition: { value: vesselPos, confidence: 'confirmed' } }),
      readiness,
      sanctions: undefined,
    });
    return { readiness, bd };
  }

  it('SC-11 vessel "Red Sea" — readiness=unknown, vagueRegionAdjustment=-20', () => {
    const { readiness, bd } = vagueEval('Red Sea');
    expect(readiness.verdict).toBe('unknown');
    expect(bd.vagueRegionAdjustment).toBe(-20);
    expect(bd.finalScore).toBeLessThan(50);
  });

  it('SC-12 vessel "East Coast Greece" — readiness=unknown, vague penalty', () => {
    const { readiness, bd } = vagueEval('East Coast Greece');
    expect(readiness.verdict).toBe('unknown');
    expect(bd.vagueRegionAdjustment).toBe(-20);
  });

  it('SC-13 cargo origin "Tunisia" (country only) — readiness=unknown, vague penalty', () => {
    const readiness = calculateReadinessGap(
      { openDate: '2026-06-01', openPosition: 'Karasu', speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-15', originPort: 'Tunisia' },
      OPTS,
    ) as MatchReadiness;
    const bd = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: { value: 'Tunisia', confidence: 'confirmed' } }),
      vessel: mkVessel(),
      readiness,
      sanctions: undefined,
    });
    expect(readiness.verdict).toBe('unknown');
    expect(bd.vagueRegionAdjustment).toBe(-20);
  });

  it('SC-14 both sides specific (Piraeus vessel, Karasu cargo) — no vague penalty', () => {
    const { readiness, bd } = evalPair('Piraeus', '2026-06-01', 'Karasu', '2026-06-05');
    expect(readiness.verdict).not.toBe('unknown');
    expect(bd.vagueRegionAdjustment).toBe(0);
  });
});

// ── D. Port alias resolution ──────────────────────────────────────────────────

describe('D — port alias resolution', () => {
  it('SC-15 "Aliağa" (Turkish diacritic) resolves to Aliaga — distance computed', () => {
    const r = calculateReadinessGap(
      { openDate: '2026-06-01', openPosition: 'Aliağa', speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-10', originPort: 'Karasu' },
      OPTS,
    );
    expect(r.verdict).not.toBe('unknown');
    expect(r.distanceNm).not.toBeNull();
  });

  it('SC-16 "Marmara Island" resolves to Marmara — distance to Piraeus computed', () => {
    const r = calculateReadinessGap(
      { openDate: '2026-06-01', openPosition: 'Marmara Island', speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-06', originPort: 'Piraeus' },
      OPTS,
    );
    expect(r.verdict).not.toBe('unknown');
    expect(r.distanceNm).toBe(360);  // Marmara|Piraeus
  });

  it('SC-17 "Sea of Marmara" resolves to Marmara (aliased — NOT vague)', () => {
    const r = calculateReadinessGap(
      { openDate: '2026-06-01', openPosition: 'Sea of Marmara', speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-06', originPort: 'Piraeus' },
      OPTS,
    );
    expect(r.verdict).not.toBe('unknown');
    expect(r.distanceNm).toBe(360);
  });
});

// ── E. Good-match baselines ───────────────────────────────────────────────────

describe('E — good-match baselines', () => {
  it('SC-18 Karasu same-port load, ideal timing — score ≥65 (good)', () => {
    const { readiness, bd } = evalPair('Karasu', '2026-06-01', 'Karasu', '2026-06-03',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('ideal');
    expect(readiness.distanceNm).toBe(0);
    expect(bd.finalScore).toBeGreaterThanOrEqual(65);
    expect(deriveMatchLevel(bd.finalScore)).toBe('good');
  });

  it('SC-19 Istanbul→Karasu short ballast (95nm), ideal — score ≥60', () => {
    const { readiness, bd } = evalPair('Istanbul', '2026-06-01', 'Karasu', '2026-06-04',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('ideal');
    expect(readiness.distanceNm).toBe(95);
    expect(bd.finalScore).toBeGreaterThanOrEqual(60);
  });

  it('SC-20 Aliaga same-port load, ideal — score ≥65 (good)', () => {
    const { readiness, bd } = evalPair('Aliaga', '2026-06-01', 'Aliaga', '2026-06-03',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('ideal');
    expect(bd.finalScore).toBeGreaterThanOrEqual(65);
  });
});

// ── F. Spot vessel ────────────────────────────────────────────────────────────

describe('F — spot vessel', () => {
  it('SC-21 spot vessel Piraeus→Karasu (3d before laycan) — readiness=ideal', () => {
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Piraeus', speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-06', originPort: 'Karasu' },
      OPTS,
    );
    expect(r.isSpot).toBe(true);
    expect(r.verdict).toBe('ideal');
  });

  it('SC-22 spot vessel but laycan 65d away — readiness=idle (> SPOT_IDEAL_MAX_GAP_DAYS=30)', () => {
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: null },
      { laycan: '2026-08-05', originPort: 'Karasu' },
      OPTS,
    );
    expect(r.isSpot).toBe(true);
    expect(r.verdict).toBe('idle');
    expect(r.gapDays).toBeGreaterThan(60);
  });
});

// ── G. Long-ballast routes ────────────────────────────────────────────────────

describe('G — long-ballast routes', () => {
  it('SC-23 Hamburg→Istanbul (3430nm), ideal timing — score ≥25 (weak-possible range)', () => {
    const { readiness, bd } = evalPair('Hamburg', '2026-06-01', 'Istanbul', '2026-06-14',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).not.toBe('unknown');
    expect(readiness.distanceNm).toBeGreaterThan(3000);
    // Very long ballast drives geo score to 1-4 pts, but ideal timing adds +10
    expect(bd.finalScore).toBeGreaterThanOrEqual(25);
  });

  it('SC-24 Piraeus→Alexandria (560nm), ideal timing — score possible or good', () => {
    const { readiness, bd } = evalPair('Piraeus', '2026-06-01', 'Alexandria', '2026-06-04',
      { geared: true, vesselType: 'MPP', dwtSummer: { value: 5000, confidence: 'confirmed' }, grainCapacity: 6500 },
      { cargoType: 'BREAK_BULK', cargoDescription: { value: 'steel coils', confidence: 'confirmed' }, weightMt: { value: 4500, confidence: 'confirmed' } });
    expect(readiness.verdict).toBe('ideal');
    expect(bd.finalScore).toBeGreaterThanOrEqual(40);
  });
});

// ── H. Missing-data graceful degradation ─────────────────────────────────────

describe('H — graceful degradation', () => {
  it('SC-25 missing openDate — readiness=unknown (graceful)', () => {
    const r = calculateReadinessGap(
      { openDate: null, openPosition: 'Karasu', speedLaden: null, dwtSummer: null },
      { laycan: '2026-06-15', originPort: 'Karasu' },
      OPTS,
    );
    expect(r.verdict).toBe('unknown');
  });
});
