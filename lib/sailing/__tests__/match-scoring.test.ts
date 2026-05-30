import { computeScoreBreakdown } from '../match-scoring';
import type { Match, MatchReadiness, MatchSanctions, ParsedCargo, ParsedVessel } from '@/lib/types';

function mkMatch(score = 60, level: Match['matchLevel'] = 'possible'): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score,
    matchLevel: level,
    matchReasons: [],
    issues: [],
  };
}

function mkCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'c1',
    itemIndex: 0,
    originPort: { value: 'Karasu', confidence: 'confirmed' },
    originCountry: 'TR',
    destinationPort: { value: 'Ravenna', confidence: 'confirmed' },
    destinationCountry: 'IT',
    cargoDescription: { value: 'steel coils', confidence: 'confirmed' },
    weightMt: { value: 4800, confidence: 'confirmed' },
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BREAK_BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: '2025-09-10',
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    ...overrides,
  };
}

function mkVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'v1',
    itemIndex: 0,
    vesselName: { value: 'MV ALERIA-1', confidence: 'confirmed' },
    imo: '9540003',
    flag: 'TR',
    built: 2011,
    classSociety: null,
    pandi: null,
    dwtSummer: { value: 5200, confidence: 'confirmed' },
    dwcc: null,
    draftMax: { value: 5.6, confidence: 'confirmed' },
    loa: 100,
    beam: 16,
    grt: null,
    nrt: null,
    holdsCount: 2,
    hatchesCount: 2,
    grainCapacity: 6200,
    grainCapacityUnit: 'cbm',
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: true,
    craneCapacity: null,
    hatchType: null,
    vesselType: 'general cargo',
    openPosition: { value: 'Karasu', confidence: 'confirmed' },
    openDate: { value: '2025-09-05', confidence: 'confirmed' },
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
    verificationWarning: null,
    ...overrides,
  };
}

function mkReadiness(verdict: MatchReadiness['verdict'] = 'ideal'): MatchReadiness {
  return {
    openDate: '2025-09-05',
    laycanStart: '2025-09-10',
    laycanEnd: '2025-09-12',
    distanceNm: 400,
    speedKn: 12,
    sailingDays: 1.4,
    arrivalDate: '2025-09-06',
    gapDays: 3.5,
    verdict,
    explanation: 'test',
  };
}

describe('computeScoreBreakdown', () => {
  it('returns components that sum to basePhysical', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadiness('ideal'),
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    const sum = b.components.reduce((a, c) => a + c.points, 0);
    expect(sum).toBe(b.basePhysical);
    expect(b.components.length).toBeGreaterThan(0);
  });

  it('ideal readiness adds +10', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadiness('ideal'),
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    expect(b.readinessAdjustment).toBe(10);
  });

  it('idle readiness subtracts 15 for short idle (≤14d)', () => {
    // mkReadiness default gapDays=3.5 → short-idle tier
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadiness('idle'),
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    expect(b.readinessAdjustment).toBe(-15);
  });

  it('idle readiness subtracts 25 for extended idle (15-30d)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: { ...mkReadiness('idle'), gapDays: 20 },
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    expect(b.readinessAdjustment).toBe(-25);
  });

  it('idle readiness subtracts 35 for severe idle (>30d)', () => {
    // Phase B finding: 67-day idle was scoring same as 5-day idle
    // before this fix. Severe idle = -35 (closer to 'late' penalty).
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: { ...mkReadiness('idle'), gapDays: 67 },
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    expect(b.readinessAdjustment).toBe(-35);
  });

  it('idle with missing gapDays falls back to -15 (graceful)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: { ...mkReadiness('idle'), gapDays: null },
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    expect(b.readinessAdjustment).toBe(-15);
  });

  it('MEDIUM sanctions subtracts 10', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadiness('tight'),
      sanctions: { risk: 'MEDIUM', blocking: false } as MatchSanctions,
    });
    expect(b.sanctionsAdjustment).toBe(-10);
  });

  it('gearless+crane-less port would show reduced crane component', () => {
    const b1 = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel({ geared: true }),
      readiness: mkReadiness('ideal'),
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    const b2 = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel({ geared: false }),
      readiness: mkReadiness('ideal'),
      sanctions: { risk: 'NONE', blocking: false } as MatchSanctions,
    });
    // Geared vessels get full crane points; gearless depends on port cranes
    const c1 = b1.components.find(c => /crane|gear/i.test(c.label))!;
    const c2 = b2.components.find(c => /crane|gear/i.test(c.label))!;
    expect(c1.points).toBeGreaterThanOrEqual(c2.points);
  });

  it('finalScore equals basePhysical + readinessAdjustment + sanctionsAdjustment (clamped 0-100)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadiness('idle'),
      sanctions: { risk: 'MEDIUM', blocking: false } as MatchSanctions,
    });
    expect(b.finalScore).toBe(
      Math.max(0, Math.min(100, b.basePhysical + b.readinessAdjustment + b.sanctionsAdjustment))
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cargo type match scoring — tiered differentiation
// ────────────────────────────────────────────────────────────────────────────

function cargoTypeComponent(breakdown: ReturnType<typeof computeScoreBreakdown>) {
  const c = breakdown.components.find(c => c.label === 'Cargo type match');
  if (!c) throw new Error('Cargo type match component missing');
  return c;
}

describe('Cargo type match scoring', () => {
  const sanctions = { risk: 'NONE', blocking: false } as MatchSanctions;
  const readiness = mkReadiness('ideal');

  // BULK 20 pts — bulk vessel + confirmed last cargoes
  it('BULK on Handysize Bulker with grain lastCargoes → 20 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BULK' }),
      vessel: mkVessel({ vesselType: 'Handysize Bulker', lastCargoes: 'wheat, corn, fertilizer' }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(20);
  });

  // BULK 16 pts — bulk vessel but no lastCargoes info
  it('BULK on Supramax Bulker, no lastCargoes → 16 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BULK' }),
      vessel: mkVessel({ vesselType: 'Supramax Bulker', lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(16);
  });

  // BULK 12 pts — MPP with sufficient grainCapacity
  it('BULK on MPP vessel with large grainCapacity → 12 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BULK' }),
      vessel: mkVessel({ vesselType: 'Multi-purpose', grainCapacity: 5000, lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(12);
  });

  // BULK 8 pts — MPP with small grainCapacity
  it('BULK on MPP vessel with small grainCapacity → 8 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BULK' }),
      vessel: mkVessel({ vesselType: 'Multi-purpose', grainCapacity: 1000, lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(8);
  });

  // BREAK_BULK 20 pts — MPP + confirmed break-bulk lastCargoes
  it('BREAK_BULK on MPP with steel lastCargoes → 20 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BREAK_BULK' }),
      vessel: mkVessel({ vesselType: 'General Cargo / MPP', lastCargoes: 'steel, bagged cargo, breakbulk' }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(20);
  });

  // BREAK_BULK 16 pts — MPP, no lastCargoes
  it('BREAK_BULK on MPP, no lastCargoes → 16 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BREAK_BULK' }),
      vessel: mkVessel({ vesselType: 'General Cargo / MPP', lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(16);
  });

  // BREAK_BULK 12 pts — geared bulker
  it('BREAK_BULK on geared Panamax Bulker → 12 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BREAK_BULK' }),
      vessel: mkVessel({ vesselType: 'Panamax Bulker', geared: true, lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(12);
  });

  // BREAK_BULK 8 pts — gearless bulker
  it('BREAK_BULK on gearless Panamax Bulker → 8 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BREAK_BULK' }),
      vessel: mkVessel({ vesselType: 'Panamax Bulker', geared: false, lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(8);
  });

  // FCL 20 pts — container vessel + container lastCargoes
  it('FCL on Container vessel with container lastCargoes → 20 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'FCL' }),
      vessel: mkVessel({ vesselType: 'Container', lastCargoes: 'container, teu boxes' }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(20);
  });

  // FCL 16 pts — container vessel, no lastCargoes
  it('FCL on Container vessel, no lastCargoes → 16 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'FCL' }),
      vessel: mkVessel({ vesselType: 'Containership', lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(16);
  });

  // RORO 20 pts
  it('RORO on Ro-Ro vessel → 20 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'RORO' }),
      vessel: mkVessel({ vesselType: 'Ro-Ro', lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(20);
  });

  // OTHER 12 pts — known vessel type
  it('OTHER cargo on bulk vessel → 12 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'OTHER' }),
      vessel: mkVessel({ vesselType: 'Handysize Bulker', lastCargoes: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(12);
  });

  // Missing cargo/vessel type → 4 pts fallback
  it('missing cargoType → 4 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: undefined as unknown as 'BULK' }),
      vessel: mkVessel({ vesselType: 'Handysize Bulker' }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(4);
    expect(c.reason).toMatch(/unspecified/);
  });

  it('missing vesselType → 4 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ cargoType: 'BULK' }),
      vessel: mkVessel({ vesselType: null }),
      readiness, sanctions,
    });
    const c = cargoTypeComponent(b);
    expect(c.points).toBe(4);
    expect(c.reason).toMatch(/unspecified/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Geographic proximity — piecewise step tiers
// ────────────────────────────────────────────────────────────────────────────

function geoComponent(breakdown: ReturnType<typeof computeScoreBreakdown>) {
  const c = breakdown.components.find(c => c.label === 'Geographic proximity');
  if (!c) throw new Error('Geographic proximity component missing');
  return c;
}

function mkReadinessWithDist(distanceNm: number | null): MatchReadiness {
  return {
    openDate: '2025-09-05',
    laycanStart: '2025-09-10',
    laycanEnd: '2025-09-12',
    distanceNm,
    speedKn: 12,
    sailingDays: 1.0,
    arrivalDate: '2025-09-06',
    gapDays: 3.5,
    verdict: 'ideal',
    explanation: 'test',
  };
}

describe('Geographic proximity scoring — piecewise tiers', () => {
  const sanctions = { risk: 'NONE', blocking: false } as MatchSanctions;

  it('0 nm → 20 pts, prompt arrival reason', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(0),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(20);
    expect(c.reason).toMatch(/prompt arrival/);
  });

  it('200 nm → 20 pts (same-basin tier ≤300nm)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(200),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(20);
  });

  it('500 nm → 16 pts (short ballast 300-800nm)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(500),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(16);
    expect(c.reason).toMatch(/short ballast/);
  });

  it('1000 nm → 12 pts (medium ballast 800-1500nm)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(1000),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(12);
    expect(c.reason).toMatch(/medium ballast/);
  });

  it('2000 nm → 8 pts (long ballast 1500-2500nm)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(2000),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(8);
    expect(c.reason).toMatch(/long ballast/);
    expect(c.reason).toMatch(/tramp trade/);
  });

  it('3000 nm → 4 pts (very long ballast 2500-4000nm)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(3000),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(4);
    expect(c.reason).toMatch(/very long ballast/);
  });

  it('5000 nm → 1 pt (cross-basin >4000nm)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(5000),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(1);
    expect(c.reason).toMatch(/cross-basin/);
  });

  it('null distance → 6 pts (unknown, assumed mid-range)', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.points).toBe(6);
    expect(c.reason).toMatch(/distance could not be computed/);
  });

  it('component label is exactly "Geographic proximity" and max is 20', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(500),
      sanctions,
    });
    const c = geoComponent(b);
    expect(c.label).toBe('Geographic proximity');
    expect(c.max).toBe(20);
  });
});

// ── Spec-05: Confidence weighting ─────────────────────────────────────────

describe('Confidence weighting', () => {
  const sanctions = { risk: 'NONE', blocking: false } as MatchSanctions;

  it('all-confirmed inputs: confidenceAdjustedScore equals basePhysical and all multipliers are 1.0', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),   // all confidence: 'confirmed' by default
      vessel: mkVessel(), // all confidence: 'confirmed' by default
      readiness: mkReadiness('ideal'),
      sanctions,
    });
    expect(b.confidenceAdjustedScore).toBe(b.basePhysical);
    b.components.forEach(c => {
      expect(c.confidenceMultiplier).toBe(1.0);
    });
  });

  it('interpreted origin port: geographic component gets ×0.7 multiplier', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: { value: 'Karasu', confidence: 'interpreted' } }),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(200), // raw 20 pts → 20 * 0.7 = 14
      sanctions,
    });
    const geo = b.components.find(c => c.label === 'Geographic proximity')!;
    expect(geo.confidenceMultiplier).toBe(0.7);
    expect(geo.points).toBeCloseTo(14);
  });

  it('all-uncertain driving fields: confidenceAdjustedScore < basePhysical', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({
        originPort:       { value: 'Karasu',      confidence: 'uncertain' },
        cargoDescription: { value: 'steel coils', confidence: 'uncertain' },
        weightMt:         { value: 4800,          confidence: 'uncertain' },
        preferredDates:   { value: '2025-09-10',  confidence: 'uncertain' },
      }),
      vessel: mkVessel({
        openPosition: { value: 'Karasu',     confidence: 'uncertain' },
        openDate:     { value: '2025-09-05', confidence: 'uncertain' },
        dwtSummer:    { value: 5200,         confidence: 'uncertain' },
      }),
      readiness: mkReadiness('ideal'),
      sanctions,
    });
    expect(b.confidenceAdjustedScore).toBeLessThan(b.basePhysical);
  });

  it('null ConfidenceField wrappers default to multiplier 1.0', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: null, weightMt: null, preferredDates: null }),
      vessel: mkVessel({ openPosition: null, dwtSummer: null, openDate: null }),
      readiness: mkReadiness('ideal'),
      sanctions,
    });
    b.components.forEach(c => {
      expect(c.confidenceMultiplier).toBe(1.0);
    });
  });

  it('finalScore uses confidenceAdjustedScore (not basePhysical) as base', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: { value: 'Karasu', confidence: 'uncertain' } }),
      vessel: mkVessel({ openPosition: { value: 'Karasu', confidence: 'uncertain' } }),
      readiness: mkReadinessWithDist(200),
      sanctions,
    });
    const expected = Math.max(0, Math.min(100, b.confidenceAdjustedScore! + b.readinessAdjustment + b.sanctionsAdjustment));
    expect(b.finalScore).toBe(expected);
  });
});

// ── Spec-04: Range-aware DWT scoring ──────────────────────────────────────

function dwtComponent(b: ReturnType<typeof computeScoreBreakdown>) {
  const c = b.components.find(c => c.label === 'DWT class fit');
  if (!c) throw new Error('DWT class fit component missing');
  return c;
}

describe('Range-aware DWT scoring', () => {
  const sanctions = { risk: 'NONE', blocking: false } as MatchSanctions;
  const readiness = mkReadiness('ideal');

  // Range-DWT-1: range fits within DWT → well-matched (max/DWT >= 0.5)
  it('range fits DWT: max bound within DWT, min ≥ 50% → 10 pts well-matched', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      // vessel DWT = 5200; range 2800–4800 → fitRatio=4800/5200≈0.92, utilRatio=2800/5200≈0.54
      cargo: mkCargo({ weightMtMin: 2800, weightMtMax: 4800 }),
      vessel: mkVessel({ dwtSummer: { value: 5200, confidence: 'confirmed' } }),
      readiness, sanctions,
    });
    const c = dwtComponent(b);
    expect(c.points).toBe(10);
    expect(c.reason).toMatch(/well-matched/);
  });

  // Range-DWT-2: max bound exceeds DWT → 2 pts exceeds
  it('range exceeds DWT: max bound > DWT → 2 pts', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      // vessel DWT = 5200; range 5000–6000 → fitRatio=6000/5200≈1.15 > 1.0 → exceeds
      cargo: mkCargo({ weightMtMin: 5000, weightMtMax: 6000 }),
      vessel: mkVessel({ dwtSummer: { value: 5200, confidence: 'confirmed' } }),
      readiness, sanctions,
    });
    const c = dwtComponent(b);
    expect(c.points).toBe(2);
    expect(c.reason).toMatch(/exceed/i);
  });

  // Range-DWT-3: single number fallback (no range) — backward-compat
  it('single number weight falls back to plain ratio check', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      // weightMt=4800, DWT=5200 → ratio≈0.92, min/max both null → well-matched
      cargo: mkCargo({ weightMt: { value: 4800, confidence: 'confirmed' }, weightMtMin: null, weightMtMax: null }),
      vessel: mkVessel({ dwtSummer: { value: 5200, confidence: 'confirmed' } }),
      readiness, sanctions,
    });
    const c = dwtComponent(b);
    expect(c.points).toBe(10);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase D2: vague-region penalty
//
// When vessel.openPosition or cargo.originPort is a broad geographic
// descriptor (e.g. 'East Coast Greece', 'Tunisia', 'Aegean Sea') rather than a
// specific port, distance cannot be estimated and the pair carries no
// actionable timing signal. Cap the Geographic-proximity component AND apply a
// flat `vagueRegionAdjustment` so the final score drops into the 'weak' tier.
// ────────────────────────────────────────────────────────────────────────────

describe('Vague-region penalty — Phase D2', () => {
  const sanctions = { risk: 'NONE', blocking: false } as MatchSanctions;

  it('vessel open-position is a country only → geo capped at 2 pts and vagueRegionAdjustment = -15', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),  // Karasu — specific port
      vessel: mkVessel({ openPosition: { value: 'Tunisia', confidence: 'confirmed' } }),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    const geo = geoComponent(b);
    expect(geo.points).toBe(2);
    expect(geo.reason).toMatch(/vague/);
    expect(geo.reason).toMatch(/country only/);
    expect(b.vagueRegionAdjustment).toBe(-20);
  });

  it('vessel position is a sea name → vague penalty applied', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel({ openPosition: { value: 'Aegean Sea', confidence: 'confirmed' } }),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    const geo = geoComponent(b);
    expect(geo.points).toBe(2);
    expect(geo.reason).toMatch(/sea name/);
    expect(b.vagueRegionAdjustment).toBe(-20);
  });

  it('vessel position is a coast descriptor → vague penalty applied', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel({ openPosition: { value: 'East Coast Greece', confidence: 'confirmed' } }),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    const geo = geoComponent(b);
    expect(geo.points).toBe(2);
    expect(geo.reason).toMatch(/coast descriptor/);
    expect(b.vagueRegionAdjustment).toBe(-20);
  });

  it('cargo origin is vague (country only) → penalty applied even if vessel position is specific', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: { value: 'Greece', confidence: 'confirmed' } }),
      vessel: mkVessel(),  // Karasu — specific
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    const geo = geoComponent(b);
    expect(geo.points).toBe(2);
    expect(geo.reason).toMatch(/cargo origin/);
    expect(b.vagueRegionAdjustment).toBe(-20);
  });

  it('both sides specific → NO vague penalty, scoring unchanged', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),  // Karasu
      vessel: mkVessel(),  // Karasu
      readiness: mkReadinessWithDist(400),
      sanctions,
    });
    const geo = geoComponent(b);
    expect(geo.points).toBe(16);  // 400nm → 16 pts (short ballast tier)
    expect(b.vagueRegionAdjustment).toBe(0);
  });

  it('null distance with both sides specific → null-distance path (6 pts), NOT vague path', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    const geo = geoComponent(b);
    expect(geo.points).toBe(6);
    expect(geo.reason).toMatch(/distance could not be computed/);
    expect(b.vagueRegionAdjustment).toBe(0);
  });

  it('vessel position vague → vague-region penalty drops finalScore vs same pair with specific port', () => {
    // Reproduce W1 vessel-1 / 'East Coast Greece' scenario.
    const readinessNullDist: MatchReadiness = {
      openDate: '2025-09-05',
      laycanStart: '2025-09-10',
      laycanEnd: '2025-09-12',
      distanceNm: null,
      speedKn: null,
      sailingDays: null,
      arrivalDate: null,
      gapDays: null,
      verdict: 'unknown',
      explanation: 'distance unavailable',
    };
    const vaguePair = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel({ openPosition: { value: 'East Coast Greece', confidence: 'confirmed' } }),
      readiness: readinessNullDist,
      sanctions,
    });
    const specificPair = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel(),  // Karasu (specific port)
      readiness: readinessNullDist,
      sanctions,
    });
    expect(vaguePair.vagueRegionAdjustment).toBe(-20);
    expect(specificPair.vagueRegionAdjustment).toBe(0);
    // Vague pair should be at least 20 points lower than the otherwise-identical specific pair.
    expect(specificPair.finalScore - vaguePair.finalScore).toBeGreaterThanOrEqual(20);
  });

  it('vague-region penalty pushes a borderline-possible match into the weak tier', () => {
    // W1-style scenario with weaker non-geo signal (no cargo history, no specific stowage).
    const b = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({
        cargoDescription: { value: 'general cargo', confidence: 'interpreted' },
        cargoType: 'OTHER',
        weightMt: { value: 4500, confidence: 'interpreted' },
      }),
      vessel: mkVessel({
        openPosition: { value: 'Tunisia', confidence: 'interpreted' },
        geared: null,
        lastCargoes: null,
      }),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    expect(b.vagueRegionAdjustment).toBe(-20);
    // Score should land in or near the weak tier — exact threshold depends on other fields.
    expect(b.finalScore).toBeLessThan(50);
  });

  it('vague pattern label reflects which side is vague (vessel vs cargo)', () => {
    const bVessel = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo(),
      vessel: mkVessel({ openPosition: { value: 'Red Sea', confidence: 'confirmed' } }),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    expect(geoComponent(bVessel).reason).toMatch(/vessel position/);

    const bCargo = computeScoreBreakdown({
      match: mkMatch(),
      cargo: mkCargo({ originPort: { value: 'Red Sea', confidence: 'confirmed' } }),
      vessel: mkVessel(),
      readiness: mkReadinessWithDist(null),
      sanctions,
    });
    expect(geoComponent(bCargo).reason).toMatch(/cargo origin/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ballast + size realism cap (Wave C — levers 3 + 4, handover 2026-05-30)
// ─────────────────────────────────────────────────────────────────────────────

import {
  applyBallastSizeCap,
  isPartCargo,
  BALLAST_GOOD_MAX_NM,
  PROPORTION_GOOD_MIN_UTIL,
  type BallastSizeCapInput,
} from '../match-scoring';

function capInput(over: Partial<BallastSizeCapInput> = {}): BallastSizeCapInput {
  return {
    match: mkMatch(81, 'good'),
    distanceNm: null,
    vesselDwt: 5200, // handysize
    vesselDwcc: null,
    cargoWeightMax: null,
    cargoDescription: null,
    ...over,
  };
}

describe('isPartCargo', () => {
  it('matches explicit part-cargo phrasing', () => {
    expect(isPartCargo('Mobile machinery, part cargo')).toBe(true);
    expect(isPartCargo('steel coils part-cargo')).toBe(true);
    expect(isPartCargo('PART CARGO of bagged urea')).toBe(true);
    expect(isPartCargo('grain, part load')).toBe(true);
    expect(isPartCargo('part lot of pipes')).toBe(true);
  });
  it('matches real broker variants — plurals, p/c, loose separators', () => {
    expect(isPartCargo('2 part cargoes of steel coils')).toBe(true);
    expect(isPartCargo('vessel can take 2 part loads')).toBe(true);
    expect(isPartCargo('steel, p/c basis')).toBe(true);
    expect(isPartCargo('part  cargo of bagged urea')).toBe(true); // double space
    expect(isPartCargo('part_cargo')).toBe(true);
    expect(isPartCargo('partcargo')).toBe(true); // no separator
  });
  it('does not false-positive on near-miss substrings', () => {
    expect(isPartCargo('counterpart cargo')).toBe(false);
    expect(isPartCargo('departure cargo nomination')).toBe(false);
    expect(isPartCargo('partial cargo')).toBe(false);
    expect(isPartCargo('parcel of wheat')).toBe(false);
  });
  it('does not match full-cargo or unrelated descriptions', () => {
    expect(isPartCargo('full cargo of wheat')).toBe(false);
    expect(isPartCargo('steel slabs')).toBe(false);
    expect(isPartCargo('PC strand 2500mt')).toBe(false);
    expect(isPartCargo(null)).toBe(false);
    expect(isPartCargo(undefined)).toBe(false);
    expect(isPartCargo('')).toBe(false);
  });
});

describe('applyBallastSizeCap — ballast + size realism cap', () => {
  describe('lever 3 — ballast distance, class-aware', () => {
    it('caps a good handysize match with far ballast (1580nm) to possible', () => {
      const out = applyBallastSizeCap(capInput({ distanceNm: 1580 }));
      expect(out.score).toBeLessThan(70);
      expect(out.matchLevel).toBe('possible');
      expect(out.issues?.some((i) => i.startsWith('BALLAST:'))).toBe(true);
    });

    it('keeps a good handysize match with short ballast (580nm) as good', () => {
      const out = applyBallastSizeCap(capInput({ distanceNm: 580 }));
      expect(out.score).toBe(81);
      expect(out.matchLevel).toBe('good');
      expect(out.issues ?? []).toHaveLength(0);
    });

    it('keeps a good handysize match with very short ballast (205nm) as good', () => {
      const out = applyBallastSizeCap(capInput({ distanceNm: 205 }));
      expect(out.matchLevel).toBe('good');
    });

    it('does not cap a capesize at 3000nm but caps a handysize at the same distance', () => {
      const cape = applyBallastSizeCap(capInput({ distanceNm: 3000, vesselDwt: 120000 }));
      expect(cape.matchLevel).toBe('good');
      const handy = applyBallastSizeCap(capInput({ distanceNm: 3000, vesselDwt: 5200 }));
      expect(handy.matchLevel).toBe('possible');
    });

    it('skips the ballast guard when distance is unknown', () => {
      const out = applyBallastSizeCap(capInput({ distanceNm: null }));
      expect(out.matchLevel).toBe('good');
    });

    it('skips the ballast guard when vessel DWT is unknown (no class → no assumption)', () => {
      const out = applyBallastSizeCap(capInput({ distanceNm: 1600, vesselDwt: null }));
      expect(out.matchLevel).toBe('good');
      expect(out.issues?.some((i) => i.startsWith('BALLAST:'))).toBe(false);
    });

    it('uses the documented per-class thresholds', () => {
      expect(BALLAST_GOOD_MAX_NM.handysize).toBe(1500);
      expect(BALLAST_GOOD_MAX_NM.supramax).toBeGreaterThan(BALLAST_GOOD_MAX_NM.handysize);
      expect(BALLAST_GOOD_MAX_NM.panamax).toBeGreaterThan(BALLAST_GOOD_MAX_NM.supramax);
      expect(BALLAST_GOOD_MAX_NM.capesize).toBeGreaterThan(BALLAST_GOOD_MAX_NM.panamax);
    });
  });

  describe('lever 4 — size proportion, part-cargo exempt', () => {
    it('caps a good low-util (34%) non-part-cargo match to possible', () => {
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: 7300, cargoWeightMax: 2500, cargoDescription: 'PC strand' }),
      );
      expect(out.matchLevel).toBe('possible');
      expect(out.issues?.some((i) => i.startsWith('SIZE:'))).toBe(true);
    });

    it('keeps a good low-util (5%) PART-CARGO match as good (exempt)', () => {
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: 50000, cargoWeightMax: 2500, cargoDescription: 'Mobile machinery, part cargo' }),
      );
      expect(out.matchLevel).toBe('good');
      expect(out.issues?.some((i) => i.startsWith('SIZE:'))).toBe(false);
    });

    it('keeps a good high-util (75%) match as good', () => {
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: 8000, cargoWeightMax: 6000, cargoDescription: 'wheat in bulk' }),
      );
      expect(out.matchLevel).toBe('good');
    });

    it('uses DWCC over DWT for utilisation when present', () => {
      // cargo 4000 / dwcc 5000 = 80% (good) even though /dwt 9000 = 44% would cap
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: 9000, vesselDwcc: 5000, cargoWeightMax: 4000 }),
      );
      expect(out.matchLevel).toBe('good');
    });

    it('treats exactly the threshold util as good, just below as capped', () => {
      expect(PROPORTION_GOOD_MIN_UTIL).toBe(0.5);
      const atThreshold = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: 10000, cargoWeightMax: 5000 }), // 0.50
      );
      expect(atThreshold.matchLevel).toBe('good');
      const justBelow = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: 10000, cargoWeightMax: 4900 }), // 0.49
      );
      expect(justBelow.matchLevel).toBe('possible');
    });

    it('skips the size guard when capacity is unknown', () => {
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 200, vesselDwt: null, vesselDwcc: null, cargoWeightMax: 2500 }),
      );
      expect(out.matchLevel).toBe('good');
    });
  });

  describe('invariants', () => {
    it('never raises a lower tier — a possible match is left untouched', () => {
      const out = applyBallastSizeCap({
        match: mkMatch(60, 'possible'),
        distanceNm: 5000,
        vesselDwt: 5200,
        vesselDwcc: null,
        cargoWeightMax: 100,
        cargoDescription: null,
      });
      expect(out.score).toBe(60);
      expect(out.matchLevel).toBe('possible');
      expect(out.issues ?? []).toHaveLength(0);
    });

    it('is idempotent — a second pass does not duplicate the issue', () => {
      const once = applyBallastSizeCap(capInput({ distanceNm: 1580 }));
      const twice = applyBallastSizeCap({
        match: once,
        distanceNm: 1580,
        vesselDwt: 5200,
        vesselDwcc: null,
        cargoWeightMax: null,
        cargoDescription: null,
      });
      const ballastIssues = (twice.issues ?? []).filter((i) => i.startsWith('BALLAST:'));
      expect(ballastIssues).toHaveLength(1);
    });

    it('dedup: a still-good match already carrying a BALLAST: note gets no duplicate (and is still demoted)', () => {
      // Exercises the dedup filter directly (score ≥ 70, so not the early-return path):
      // a prior BALLAST: issue must suppress the new one, but the score still drops.
      const out = applyBallastSizeCap({
        match: { ...mkMatch(81, 'good'), issues: ['BALLAST: prior note'] },
        distanceNm: 1580,
        vesselDwt: 5200,
        vesselDwcc: null,
        cargoWeightMax: null,
        cargoDescription: null,
      });
      expect(out.score).toBe(69);
      expect(out.matchLevel).toBe('possible');
      expect((out.issues ?? []).filter((i) => i.startsWith('BALLAST:'))).toHaveLength(1);
    });

    it('does not mutate the input match', () => {
      const input = mkMatch(81, 'good');
      applyBallastSizeCap({ ...capInput({ distanceNm: 1580 }), match: input });
      expect(input.score).toBe(81);
      expect(input.matchLevel).toBe('good');
    });
  });

  describe('numeric edges & combined triggers', () => {
    it('skips the ballast guard on non-finite or negative distance', () => {
      for (const d of [NaN, Infinity, -500]) {
        expect(applyBallastSizeCap(capInput({ distanceNm: d })).matchLevel).toBe('good');
      }
    });

    it('skips the size guard on zero/negative cargo weight or negative capacity', () => {
      expect(applyBallastSizeCap(capInput({ distanceNm: 100, vesselDwt: 10000, cargoWeightMax: 0 })).matchLevel).toBe('good');
      expect(applyBallastSizeCap(capInput({ distanceNm: 100, vesselDwt: 10000, cargoWeightMax: -500 })).matchLevel).toBe('good');
      expect(applyBallastSizeCap(capInput({ distanceNm: 100, vesselDwt: -1, vesselDwcc: -1, cargoWeightMax: 5000 })).matchLevel).toBe('good');
    });

    it('treats DWCC of 0 as missing and falls back to DWT', () => {
      // dwcc 0 → use dwt 10000; 4000/10000 = 40% < 0.5 → capped on size.
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 100, vesselDwt: 10000, vesselDwcc: 0, cargoWeightMax: 4000 }),
      );
      expect(out.matchLevel).toBe('possible');
      expect(out.issues?.some((i) => i.startsWith('SIZE:'))).toBe(true);
    });

    it('caps a barely-good (score exactly 70) match to 69', () => {
      const out = applyBallastSizeCap({ ...capInput({ distanceNm: 5000 }), match: mkMatch(70, 'good') });
      expect(out.score).toBe(69);
      expect(out.matchLevel).toBe('possible');
    });

    it('both ballast and size trigger → single cap to 69, both issues present', () => {
      const out = applyBallastSizeCap(
        capInput({ distanceNm: 5000, vesselDwt: 8000, cargoWeightMax: 2000, cargoDescription: 'bulk wheat' }), // 25% util
      );
      expect(out.score).toBe(69);
      expect(out.matchLevel).toBe('possible');
      const issues = out.issues ?? [];
      expect(issues.some((i) => i.startsWith('BALLAST:'))).toBe(true);
      expect(issues.some((i) => i.startsWith('SIZE:'))).toBe(true);
    });
  });
});
