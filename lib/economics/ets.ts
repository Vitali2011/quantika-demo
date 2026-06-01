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

const FALLBACK_EUA_PRICE = 87.5; // EUR/tCO2

export interface EuEtsInput {
  distanceNm: number;
  euLegPercent: number; // 0.0–1.0
  vlsfoBurnMt: number;
  euaPrice: number; // EUR/tCO2
  /** Fuel type for CO₂ factor lookup. Default 'VLSFO' → Cf=3.151. */
  fuelType?: string;
  /** Calendar year for MRV phase-in. Default = current year (2026+ → 1.0). */
  year?: number;
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

  const cf = cfForFuel(fuelType ?? 'VLSFO');
  const phase = phaseIn(year ?? new Date().getFullYear());
  const amount = vlsfoBurnMt * cf * euLegPercent * phase * euaPrice;
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
  return { price: FALLBACK_EUA_PRICE, fetched_at: new Date().toISOString() };
}
