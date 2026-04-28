const CO2_FACTOR = 3.114; // tCO2/t VLSFO (BIMCO Allowance Clause 2022)
const FALLBACK_EUA_PRICE = 87.5; // EUR/tCO2

export interface EuEtsInput {
  distanceNm: number;
  euLegPercent: number; // 0.0–1.0
  vlsfoBurnMt: number;
  euaPrice: number; // EUR/tCO2
}

export interface EuEtsResult {
  amountEur: number;
  applicable: boolean;
}

export function calculateEuEts(input: EuEtsInput): EuEtsResult {
  const { distanceNm, euLegPercent, vlsfoBurnMt, euaPrice } = input;

  if (distanceNm <= 0 || euLegPercent <= 0) {
    return { amountEur: 0, applicable: false };
  }

  const amount = vlsfoBurnMt * CO2_FACTOR * euLegPercent * euaPrice;
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
