import type Database from 'better-sqlite3';

export interface BalticIndexRow {
  index_code: string;
  value: number;
  price_date: string;
  source: string;
}

export interface UpsertBalticIndexInput {
  index_code: string;
  value: number;
  price_date: string;
  source: string;
}

export function upsertBalticIndex(
  db: Database.Database,
  row: UpsertBalticIndexInput,
): void {
  if (!db) throw new RangeError('db required');
  if (!row.index_code) throw new RangeError('index_code required');
  if (!row.price_date) throw new RangeError('price_date required');
  if (!Number.isFinite(row.value) || row.value < 0) {
    throw new RangeError('value must be finite and non-negative');
  }

  db.prepare(`
    INSERT INTO baltic_indices (index_code, value, price_date, source, fetched_at)
    VALUES (@index_code, @value, @price_date, @source, datetime('now'))
    ON CONFLICT(index_code, price_date) DO UPDATE SET
      value = excluded.value,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `).run(row);
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
