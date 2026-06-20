import type Database from 'better-sqlite3';

export interface EuaPriceRow {
  price_date: string;
  price_eur_per_tco2: number;
  contract_type: string;
  source: string;
  fetched_at: string;
}

/**
 * Warn (and treat the row as unavailable) when the latest EUA price is older
 * than this many days. Mirrors BUNKER_STALE_DAYS — EEX auctions run weekdays,
 * so 7 days covers a weekend plus one missed fetch. Also the UI freshness
 * contract in app/api/market/benchmark/route.ts (STALE_THRESHOLD_MS = 7d).
 */
export const EUA_STALE_DAYS = 7;

/**
 * Latest EUA spot price, gated on freshness.
 *
 * When the newest row's `price_date` is older than `maxAgeDays` (default
 * EUA_STALE_DAYS), this logs `[eua] eua_price_stale:` and returns null — P&L
 * callers then degrade to FALLBACK_EUA_EUR_PER_TCO2 instead of silently using
 * a stale price. Pass `{ maxAgeDays: Infinity }` to bypass the gate and get the
 * raw last-known row (e.g. last-good range validation in the TE adapter).
 */
export function getLatestEuaPrice(
  db: Database.Database,
  contractType = 'spot',
  opts?: { maxAgeDays?: number },
): EuaPriceRow | null {
  const row = db.prepare<[string], EuaPriceRow>(`
    SELECT price_date, price_eur_per_tco2, contract_type, source, fetched_at
    FROM eua_prices
    WHERE contract_type = ? AND price_date <= date('now')
    ORDER BY price_date DESC
    LIMIT 1
  `).get(contractType);
  if (!row) return null;

  const maxAge = opts?.maxAgeDays ?? EUA_STALE_DAYS;
  if (Number.isFinite(maxAge)) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - maxAge);
    const thresholdStr = threshold.toISOString().slice(0, 10);
    if (row.price_date < thresholdStr) {
      console.warn(`[eua] eua_price_stale: last=${row.price_date} threshold=${thresholdStr}`);
      return null;
    }
  }
  return row;
}

export function getEuaHistory(
  db: Database.Database,
  contractType = 'spot',
  days: number,
): EuaPriceRow[] {
  if (!db) throw new RangeError('db required');
  if (!Number.isFinite(days) || days < 0) throw new RangeError('days must be non-negative finite');
  if (days === 0) return [];

  return db.prepare<[string, number], EuaPriceRow>(`
    SELECT price_date, price_eur_per_tco2, contract_type, source, fetched_at
    FROM eua_prices
    WHERE contract_type = ? AND price_date <= date('now')
    ORDER BY price_date DESC
    LIMIT ?
  `).all(contractType, days);
}

export function upsertEuaPrice(db: Database.Database, row: EuaPriceRow): void {
  db.prepare(`
    INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at)
    VALUES (@price_date, @price_eur_per_tco2, @contract_type, @source, @fetched_at)
    ON CONFLICT(price_date, contract_type) DO UPDATE SET
      price_eur_per_tco2 = excluded.price_eur_per_tco2,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `).run(row);
}
