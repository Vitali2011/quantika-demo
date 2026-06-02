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
  /** All-in price per MT including detour costs: (price*lift + devFuel + devTime) / lift. */
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute per-port effective $/MT for a list of on-route bunker candidates.
 * Returns candidates sorted by effectiveUsdPerMt ASC (cheapest all-in first).
 *
 * Formula:
 *   effectiveDeviationNm = max(0, deviationNm)
 *   deviationFuelUsd = devNm * (dailyConsT / (speedKn * 24)) * priceUsdPerMt
 *   timeCostUsd      = devNm / speedKn / 24 * vesselDayRateUsd
 *   effectiveUsdPerMt = (priceUsdPerMt * liftTonnes + deviationFuelUsd + timeCostUsd) / liftTonnes
 */
export function computeBunkerComparison(input: BunkerComparisonInput): BunkerCandidateResult[] {
  const { candidates, vesselSpeedKn, dailyConsMtPerDay, liftTonnes, vesselDayRateUsd } = input;

  if (vesselSpeedKn <= 0 || dailyConsMtPerDay <= 0 || liftTonnes <= 0) return [];

  const results = candidates.map((c): BunkerCandidateResult => {
    const effDevNm = Math.max(0, c.deviationNm);
    const deviationHours = round2(effDevNm / vesselSpeedKn);
    const deviationFuelUsd = round2(effDevNm * (dailyConsMtPerDay / (vesselSpeedKn * 24)) * c.priceUsdPerMt);
    const timeCostUsd = round2((effDevNm / vesselSpeedKn / 24) * vesselDayRateUsd);
    const effectiveUsdPerMt = round2((c.priceUsdPerMt * liftTonnes + deviationFuelUsd + timeCostUsd) / liftTonnes);

    return {
      port: c.port,
      grade: c.grade,
      priceUsdPerMt: c.priceUsdPerMt,
      deviationNm: c.deviationNm,
      deviationHours,
      deviationFuelUsd,
      timeCostUsd,
      effectiveUsdPerMt,
      onRoute: true,
    };
  });

  return results.sort((a, b) => a.effectiveUsdPerMt - b.effectiveUsdPerMt);
}
