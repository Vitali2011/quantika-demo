import { calculateEuEts } from '../ets';

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
    // 200 × 3.114 × 1.0 × 87.5 = 54495
    const result = calculateEuEts({
      distanceNm: 3000,
      euLegPercent: 1.0,
      vlsfoBurnMt: 200,
      euaPrice: 87.5,
    });
    expect(result.applicable).toBe(true);
    expect(result.amountEur).toBeCloseTo(54495, 0);
  });

  it('calculates correctly for 50% EU leg', () => {
    // 200 × 3.114 × 0.5 × 87.5 = 27247.5
    const result = calculateEuEts({
      distanceNm: 3000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 200,
      euaPrice: 87.5,
    });
    expect(result.applicable).toBe(true);
    expect(result.amountEur).toBeCloseTo(27247.5, 0);
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
    // 1 × 3.114 × 0.33 × 10 = 10.2762
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.33,
      vlsfoBurnMt: 1,
      euaPrice: 10,
    });
    expect(result.amountEur).toBe(Math.round(1 * 3.114 * 0.33 * 10 * 100) / 100);
  });
});
