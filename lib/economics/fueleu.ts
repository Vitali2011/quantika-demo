/**
 * FuelEU Maritime Calculator
 * Implements Well-to-Wake GHG intensity calculation per EU Regulation 2023/1805
 * Penalty: €2400/tCO2eq for non-compliance
 */

// GHG intensity g CO2eq/MJ (Well-to-Wake, FuelEU Maritime Annex I)
export const FUEL_GHG_INTENSITY: Record<string, number> = {
  hfo: 91.27, // Heavy Fuel Oil
  lfo: 91.27, // Light Fuel Oil
  mdo: 90.62, // Marine Diesel Oil
  mgo: 90.62, // Marine Gas Oil
  vlsfo: 91.27, // Very Low Sulfur FO
  lng: 75.21, // Liquefied Natural Gas
  methanol: 98.2, // Conventional methanol (fossil)
  ammonia: 4.96, // Green ammonia
  'biodiesel-b100': 17.3, // B100 FAME
  'hydrogen-green': 3.58, // Green hydrogen
};

// Lower calorific value MJ/t
export const FUEL_LCV: Record<string, number> = {
  hfo: 40200,
  lfo: 41200,
  mdo: 42700,
  mgo: 42700,
  vlsfo: 40200,
  lng: 49100,
  methanol: 19900,
  ammonia: 18600,
  'biodiesel-b100': 37000,
  'hydrogen-green': 120000,
};

// FuelEU GHG intensity target 2025-2050 (g CO2eq/MJ, Well-to-Wake)
export const FUELEU_TARGET_2025 = 91.16; // -2% vs 2020 baseline 93.04
export const FUELEU_TARGET_2030 = 80.75; // -13%
export const FUELEU_TARGET_2035 = 62.62; // -29%
export const FUELEU_PENALTY_EUR_PER_T_CO2EQ = 2400;

// EUR/USD fallback rate (from currency.ts or hardcoded)
const EUR_USD_FALLBACK = 1.08;

export interface FuelEuInput {
  fuelType: string; // key from FUEL_GHG_INTENSITY
  consumptionMtPerDay: number; // metric tons fuel per day
  voyageDays: number;
  year?: number; // for target selection (default: current year)
}

export interface FuelEuResult {
  ghgIntensityActual: number; // g CO2eq/MJ actual
  ghgIntensityTarget: number; // g CO2eq/MJ target for year
  complianceGapPct: number; // positive = non-compliant, negative = over-compliant
  penaltyEur: number; // €0 if compliant
  penaltyUsd: number; // converted at ~1.08 rate
  totalEnergyMj: number;
  isCompliant: boolean;
}

/**
 * Calculate FuelEU Maritime compliance for a voyage
 *
 * Input Contract Boundary Checks:
 * - Empty/falsy fuelType → throw Error('Unknown fuel type')
 * - Special floats (NaN, Infinity) → treat as 0 (Number.isFinite guard)
 * - Negative consumption/voyageDays → clamp to 0
 * - Unknown fuelType → throw Error('Unknown fuel type: X')
 * - Zero values → valid, totalEnergy=0, compliant, penalty=0
 * - Out-of-range year → fallback to nearest target (2025 or 2035)
 */
export function calculateFuelEu(input: FuelEuInput): FuelEuResult {
  const { fuelType, year } = input;

  // Input validation: fuelType
  if (!fuelType || !FUEL_GHG_INTENSITY[fuelType]) {
    throw new Error(`Unknown fuel type: ${fuelType}`);
  }

  // Input validation: consumption and voyageDays (NaN, Infinity, negative → 0)
  const consumptionMtPerDay = Number.isFinite(input.consumptionMtPerDay) && input.consumptionMtPerDay > 0
    ? input.consumptionMtPerDay
    : 0;

  const voyageDays = Number.isFinite(input.voyageDays) && input.voyageDays > 0
    ? input.voyageDays
    : 0;

  // Get fuel properties
  const ghgIntensityActual = FUEL_GHG_INTENSITY[fuelType];
  const lcv = FUEL_LCV[fuelType];

  // Calculate total energy
  const energyPerDay = consumptionMtPerDay * lcv; // MJ/day
  const totalEnergyMj = energyPerDay * voyageDays;

  // Determine target based on year
  const targetYear = year ?? new Date().getFullYear();
  let ghgIntensityTarget: number;

  if (targetYear < 2028) {
    ghgIntensityTarget = FUELEU_TARGET_2025;
  } else if (targetYear < 2033) {
    ghgIntensityTarget = FUELEU_TARGET_2030;
  } else {
    ghgIntensityTarget = FUELEU_TARGET_2035;
  }

  // Compliance check
  const isCompliant = ghgIntensityActual <= ghgIntensityTarget || totalEnergyMj === 0;

  // Penalty calculation
  let penaltyEur = 0;
  let complianceGapPct = 0;

  if (!isCompliant && totalEnergyMj > 0) {
    const gapGPerMj = ghgIntensityActual - ghgIntensityTarget;
    const gapTCo2eq = (gapGPerMj * totalEnergyMj) / 1e6; // convert g to tonnes
    penaltyEur = gapTCo2eq * FUELEU_PENALTY_EUR_PER_T_CO2EQ;
    complianceGapPct = (gapGPerMj / ghgIntensityTarget) * 100;
  } else if (isCompliant && totalEnergyMj > 0) {
    // Over-compliant: negative gap
    const gapGPerMj = ghgIntensityActual - ghgIntensityTarget;
    complianceGapPct = (gapGPerMj / ghgIntensityTarget) * 100;
  }

  const penaltyUsd = penaltyEur * EUR_USD_FALLBACK;

  return {
    ghgIntensityActual,
    ghgIntensityTarget,
    complianceGapPct,
    penaltyEur,
    penaltyUsd,
    totalEnergyMj,
    isCompliant,
  };
}
