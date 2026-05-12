import type Database from 'better-sqlite3';

export interface MarketIndexRow {
  id: string;
  index_name: string;
  index_date: string;
  value: number;
  unit: string;
  source: string;
  fetched_at: string;
}

export function getLatestIndex(
  db: Database.Database,
  indexName: string
): MarketIndexRow | null {
  if (!db) {
    throw new RangeError('db required');
  }
  if (!indexName) {
    throw new RangeError('indexName required');
  }

  const row = db.prepare<[string], MarketIndexRow>(`
    SELECT id, index_name, index_date, value, unit, source, fetched_at
    FROM market_indices
    WHERE index_name = ?
    ORDER BY index_date DESC
    LIMIT 1
  `).get(indexName);

  return row ?? null;
}

export function getIndexHistory(
  db: Database.Database,
  indexName: string,
  days: number
): MarketIndexRow[] {
  if (!db) {
    throw new RangeError('db required');
  }
  if (!indexName) {
    throw new RangeError('indexName required');
  }
  if (!Number.isFinite(days)) {
    throw new RangeError('days must be finite');
  }
  if (days < 0) {
    throw new RangeError('days must be >= 0');
  }

  if (days === 0) {
    return [];
  }

  const rows = db.prepare<[string, number], MarketIndexRow>(`
    SELECT id, index_name, index_date, value, unit, source, fetched_at
    FROM market_indices
    WHERE index_name = ?
    ORDER BY index_date DESC
    LIMIT ?
  `).all(indexName, days);

  return rows;
}

export function upsertIndex(db: Database.Database, row: MarketIndexRow): void {
  if (!db) {
    throw new RangeError('db required');
  }
  if (!row.id || !row.index_name || !row.index_date || !row.source) {
    throw new RangeError('required fields');
  }
  if (!Number.isFinite(row.value)) {
    throw new RangeError('value must be finite');
  }
  if (row.value < 0) {
    throw new RangeError('value must be >= 0');
  }

  db.prepare(`
    INSERT INTO market_indices (id, index_name, index_date, value, unit, source, fetched_at)
    VALUES (@id, @index_name, @index_date, @value, @unit, @source, @fetched_at)
    ON CONFLICT(index_name, index_date) DO UPDATE SET
      value = excluded.value,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `).run(row);
}
