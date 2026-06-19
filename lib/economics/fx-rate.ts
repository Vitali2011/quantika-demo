/**
 * Single source of truth for the EUR→USD rate used across voyage economics
 * (EU ETS, FuelEU penalty, bunker-carbon). Replaces the hardcoded `1.08`
 * literals that previously lived in compute-tce.ts / fueleu.ts / bunker-comparison.ts.
 *
 * This module is intentionally dependency-light: the pure/synchronous economics
 * functions import only `EUR_USD_FALLBACK` from here, so they must NOT transitively
 * pull in better-sqlite3 / the clock. The DB-backed resolver lives in
 * `fx-rate-source.ts` and is imported only by async request handlers.
 */

/** Fallback EUR/USD used only when the FX feed is unavailable. Tier: 'estimated'. */
export const EUR_USD_FALLBACK = 1.08;

export interface EurToUsd {
  rate: number;
  tier: 'live' | 'estimated';
  /** rate_date of the sourced row, or null when falling back to the constant. */
  rateDate: string | null;
}
