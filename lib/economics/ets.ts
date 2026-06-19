import { FALLBACK_EUA_EUR_PER_TCO2 } from '@/lib/constants';

// IMO/BIMCO emission factors tCO2/t fuel — Fourth IMO GHG Study 2020 + BIMCO Allowance Clause 2022
// DEMO: interim values for demonstration purposes; production use requires verified source data.
const CF_BY_FUEL: Record<string, number> = {
  HFO: 3.114,
  HSFO: 3.114,
  VLSFO: 3.151,
  LFO: 3.151,
  MGO: 3.206,
  MDO: 3.206,
  LNG: 2.750,
};
const CF_DEFAULT = 3.151; // VLSFO

export function cfForFuel(grade: string): number {
  return CF_BY_FUEL[grade.toUpperCase()] ?? CF_DEFAULT;
}

// EU ETS MRV phase-in schedule (Directive 2023/959/EU)
// 2024=40%, 2025=70%, 2026+=100%
export function phaseIn(year: number): number {
  if (year <= 2023) return 0;
  if (year === 2024) return 0.4;
  if (year === 2025) return 0.7;
  return 1.0;
}

// FALLBACK_EUA_EUR_PER_TCO2 imported from lib/constants — single source of truth (W7).

export interface EuEtsInput {
  distanceNm: number;
  euLegPercent: number; // 0.0–1.0
  vlsfoBurnMt: number;
  euaPrice: number; // EUR/tCO2
  /** Fuel type for CO₂ factor lookup. Default 'VLSFO' → Cf=3.151. */
  fuelType?: string;
  /**
   * Calendar year for MRV phase-in. Omitted → fully-phased steady-state (1.0);
   * the function never reads the wall-clock. Pass an explicit clock-anchored
   * year for time-correct phase-in. (audit #6)
   */
  year?: number;
  /**
   * EU ETS coverage factor — derived from whether voyage endpoints are in EU/EEA.
   * Both EU → 1.0; exactly one EU → 0.5; neither → 0. Absent → 1.0 (backward-compat).
   */
  originEu?: boolean;
  destEu?: boolean;
}

export interface EuEtsResult {
  amountEur: number;
  applicable: boolean;
}

export function calculateEuEts(input: EuEtsInput): EuEtsResult {
  const { distanceNm, euLegPercent, vlsfoBurnMt, euaPrice, fuelType, year } = input;

  if (
    !Number.isFinite(distanceNm) || distanceNm <= 0 ||
    !Number.isFinite(euLegPercent) || euLegPercent <= 0 || euLegPercent > 1 ||
    !Number.isFinite(vlsfoBurnMt) || vlsfoBurnMt <= 0 ||
    !Number.isFinite(euaPrice) || euaPrice <= 0
  ) {
    return { amountEur: 0, applicable: false };
  }

  // EU ETS regulatory coverage: intra-EU=100%, in/out-EU=50%, extra-EU=0%.
  // Absent flags → 1.0 (conservative backward-compat; avoids silent under-charge).
  let coverageFactor = 1.0;
  if (input.originEu !== undefined || input.destEu !== undefined) {
    const euCount = (input.originEu ? 1 : 0) + (input.destEu ? 1 : 0);
    coverageFactor = euCount === 2 ? 1.0 : euCount === 1 ? 0.5 : 0.0;
  }
  if (coverageFactor === 0) return { amountEur: 0, applicable: false };

  const cf = cfForFuel(fuelType ?? 'VLSFO');
  // Pure function: never read the wall-clock here (audit #6). When `year` is
  // omitted, default to the 2026+ fully-phased steady-state (1.0). Production
  // callers MUST pass an explicit clock-anchored year (demo-frozen via lib/clock)
  // so the calc is deterministic and identical regardless of when it runs.
  const phase = year === undefined ? 1.0 : phaseIn(year);
  const amount = vlsfoBurnMt * cf * euLegPercent * phase * euaPrice * coverageFactor;
  return {
    amountEur: Math.round(amount * 100) / 100,
    applicable: amount > 0,
  };
}

export interface EuaPriceResult {
  price: number;
  fetched_at: string;
}

export async function fetchEuaPrice(): Promise<EuaPriceResult> {
  try {
    const res = await fetch(
      'https://www.eex.com/en/market-data/environmental-markets/spot-market/european-emission-allowances#!/2026',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`EEX fetch failed: ${res.status}`);
    const html = await res.text();
    // Extract price from EEX page — last traded price in format like "87.50"
    const match = html.match(/class="[^"]*last[^"]*"[^>]*>\s*([\d]+\.[\d]+)/i)
      ?? html.match(/([\d]{2,3}\.\d{2})\s*EUR/);
    if (match) {
      return { price: parseFloat(match[1]), fetched_at: new Date().toISOString() };
    }
  } catch {
    // fallthrough to constant
  }
  return { price: FALLBACK_EUA_EUR_PER_TCO2, fetched_at: new Date().toISOString() };
}
