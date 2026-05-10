import type Database from 'better-sqlite3';

export interface EuaPriceRow {
  price_date: string;
  price_eur_per_tco2: number;
  contract_type: string;
  source: string;
  fetched_at: string;
}

export function getLatestEuaPrice(db: Database.Database, contractType = 'spot'): EuaPriceRow | null {
  const row = db.prepare<[string], EuaPriceRow>(`
    SELECT price_date, price_eur_per_tco2, contract_type, source, fetched_at
    FROM eua_prices
    WHERE contract_type = ?
    ORDER BY price_date DESC
    LIMIT 1
  `).get(contractType);
  return row ?? null;
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
