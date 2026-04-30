import type Database from 'better-sqlite3';

export const AIS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function ensureAisCacheTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ais_cache (
      imo        TEXT NOT NULL,
      kind       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (imo, kind)
    )
  `);
}

/** Returns cached payload if within TTL, otherwise null. */
export function getCached(db: Database.Database, imo: string, kind: string): unknown {
  if (!imo || !kind) return null;
  const row = db
    .prepare<[string, string, number], { payload: string }>(
      'SELECT payload FROM ais_cache WHERE imo = ? AND kind = ? AND fetched_at > ?'
    )
    .get(imo, kind, Date.now() - AIS_CACHE_TTL_MS);
  if (!row) return null;
  return JSON.parse(row.payload) as unknown;
}

/** Stores payload. No-op if imo, kind, or payload is falsy/null. */
export function setCached(db: Database.Database, imo: string, kind: string, payload: unknown): void {
  if (!imo || !kind || payload == null) return;
  db.prepare(
    'INSERT OR REPLACE INTO ais_cache (imo, kind, payload, fetched_at) VALUES (?, ?, ?, ?)'
  ).run(imo, kind, JSON.stringify(payload), Date.now());
}

/** Returns cached payload ignoring TTL (for rate-limit fallback). Returns null if no entry. */
export function getStaleCached(db: Database.Database, imo: string, kind: string): unknown {
  if (!imo || !kind) return null;
  const row = db
    .prepare<[string, string], { payload: string }>(
      'SELECT payload FROM ais_cache WHERE imo = ? AND kind = ?'
    )
    .get(imo, kind);
  if (!row) return null;
  return JSON.parse(row.payload) as unknown;
}
