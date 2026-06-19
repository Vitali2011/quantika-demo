/**
 * DB-backed EUR→USD resolver. Reads the FX subsystem (`fx_rates`, populated by the
 * daily Frankfurter/ECB cron) AS-OF the clock date. In DEMO_MODE `today()` is the
 * frozen date, so the rate is deterministic (never drifts day to day); outside demo
 * it tracks the latest rate.
 *
 * Kept separate from `fx-rate.ts` so that the pure economics functions (which import
 * only the EUR_USD_FALLBACK constant) do not transitively load better-sqlite3 / the
 * clock at module-import time. Import this only from async request handlers.
 */
import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db/index';
import { today } from '@/lib/clock';
import { EUR_USD_FALLBACK, type EurToUsd } from './fx-rate';

export type { EurToUsd } from './fx-rate';
export { EUR_USD_FALLBACK } from './fx-rate';

/**
 * Resolve EUR→USD as-of the (demo-frozen or real) clock date.
 * Synchronous — better-sqlite3 is sync, so request handlers can read the resolved
 * `.rate` number and inject it into the (pure, synchronous) economics functions.
 */
export function getEurToUsd(db?: Database.Database): EurToUsd {
  try {
    const database = db ?? getDb();
    const asOf = today();
    const row = database
      .prepare<[string], { rate: number; rate_date: string }>(
        `SELECT rate, rate_date FROM fx_rates
         WHERE base_currency = 'EUR' AND quote_currency = 'USD' AND rate_date <= ?
         ORDER BY rate_date DESC
         LIMIT 1`,
      )
      .get(asOf);
    if (row && typeof row.rate === 'number' && row.rate > 0) {
      return { rate: row.rate, tier: 'live', rateDate: row.rate_date };
    }
  } catch {
    // FX source unavailable — fall through to the estimated constant.
  }
  return { rate: EUR_USD_FALLBACK, tier: 'estimated', rateDate: null };
}
