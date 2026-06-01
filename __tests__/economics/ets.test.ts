import { calculateEuEts, cfForFuel, phaseIn } from '@/lib/economics/ets';

describe('cfForFuel', () => {
  it('VLSFO → 3.151', () => { expect(cfForFuel('VLSFO')).toBe(3.151); });
  it('HFO → 3.114', () => { expect(cfForFuel('HFO')).toBe(3.114); });
  it('HSFO → 3.114', () => { expect(cfForFuel('HSFO')).toBe(3.114); });
  it('MGO → 3.206', () => { expect(cfForFuel('MGO')).toBe(3.206); });
  it('MDO → 3.206', () => { expect(cfForFuel('MDO')).toBe(3.206); });
  it('LNG → 2.750', () => { expect(cfForFuel('LNG')).toBe(2.750); });
  it('case-insensitive: vlsfo → 3.151', () => { expect(cfForFuel('vlsfo')).toBe(3.151); });
  it('unknown fuel → CF_DEFAULT (3.151)', () => { expect(cfForFuel('BUNKER')).toBe(3.151); });
});

describe('phaseIn', () => {
  it('2023 → 0 (pre-implementation)', () => { expect(phaseIn(2023)).toBe(0); });
  it('2024 → 0.4', () => { expect(phaseIn(2024)).toBe(0.4); });
  it('2025 → 0.7', () => { expect(phaseIn(2025)).toBe(0.7); });
  it('2026 → 1.0', () => { expect(phaseIn(2026)).toBe(1.0); });
  it('2030 → 1.0 (future year stays at 100%)', () => { expect(phaseIn(2030)).toBe(1.0); });
});

describe('calculateEuEts — formula', () => {
  // Canonical: 1000t VLSFO, intra-EU, 2026 → CO₂=3151t → ×1.0 phaseIn × 1.0 geo × 1 EUR/tCO₂
  it('1000t VLSFO intra-EU 2026 at 1 EUR/tCO₂ → 3151 EUR', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 1000,
      euaPrice: 1.0,
      fuelType: 'VLSFO',
      year: 2026,
    });
    expect(result.amountEur).toBe(3151);
    expect(result.applicable).toBe(true);
  });

  it('MGO Cf=3.206: 100t MGO intra-EU 2026 at 1 EUR/tCO₂ → 320.6 EUR', () => {
    const result = calculateEuEts({
      distanceNm: 500,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 1.0,
      fuelType: 'MGO',
      year: 2026,
    });
    expect(result.amountEur).toBe(320.6);
  });

  it('HFO Cf=3.114: 100t HFO intra-EU 2026 at 1 EUR/tCO₂ → 311.4 EUR', () => {
    const result = calculateEuEts({
      distanceNm: 500,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 1.0,
      fuelType: 'HFO',
      year: 2026,
    });
    expect(result.amountEur).toBe(311.4);
  });

  it('phaseIn 2024=0.4: 1000t VLSFO intra-EU → 1260.4 EUR at 1 EUR/tCO₂', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 1000,
      euaPrice: 1.0,
      fuelType: 'VLSFO',
      year: 2024,
    });
    // 1000 * 3.151 * 1.0 * 0.4 * 1.0 = 1260.4
    expect(result.amountEur).toBe(1260.4);
  });

  it('phaseIn 2025=0.7: 1000t VLSFO intra-EU → 2205.7 EUR at 1 EUR/tCO₂', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 1000,
      euaPrice: 1.0,
      fuelType: 'VLSFO',
      year: 2025,
    });
    // 1000 * 3.151 * 1.0 * 0.7 * 1.0 = 2205.7
    expect(result.amountEur).toBe(2205.7);
  });

  it('half-EU geo (euLegPercent=0.5): 1000t VLSFO 2026 → 1575.5 EUR at 1 EUR/tCO₂', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 1000,
      euaPrice: 1.0,
      fuelType: 'VLSFO',
      year: 2026,
    });
    // 1000 * 3.151 * 0.5 * 1.0 * 1.0 = 1575.5
    expect(result.amountEur).toBe(1575.5);
  });

  it('default fuelType is VLSFO (Cf=3.151)', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 1.0,
      year: 2026,
      // fuelType not specified — should default to VLSFO
    });
    expect(result.amountEur).toBe(315.1);
  });

  it('realistic: 1000t VLSFO intra-EU 2026 at 65 EUR/tCO₂ → 204815 EUR', () => {
    const result = calculateEuEts({
      distanceNm: 2000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 1000,
      euaPrice: 65,
      fuelType: 'VLSFO',
      year: 2026,
    });
    // 1000 * 3.151 * 1.0 * 1.0 * 65 = 204815
    expect(result.amountEur).toBe(204815);
    expect(result.applicable).toBe(true);
  });
});
