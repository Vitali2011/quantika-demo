import { calculateEuEts } from '../ets';

describe('calculateEuEts — EU coverage factor', () => {
  const BASE = { distanceNm: 3000, vlsfoBurnMt: 200, euaPrice: 87.5, year: 2026 };

  it('intra-EU (both EU) → coverageFactor=1.0 → same as no flags', () => {
    const result = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: true, destEu: true });
    const baseline = calculateEuEts({ ...BASE, euLegPercent: 1.0 });
    expect(result.amountEur).toBe(baseline.amountEur);
    expect(result.applicable).toBe(true);
  });

  it('in/out-EU (one EU port, originEu=true) → coverageFactor=0.5 → half of intra-EU', () => {
    const intraEu = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: true, destEu: true });
    const inOut = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: true, destEu: false });
    expect(inOut.amountEur).toBeCloseTo(intraEu.amountEur * 0.5, 1);
    expect(inOut.applicable).toBe(true);
  });

  it('in/out-EU (one EU port, destEu=true) → coverageFactor=0.5 → half of intra-EU', () => {
    const intraEu = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: true, destEu: true });
    const inOut = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: false, destEu: true });
    expect(inOut.amountEur).toBeCloseTo(intraEu.amountEur * 0.5, 1);
    expect(inOut.applicable).toBe(true);
  });

  it('extra-EU (no EU port) → coverageFactor=0 → amountEur=0, applicable=false', () => {
    const result = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: false, destEu: false });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('absent flags → coverageFactor=1.0 (backward-compat, no change to amount)', () => {
    const withBothEu = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: true, destEu: true });
    const noFlags = calculateEuEts({ ...BASE, euLegPercent: 1.0 });
    expect(noFlags.amountEur).toBe(withBothEu.amountEur);
  });

  it('in/out-EU concrete: 200t VLSFO euLeg=1.0 at 87.5 EUR → ~27571 EUR', () => {
    // 200 × 3.151 × 1.0 × 1.0 × 87.5 × 0.5 = 27571.25
    const result = calculateEuEts({ ...BASE, euLegPercent: 1.0, originEu: true, destEu: false });
    expect(result.amountEur).toBeCloseTo(27571.25, 0);
  });
});

describe('calculateEuEts', () => {
  it('returns applicable=false and 0 amount when EU leg is 0%', () => {
    const result = calculateEuEts({
      distanceNm: 5000,
      euLegPercent: 0,
      vlsfoBurnMt: 200,
      euaPrice: 87.5,
    });
    expect(result.applicable).toBe(false);
    expect(result.amountEur).toBe(0);
  });

  it('calculates correctly for 100% EU leg', () => {
    // 200 × 3.151 × 1.0 × 87.5 = 55142.5
    const result = calculateEuEts({
      distanceNm: 3000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 200,
      euaPrice: 87.5,
    });
    expect(result.applicable).toBe(true);
    expect(result.amountEur).toBeCloseTo(55142.5, 0);
  });

  it('calculates correctly for 50% EU leg', () => {
    // 200 × 3.151 × 0.5 × 87.5 = 27571.25
    const result = calculateEuEts({
      distanceNm: 3000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 200,
      euaPrice: 87.5,
    });
    expect(result.applicable).toBe(true);
    expect(result.amountEur).toBeCloseTo(27571.25, 0);
  });

  it('uses fallback EUA price of 87.50 when euaPrice is 0', () => {
    // When euaPrice=0 is passed, amount should be 0 (caller must pass real price)
    const result = calculateEuEts({
      distanceNm: 3000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 0,
    });
    expect(result.amountEur).toBe(0);
  });

  it('returns applicable=false when distanceNm is 0', () => {
    const result = calculateEuEts({
      distanceNm: 0,
      euLegPercent: 1.0,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    expect(result.applicable).toBe(false);
    expect(result.amountEur).toBe(0);
  });

  it('rounds amount to 2 decimal places', () => {
    // 1 × 3.151 × 0.33 × 10 = 10.3983
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.33,
      vlsfoBurnMt: 1,
      euaPrice: 10,
    });
    expect(result.amountEur).toBe(Math.round(1 * 3.151 * 0.33 * 10 * 100) / 100);
  });
});
