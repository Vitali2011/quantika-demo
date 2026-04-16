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
