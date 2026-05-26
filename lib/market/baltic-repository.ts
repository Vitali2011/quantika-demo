import type Database from 'better-sqlite3';

export interface BalticIndexRow {
  index_code: string;
  value: number;
  price_date: string;
  source: string;
}

export function getLatestBalticIndex(
  db: Database.Database,
  indexCode: string,
): BalticIndexRow | null {
  const row = db.prepare<[string], BalticIndexRow>(`
    SELECT index_code, value, price_date, source
    FROM baltic_indices
    WHERE index_code = ?
    ORDER BY price_date DESC
    LIMIT 1
  `).get(indexCode);
  return row ?? null;
}

export function getBalticHistory(
  db: Database.Database,
  indexCode: string,
  days: number,
): BalticIndexRow[] {
  if (!db) throw new RangeError('db required');
  if (!indexCode) throw new RangeError('indexCode required');
  if (!Number.isFinite(days) || days < 0) throw new RangeError('days must be non-negative finite');
  if (days === 0) return [];

  return db.prepare<[string, number], BalticIndexRow>(`
    SELECT index_code, value, price_date, source
    FROM baltic_indices
    WHERE index_code = ?
    ORDER BY price_date DESC
    LIMIT ?
  `).all(indexCode, days);
}
