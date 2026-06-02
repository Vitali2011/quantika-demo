import { cfForFuel } from './ets';
import { isEuCountry } from '@/lib/validation/sanctions';

export interface BunkerCandidateInput {
  port: string;
  grade: string;
  priceUsdPerMt: number;
  /** Raw detour vs direct route (NM). Negative = port shortens route; treated as 0. */
  deviationNm: number;
}

export interface BunkerCandidateResult {
  port: string;
  grade: string;
  priceUsdPerMt: number;
  deviationNm: number;
  /** Extra sailing time to reach this port (hours). */
  deviationHours: number;
  /** Cost of fuel burned during the detour (USD). */
  deviationFuelUsd: number;
  /** Opportunity cost of time lost on detour (USD). */
  timeCostUsd: number;
  /** EU ETS carbon cost for lifting at this port (USD total). 0 for non-EU ports. */
  carbonCostUsd: number;
  /** EU ETS carbon cost per MT of lift (USD). 0 for non-EU ports. */
  carbonUsdPerMt: number;
  /** True when no live EUA price was provided — carbon = 0, results exclude ETS cost. */
  euaUsedFallback: boolean;
  /** All-in price per MT including detour costs and EU ETS carbon: (price*lift + devFuel + devTime + carbon) / lift. */
  effectiveUsdPerMt: number;
  /** Always true — only on-route candidates are expected as input. */
  onRoute: boolean;
}

export interface BunkerComparisonInput {
  candidates: BunkerCandidateInput[];
  vesselSpeedKn: number;
  dailyConsMtPerDay: number;
  liftTonnes: number;
  vesselDayRateUsd: number;
  /** EU ETS EUA price in EUR/tCO2. If omitted, carbon cost = 0 and euaUsedFallback = true. */
  euaPriceEur?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// EUR/USD rate — matches lib/economics/voyage-calculator.ts and lib/currency.ts
const EUR_TO_USD = 1.08;

// Ceuta is a Spanish territory (ES prefix) but outside the maritime EU ETS scope
const NON_EU_ETS_OVERRIDE = new Set(['ESCEU']);

/**
 * Returns true if the port LOCODE falls within the EU EEA maritime ETS zone.
 * Uses the 2-letter country prefix of the LOCODE with the EU_COUNTRIES set from
 * lib/validation/sanctions.ts, plus an explicit override for Ceuta (ESCEU).
 */
export function isEuEtsPort(locode: string): boolean {
  if (NON_EU_ETS_OVERRIDE.has(locode)) return false;
  return isEuCountry(locode.slice(0, 2));
}

/**
 * Compute per-port effective $/MT for a list of on-route bunker candidates.
 * Returns candidates sorted by effectiveUsdPerMt ASC (cheapest all-in first).
 *
 * Formula:
 *   effectiveDeviationNm = max(0, deviationNm)
 *   deviationFuelUsd = devNm * (dailyConsT / (speedKn * 24)) * priceUsdPerMt
 *   timeCostUsd      = devNm / speedKn / 24 * vesselDayRateUsd
 *   carbonCostUsd    = euaPriceEur * EUR_TO_USD * Cf * liftTonnes  (EU ports only; 0 if euaPriceEur not provided)
 *   effectiveUsdPerMt = (priceUsdPerMt * liftTonnes + deviationFuelUsd + timeCostUsd + carbonCostUsd) / liftTonnes
 *
 * Invariant: effectiveUsdPerMt = priceUsdPerMt + deviationFuelUsd/lift + timeCostUsd/lift + carbonUsdPerMt
 */
export function computeBunkerComparison(input: BunkerComparisonInput): BunkerCandidateResult[] {
  const { candidates, vesselSpeedKn, dailyConsMtPerDay, liftTonnes, vesselDayRateUsd, euaPriceEur } = input;

  if (vesselSpeedKn <= 0 || dailyConsMtPerDay <= 0 || liftTonnes <= 0) return [];

  const euaUsedFallback = euaPriceEur == null;

  const results = candidates.map((c): BunkerCandidateResult => {
    const effDevNm = Math.max(0, c.deviationNm);
    const deviationHours = round2(effDevNm / vesselSpeedKn);
    const deviationFuelUsd = round2(effDevNm * (dailyConsMtPerDay / (vesselSpeedKn * 24)) * c.priceUsdPerMt);
    const timeCostUsd = round2((effDevNm / vesselSpeedKn / 24) * vesselDayRateUsd);

    let carbonCostUsd = 0;
    let carbonUsdPerMt = 0;
    if (!euaUsedFallback && isEuEtsPort(c.port)) {
      const cf = cfForFuel(c.grade);
      carbonCostUsd = round2(euaPriceEur * EUR_TO_USD * cf * liftTonnes);
      carbonUsdPerMt = round2(carbonCostUsd / liftTonnes);
    }

    const effectiveUsdPerMt = round2(
      (c.priceUsdPerMt * liftTonnes + deviationFuelUsd + timeCostUsd + carbonCostUsd) / liftTonnes,
    );

    return {
      port: c.port,
      grade: c.grade,
      priceUsdPerMt: c.priceUsdPerMt,
      deviationNm: c.deviationNm,
      deviationHours,
      deviationFuelUsd,
      timeCostUsd,
      carbonCostUsd,
      carbonUsdPerMt,
      euaUsedFallback,
      effectiveUsdPerMt,
      onRoute: true,
    };
  });

  return results.sort((a, b) => a.effectiveUsdPerMt - b.effectiveUsdPerMt);
}
