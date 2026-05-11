import type Database from 'better-sqlite3';

export interface FxRateRow {
  base_currency: string;
  quote_currency: string;
  rate: number;
  rate_date: string;
  source: string;
  fetched_at: string;
}

export function getLatestFxRate(
  db: Database.Database,
  base: string,
  quote: string
): FxRateRow | null {
  const row = db.prepare<[string, string], FxRateRow>(`
    SELECT base_currency, quote_currency, rate, rate_date, source, fetched_at
    FROM fx_rates
    WHERE base_currency = ? AND quote_currency = ?
    ORDER BY rate_date DESC
    LIMIT 1
  `).get(base, quote);
  return row ?? null;
}

export function upsertFxRate(db: Database.Database, row: FxRateRow): void {
  db.prepare(`
    INSERT INTO fx_rates (base_currency, quote_currency, rate, rate_date, source, fetched_at)
    VALUES (@base_currency, @quote_currency, @rate, @rate_date, @source, @fetched_at)
    ON CONFLICT(base_currency, quote_currency, rate_date) DO UPDATE SET
      rate = excluded.rate,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `).run(row);
}
