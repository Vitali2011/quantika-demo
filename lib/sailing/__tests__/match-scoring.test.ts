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

  it('idle readiness subtracts 15', () => {
    const b = computeScoreBreakdown({
      match: mkMatch(70),
      cargo: mkCargo(),
      vessel: mkVessel(),
      readiness: mkReadiness('idle'),
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
