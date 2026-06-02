/**
 * Unit tests for computeBunkerComparison — per-port effective $/MT math.
 * Uses KNOWN numbers, not smoke tests.
 *
 * Vessel baseline: speed=10kn, cons=24MT/day, lift=500MT, dayRate=$12000
 *   consPerNm = 24/(10*24) = 0.1 MT/NM
 *   dayRatePerNm = 12000/(10*24) = 50 USD/NM
 *   totalCostPerNm (at $600) = 0.1*600 + 50 = 60+50 = 110 USD/NM per lift-lot
 *   effectivePremiumPerMt per NM at $600 = 110/500 = 0.22 USD/MT/NM
 */

import {
  computeBunkerComparison,
  type BunkerComparisonInput,
} from '@/lib/economics/bunker-comparison';

const BASE: Omit<BunkerComparisonInput, 'candidates'> = {
  vesselSpeedKn: 10,
  dailyConsMtPerDay: 24,
  liftTonnes: 500,
  vesselDayRateUsd: 12000,
};

describe('computeBunkerComparison', () => {
  it('single candidate with 0 deviation: effectiveUsdPerMt == priceUsdPerMt', () => {
    const result = computeBunkerComparison({
      ...BASE,
      candidates: [{ port: 'SGSIN', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].effectiveUsdPerMt).toBe(600);
    expect(result[0].deviationHours).toBe(0);
    expect(result[0].deviationFuelUsd).toBe(0);
    expect(result[0].timeCostUsd).toBe(0);
  });

  it('candidate with positive deviation: increases effectiveUsdPerMt', () => {
    // deviationNm = 100; consPerNm = 24/(10*24) = 0.1; price = 600
    // devFuelUsd = 100 * 0.1 * 600 = 6000
    // timeCostUsd = (100/10/24) * 12000 = (100/240)*12000 = 5000
    // effectiveUsdPerMt = (600*500 + 6000 + 5000)/500 = 311000/500 = 622
    const result = computeBunkerComparison({
      ...BASE,
      candidates: [{ port: 'AEFJR', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 100 }],
    });
    expect(result[0].deviationHours).toBe(10);         // 100/10 = 10 h
    expect(result[0].deviationFuelUsd).toBe(6000);     // 100*0.1*600
    expect(result[0].timeCostUsd).toBe(5000);          // 100/10/24*12000
    expect(result[0].effectiveUsdPerMt).toBe(622);     // (300000+11000)/500
  });

  it('negative deviation treated as 0 (shortcut port has no detour cost)', () => {
    // deviationNm = -50 (port is on the direct route, saves 50 NM)
    // effective deviation = max(0, -50) = 0 → same math as 0 deviation
    const result = computeBunkerComparison({
      ...BASE,
      candidates: [{ port: 'GIGIB', grade: 'VLSFO', priceUsdPerMt: 580, deviationNm: -50 }],
    });
    expect(result[0].deviationFuelUsd).toBe(0);
    expect(result[0].timeCostUsd).toBe(0);
    expect(result[0].effectiveUsdPerMt).toBe(580);
    // deviationNm is preserved as-is in output (raw detour)
    expect(result[0].deviationNm).toBe(-50);
  });

  it('sorts by effectiveUsdPerMt ASC: cheap+detour can beat expensive+noDetour', () => {
    // Port A: price=600, deviation=0 → effective=600
    // Port B: price=570, deviation=100
    //   devFuelUsd = 100*0.1*570 = 5700
    //   timeCostUsd = 100/10/24*12000 = 5000
    //   effectiveUsdPerMt = (570*500+5700+5000)/500 = (285000+10700)/500 = 591.4
    // Port C: price=650, deviation=-100 (shortcut) → effective=650
    // Expected sort: B(591.4) < A(600) < C(650)
    const result = computeBunkerComparison({
      ...BASE,
      candidates: [
        { port: 'SGSIN', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 },
        { port: 'NLRTM', grade: 'VLSFO', priceUsdPerMt: 570, deviationNm: 100 },
        { port: 'GIGIB', grade: 'VLSFO', priceUsdPerMt: 650, deviationNm: -100 },
      ],
    });
    expect(result[0].port).toBe('NLRTM');
    expect(result[0].effectiveUsdPerMt).toBe(591.4);
    expect(result[1].port).toBe('SGSIN');
    expect(result[1].effectiveUsdPerMt).toBe(600);
    expect(result[2].port).toBe('GIGIB');
    expect(result[2].effectiveUsdPerMt).toBe(650);
  });

  it('empty candidates input returns empty array', () => {
    const result = computeBunkerComparison({ ...BASE, candidates: [] });
    expect(result).toHaveLength(0);
  });

  it('zero speed returns empty (guard against div-by-zero)', () => {
    const result = computeBunkerComparison({
      ...BASE,
      vesselSpeedKn: 0,
      candidates: [{ port: 'SGSIN', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 100 }],
    });
    expect(result).toHaveLength(0);
  });

  it('onRoute flag is true for all returned candidates', () => {
    const result = computeBunkerComparison({
      ...BASE,
      candidates: [
        { port: 'AEFJR', grade: 'VLSFO', priceUsdPerMt: 500, deviationNm: 50 },
        { port: 'NLRTM', grade: 'VLSFO', priceUsdPerMt: 520, deviationNm: 0 },
      ],
    });
    expect(result.every(r => r.onRoute)).toBe(true);
  });

  it('deviationHours is in hours (not days)', () => {
    // deviation=240 NM at 10 kn → 24 hours = 1 day
    const result = computeBunkerComparison({
      ...BASE,
      candidates: [{ port: 'USHOU', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 240 }],
    });
    expect(result[0].deviationHours).toBe(24); // 240/10 = 24 h (not 1)
  });
});
