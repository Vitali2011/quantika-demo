import { CurrencyConversion } from "./types";

// In-memory cache: key = "FROM_TO", value = { rate, timestamp }
const rateCache = new Map<string, { rate: number; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const FALLBACK_RATES: Record<string, number> = {
  EUR_USD: 1.08,
  GBP_USD: 1.27,
  USD_EUR: 1 / 1.08,
  USD_GBP: 1 / 1.27,
  NOK_USD: 0.092,   // Norwegian Krone — needed for FSP/Nordic routes
  USD_NOK: 10.87,
  AED_USD: 0.272,   // UAE Dirham — Dubai/MENA market
  USD_AED: 3.67,
};

// Frankfurter API (ECB-backed, free, no auth): https://api.frankfurter.app
const FRANKFURTER_URL = "https://api.frankfurter.app/latest";

export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<CurrencyConversion> {
  if (from === to) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      targetAmount: amount,
      targetCurrency: to,
      exchangeRate: 1,
      rateDate: new Date().toISOString().split("T")[0],
      source: "manual",
    };
  }

  const cacheKey = `${from}_${to}`;
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      originalAmount: amount,
      originalCurrency: from,
      targetAmount: Math.round(amount * cached.rate * 100) / 100,
      targetCurrency: to,
      exchangeRate: cached.rate,
      rateDate: new Date(cached.timestamp).toISOString().split("T")[0],
      source: "frankfurter",
    };
  }

  // Try Frankfurter API (replaces exchangerate.host — ECB-backed, reliable, no auth)
  try {
    const res = await fetch(`${FRANKFURTER_URL}?from=${from}&to=${to}`);
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.[to];
      if (typeof rate === "number" && rate > 0) {
        rateCache.set(cacheKey, { rate, timestamp: Date.now() });
        return {
          originalAmount: amount,
          originalCurrency: from,
          targetAmount: Math.round(amount * rate * 100) / 100,
          targetCurrency: to,
          exchangeRate: rate,
          rateDate: data?.date ?? new Date().toISOString().split("T")[0],
          source: "frankfurter",
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback to hardcoded rates
  const fallbackRate = FALLBACK_RATES[cacheKey] ?? 1;
  return {
    originalAmount: amount,
    originalCurrency: from,
    targetAmount: Math.round(amount * fallbackRate * 100) / 100,
    targetCurrency: to,
    exchangeRate: fallbackRate,
    rateDate: new Date().toISOString().split("T")[0],
    source: "manual",
  };
}

export function formatCurrencyAmount(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === "USD") return `$${formatted}`;
  return `${currency} ${formatted}`;
}

// Clear cache (for testing)
export function clearCurrencyCache(): void {
  rateCache.clear();
}
