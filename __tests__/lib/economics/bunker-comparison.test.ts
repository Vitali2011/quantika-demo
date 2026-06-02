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
  isEuEtsPort,
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

// ── Carbon / EU ETS ───────────────────────────────────────────────────────────
//
// EUA=100 EUR/tCO2, EUR_USD=1.08, Cf(VLSFO)=3.151, lift=500t, price=600 $/t
//   carbonCostUsd = round2(100 * 1.08 * 3.151 * 500) = round2(170154)   = 170154
//   carbonUsdPerMt = round2(170154 / 500)              = round2(340.308) = 340.31
//   eff = round2((600*500 + 170154) / 500)             = round2(940.308) = 940.31
//   invariant: 600 + 0/500 + 0/500 + 340.31 = 940.31 ✓

describe('isEuEtsPort', () => {
  it('EU ports return true', () => {
    expect(isEuEtsPort('GRPIR')).toBe(true);  // Greece
    expect(isEuEtsPort('ROCND')).toBe(true);  // Romania
    expect(isEuEtsPort('CYLMS')).toBe(true);  // Cyprus
    expect(isEuEtsPort('ITAUG')).toBe(true);  // Italy
    expect(isEuEtsPort('MTMLA')).toBe(true);  // Malta
    expect(isEuEtsPort('ESALG')).toBe(true);  // Spain (Algeciras)
    expect(isEuEtsPort('NLRTM')).toBe(true);  // Netherlands
  });

  it('non-EU ports return false', () => {
    expect(isEuEtsPort('GIGIB')).toBe(false); // Gibraltar (GI not in EU)
    expect(isEuEtsPort('EGPSD')).toBe(false); // Egypt
    expect(isEuEtsPort('TRIST')).toBe(false); // Turkey
    expect(isEuEtsPort('SGSIN')).toBe(false); // Singapore
    expect(isEuEtsPort('AEFJR')).toBe(false); // UAE
    expect(isEuEtsPort('USHOU')).toBe(false); // USA
  });

  it('Ceuta (ESCEU) returns false despite ES country code override', () => {
    expect(isEuEtsPort('ESCEU')).toBe(false);
  });
});

describe('carbon cost (EU ETS)', () => {
  it('EU port with euaPriceEur: carbon computed, included in eff', () => {
    const result = computeBunkerComparison({
      ...BASE,
      euaPriceEur: 100,
      candidates: [{ port: 'GRPIR', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 }],
    });
    expect(result[0].carbonCostUsd).toBe(170154);
    expect(result[0].carbonUsdPerMt).toBe(340.31);
    expect(result[0].effectiveUsdPerMt).toBe(940.31);
    expect(result[0].euaUsedFallback).toBe(false);
  });

  it('non-EU port: carbon = 0, eff unchanged', () => {
    const result = computeBunkerComparison({
      ...BASE,
      euaPriceEur: 100,
      candidates: [{ port: 'SGSIN', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 }],
    });
    expect(result[0].carbonCostUsd).toBe(0);
    expect(result[0].carbonUsdPerMt).toBe(0);
    expect(result[0].effectiveUsdPerMt).toBe(600);
  });

  it('invariant: eff = price + devFuel/lift + devTime/lift + carbonUsdPerMt (EU, deviation=100)', () => {
    // price=600, dev=100 → devFuel=6000, devTime=5000, carbon=170154 (EUA=100, VLSFO, lift=500)
    // eff = (600*500 + 6000 + 5000 + 170154)/500 = 481154/500 = 962.308 → 962.31
    // sum visible: 600 + 6000/500 + 5000/500 + 340.31 = 600 + 12 + 10 + 340.31 = 962.31 ✓
    const result = computeBunkerComparison({
      ...BASE,
      euaPriceEur: 100,
      candidates: [{ port: 'GRPIR', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 100 }],
    });
    const r = result[0];
    const visibleSum = +(r.priceUsdPerMt + r.deviationFuelUsd / 500 + r.timeCostUsd / 500 + r.carbonUsdPerMt).toFixed(2);
    expect(r.effectiveUsdPerMt).toBe(visibleSum);
  });

  it('euaPriceEur not provided: carbon = 0, euaUsedFallback = true (graceful)', () => {
    const result = computeBunkerComparison({
      ...BASE,
      // no euaPriceEur
      candidates: [{ port: 'GRPIR', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 }],
    });
    expect(result[0].carbonCostUsd).toBe(0);
    expect(result[0].carbonUsdPerMt).toBe(0);
    expect(result[0].euaUsedFallback).toBe(true);
    expect(result[0].effectiveUsdPerMt).toBe(600);
  });

  it('grade MGO uses Cf=3.206 (higher carbon per tonne)', () => {
    // EUA=100, Cf(MGO)=3.206, lift=500
    // carbonCostUsd = round2(100 * 1.08 * 3.206 * 500) = round2(173124) = 173124
    // carbonUsdPerMt = round2(173124/500) = round2(346.248) = 346.25
    const result = computeBunkerComparison({
      ...BASE,
      euaPriceEur: 100,
      candidates: [{ port: 'GRPIR', grade: 'MGO', priceUsdPerMt: 750, deviationNm: 0 }],
    });
    expect(result[0].carbonCostUsd).toBe(173124);
    expect(result[0].carbonUsdPerMt).toBe(346.25);
  });

  it('EU vs non-EU sorting: EU port carbon cost can flip the winner', () => {
    // Non-EU cheap: SGSIN $600, no carbon → eff=600
    // EU slightly cheaper: GRPIR $590, EU, EUA=100 → carbon=340.31 → eff=930.31
    // Non-EU wins despite higher sticker
    const result = computeBunkerComparison({
      ...BASE,
      euaPriceEur: 100,
      candidates: [
        { port: 'GRPIR', grade: 'VLSFO', priceUsdPerMt: 590, deviationNm: 0 },
        { port: 'SGSIN', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 },
      ],
    });
    expect(result[0].port).toBe('SGSIN'); // non-EU wins (600 < 930.31)
    expect(result[1].port).toBe('GRPIR');
  });

  it('zero lift returns empty (existing guard still holds with carbon logic)', () => {
    const result = computeBunkerComparison({
      ...BASE,
      liftTonnes: 0,
      euaPriceEur: 100,
      candidates: [{ port: 'GRPIR', grade: 'VLSFO', priceUsdPerMt: 600, deviationNm: 0 }],
    });
    expect(result).toHaveLength(0);
  });
});
