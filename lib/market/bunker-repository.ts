import type Database from 'better-sqlite3';

export interface BunkerPriceRow {
  port_unlocode: string;
  fuel_grade: string;
  price_usd_per_mt: number;
  price_date: string;
  source: string;
  fetched_at: string;
}

export function getLatestBunkerPrice(
  db: Database.Database,
  portUnlocode: string,
  fuelGrade: string,
): BunkerPriceRow | null {
  const row = db.prepare<[string, string], BunkerPriceRow>(`
    SELECT port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at
    FROM bunker_prices
    WHERE port_unlocode = ? AND fuel_grade = ? AND price_date <= date('now')
    ORDER BY price_date DESC
    LIMIT 1
  `).get(portUnlocode, fuelGrade);
  return row ?? null;
}

export function upsertBunkerPrice(db: Database.Database, row: BunkerPriceRow): void {
  db.prepare(`
    INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at)
    VALUES (@port_unlocode, @fuel_grade, @price_usd_per_mt, @price_date, @source, @fetched_at)
    ON CONFLICT(port_unlocode, fuel_grade, price_date) DO UPDATE SET
      price_usd_per_mt = excluded.price_usd_per_mt,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `).run(row);
}
