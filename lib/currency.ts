import type Database from "better-sqlite3";
import { CurrencyConversion } from "./types";
import { getLatestFxRate, upsertFxRate } from "./market/fx-rates-repository";

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
  to: string,
  db?: Database.Database
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

  // Tier 1: in-memory cache (24h TTL — survives within a server process)
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

  // Tier 2: SQLite fx_rates table (populated by daily cron, survives restarts)
  if (db) {
    const row = getLatestFxRate(db, from, to);
    if (row && typeof row.rate === "number" && row.rate > 0) {
      rateCache.set(cacheKey, { rate: row.rate, timestamp: Date.now() });
      return {
        originalAmount: amount,
        originalCurrency: from,
        targetAmount: Math.round(amount * row.rate * 100) / 100,
        targetCurrency: to,
        exchangeRate: row.rate,
        rateDate: row.rate_date,
        source: "frankfurter",
      };
    }
  }

  // Tier 3: Frankfurter API (ECB-backed, free, no auth)
  try {
    const res = await fetch(`${FRANKFURTER_URL}?from=${from}&to=${to}`);
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.[to];
      if (typeof rate === "number" && rate > 0) {
        rateCache.set(cacheKey, { rate, timestamp: Date.now() });
        const rateDate = data?.date ?? new Date().toISOString().split("T")[0];
        if (db) {
          upsertFxRate(db, {
            base_currency: from, quote_currency: to, rate,
            rate_date: rateDate, source: "frankfurter",
            fetched_at: new Date().toISOString(),
          });
        }
        return {
          originalAmount: amount,
          originalCurrency: from,
          targetAmount: Math.round(amount * rate * 100) / 100,
          targetCurrency: to,
          exchangeRate: rate,
          rateDate,
          source: "frankfurter",
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Tier 4: hardcoded fallback rates (always available)
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
  const isNegative = amount < 0;
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = isNegative ? "-" : "";
  if (currency === "USD") return `${sign}$${formatted}`;
  return `${sign}${currency} ${formatted}`;
}

// Centralized currency-code → display-symbol map. Keeps the Unicode symbol for
// the currencies the commission/summary board renders (USD → "$", EUR → "€") so
// the existing board stays visually identical; unknown codes fall back to the
// code itself rather than being mislabeled as USD. Distinct from
// formatCurrencyAmount, which renders EUR as the text "EUR" (verbose by design).
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  NOK: "kr",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

// Clear cache (for testing)
export function clearCurrencyCache(): void {
  rateCache.clear();
}
