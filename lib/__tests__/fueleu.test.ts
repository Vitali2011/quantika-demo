import { calculateFuelEu } from '../economics/fueleu';
import type { FuelEuInput, FuelEuResult } from '../economics/fueleu';

describe('FuelEU Maritime Calculator', () => {
  // ============ HAPPY PATH TESTS ============

  test('HFO voyage: non-compliant (91.27 > 91.16), small penalty', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50, // 50 MT/day
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    // Expected energy: 50 * 40200 * 10 = 20,100,000 MJ
    expect(result.totalEnergyMj).toBe(20_100_000);
    expect(result.ghgIntensityActual).toBe(91.27);
    expect(result.ghgIntensityTarget).toBe(91.16);
    expect(result.isCompliant).toBe(false);

    // Gap: (91.27 - 91.16) = 0.11 g/MJ
    // Total excess: 0.11 * 20,100,000 / 1e6 = 2.211 tCO2eq
    // Penalty: 2.211 * 2400 = €5,306.4
    expect(result.penaltyEur).toBeCloseTo(5306.4, 1);
    expect(result.penaltyUsd).toBeCloseTo(5306.4 * 1.08, 1);
    expect(result.complianceGapPct).toBeGreaterThan(0);
  });

  test('LNG voyage: compliant (75.21 < 91.16), penalty=0', () => {
    const input: FuelEuInput = {
      fuelType: 'lng',
      consumptionMtPerDay: 40,
      voyageDays: 12,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityActual).toBe(75.21);
    expect(result.ghgIntensityTarget).toBe(91.16);
    expect(result.isCompliant).toBe(true);
    expect(result.penaltyEur).toBe(0);
    expect(result.penaltyUsd).toBe(0);
    expect(result.complianceGapPct).toBeLessThan(0);
  });

  test('Green ammonia: well within target, penalty=0', () => {
    const input: FuelEuInput = {
      fuelType: 'ammonia',
      consumptionMtPerDay: 30,
      voyageDays: 15,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityActual).toBe(4.96);
    expect(result.ghgIntensityTarget).toBe(91.16);
    expect(result.isCompliant).toBe(true);
    expect(result.penaltyEur).toBe(0);
    expect(result.complianceGapPct).toBeLessThan(0);
  });

  test('penaltyEur = gap_t_co2eq * 2400', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 100,
      voyageDays: 5,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    // Energy: 100 * 40200 * 5 = 20,100,000 MJ
    // Gap: (91.27 - 91.16) * 20,100,000 / 1e6 = 2.211 tCO2eq
    const expectedPenaltyEur = 2.211 * 2400;
    expect(result.penaltyEur).toBeCloseTo(expectedPenaltyEur, 1);
  });

  test('penaltyUsd = penaltyEur * 1.08 (fallback rate)', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 100,
      voyageDays: 5,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.penaltyUsd).toBeCloseTo(result.penaltyEur * 1.08, 1);
  });

  test('complianceGapPct: positive for non-compliant HFO', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    // Gap % = ((91.27 - 91.16) / 91.16) * 100 ≈ 0.12%
    expect(result.complianceGapPct).toBeGreaterThan(0);
    expect(result.complianceGapPct).toBeCloseTo(0.12, 2);
  });

  test('year 2030: target = 80.75, HFO clearly non-compliant', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2030,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityTarget).toBe(80.75);
    expect(result.isCompliant).toBe(false);

    // Gap: (91.27 - 80.75) = 10.52 g/MJ
    // Energy: 20,100,000 MJ
    // Gap tCO2eq: 10.52 * 20,100,000 / 1e6 = 211.452 tCO2eq
    // Penalty: 211.452 * 2400 = €507,484.8
    expect(result.penaltyEur).toBeGreaterThan(500_000);
    expect(result.penaltyEur).toBeCloseTo(507_484.8, 0);
  });

  test('year 2035: target = 62.62', () => {
    const input: FuelEuInput = {
      fuelType: 'mgo',
      consumptionMtPerDay: 30,
      voyageDays: 7,
      year: 2035,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityTarget).toBe(62.62);
    expect(result.isCompliant).toBe(false); // MGO 90.62 > 62.62
  });

  // ============ BOUNDARY TESTS (INPUT CONTRACT) ============

  test('consumptionMtPerDay=0 → totalEnergy=0, penalty=0, compliant', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 0,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.penaltyEur).toBe(0);
    expect(result.penaltyUsd).toBe(0);
    expect(result.isCompliant).toBe(true);
  });

  test('voyageDays=0 → totalEnergy=0, compliant', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 0,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.isCompliant).toBe(true);
    expect(result.penaltyEur).toBe(0);
  });

  test('unknown fuelType → throws Error', () => {
    const input: FuelEuInput = {
      fuelType: 'diesel',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    expect(() => calculateFuelEu(input)).toThrow('Unknown fuel type');
  });

  test('empty fuelType → throws Error', () => {
    const input: FuelEuInput = {
      fuelType: '',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    expect(() => calculateFuelEu(input)).toThrow('Unknown fuel type');
  });

  test('negative consumptionMtPerDay → treated as 0 (guard)', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: -50,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.isCompliant).toBe(true);
    expect(result.penaltyEur).toBe(0);
  });

  test('negative voyageDays → treated as 0 (guard)', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: -10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.isCompliant).toBe(true);
  });

  test('NaN consumptionMtPerDay → treated as 0 (Number.isFinite check)', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: NaN,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.isCompliant).toBe(true);
  });

  test('Infinity consumptionMtPerDay → treated as 0 (Number.isFinite check)', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: Infinity,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.isCompliant).toBe(true);
  });

  test('NaN voyageDays → treated as 0', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: NaN,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBe(0);
    expect(result.isCompliant).toBe(true);
  });

  test('very large consumption → no overflow (Number.isFinite check)', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 1e10, // 10 billion MT/day
      voyageDays: 1e5, // 100k days
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(Number.isFinite(result.totalEnergyMj)).toBe(true);
    expect(Number.isFinite(result.penaltyEur)).toBe(true);
  });

  test('year out of range (too early) → defaults to 2025 target', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2020,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityTarget).toBe(91.16); // 2025 target
  });

  test('year out of range (too late) → defaults to 2035 target', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2050,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityTarget).toBe(62.62); // 2035 target
  });

  test('year undefined → defaults to current year target', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
    };

    const result = calculateFuelEu(input);

    // Should pick 2025 or 2030 or 2035 based on current year
    expect([91.16, 80.75, 62.62]).toContain(result.ghgIntensityTarget);
  });

  // ============ MAGNITUDE TESTS (RANGE ASSERTIONS) ============

  test('penaltyEur range: non-negative', () => {
    const input: FuelEuInput = {
      fuelType: 'lng',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.penaltyEur).toBeGreaterThanOrEqual(0);
  });

  test('penaltyUsd range: non-negative', () => {
    const input: FuelEuInput = {
      fuelType: 'ammonia',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.penaltyUsd).toBeGreaterThanOrEqual(0);
  });

  test('totalEnergyMj range: non-negative', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.totalEnergyMj).toBeGreaterThanOrEqual(0);
  });

  test('ghgIntensityActual range: positive for valid fuel', () => {
    const input: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    const result = calculateFuelEu(input);

    expect(result.ghgIntensityActual).toBeGreaterThan(0);
    expect(result.ghgIntensityActual).toBeLessThanOrEqual(150); // reasonable upper bound
  });

  test('ghgIntensityTarget range: matches known targets', () => {
    const input2025: FuelEuInput = {
      fuelType: 'hfo',
      consumptionMtPerDay: 50,
      voyageDays: 10,
      year: 2025,
    };

    const result2025 = calculateFuelEu(input2025);
    expect(result2025.ghgIntensityTarget).toBeGreaterThanOrEqual(62.62);
    expect(result2025.ghgIntensityTarget).toBeLessThanOrEqual(91.16);
  });
});
