import type Database from 'better-sqlite3';

export interface PscRecord {
  id: string;
  imo: string;
  inspection_date: string; // YYYY-MM-DD
  port: string | null;
  authority: 'paris-mou' | 'tokyo-mou' | 'uscg' | 'other';
  deficiencies: number;
  detained: boolean;
  source_url: string | null;
}

/**
 * Input Contract:
 * - imo: empty ("", null, undefined) → return []
 */
export function getDetentionHistory(
  db: Database.Database,
  imo: string
): PscRecord[] {
  if (!imo) return [];

  const rows = db
    .prepare<
      [string],
      {
        id: string;
        imo: string;
        inspection_date: string;
        port: string | null;
        authority: 'paris-mou' | 'tokyo-mou' | 'uscg' | 'other';
        deficiencies: number;
        detained: number;
        source_url: string | null;
      }
    >(
      `SELECT id, imo, inspection_date, port, authority, deficiencies, detained, source_url
       FROM psc_detention_history
       WHERE imo = ?
       ORDER BY inspection_date DESC`
    )
    .all(imo);

  return rows.map((row) => ({
    ...row,
    detained: row.detained === 1,
  }));
}

/**
 * Input Contract:
 * - record.id, record.imo: empty → DB NOT NULL error
 * - record.deficiencies: NaN/Infinity → guard with Number.isFinite, default to 0
 * - record.deficiencies: negative → store as-is (no CHECK)
 * - record.authority: invalid → DB CHECK constraint error
 */
export function upsertInspection(
  db: Database.Database,
  record: PscRecord
): void {
  // Guard against NaN/Infinity and negative deficiencies
  const safeDeficiencies = Number.isFinite(record.deficiencies)
    ? Math.max(0, record.deficiencies)
    : 0;

  db.prepare(
    `INSERT INTO psc_detention_history (id, imo, inspection_date, port, authority, deficiencies, detained, source_url)
     VALUES (@id, @imo, @inspection_date, @port, @authority, @deficiencies, @detained, @source_url)
     ON CONFLICT(id) DO UPDATE SET
       imo = excluded.imo,
       inspection_date = excluded.inspection_date,
       port = excluded.port,
       authority = excluded.authority,
       deficiencies = excluded.deficiencies,
       detained = excluded.detained,
       source_url = excluded.source_url`
  ).run({
    id: record.id,
    imo: record.imo,
    inspection_date: record.inspection_date,
    port: record.port,
    authority: record.authority,
    deficiencies: safeDeficiencies,
    detained: record.detained ? 1 : 0,
    source_url: record.source_url,
  });
}

/**
 * Input Contract:
 * - imo: empty ("", null, undefined) → return 0
 * - sinceDate: empty ("", null, undefined) → return 0
 * - sinceDate: invalid format → SQL comparison fails gracefully, return 0
 */
export function getDetentionCount(
  db: Database.Database,
  imo: string,
  sinceDate: string
): number {
  if (!imo || !sinceDate) return 0;

  const row = db
    .prepare<[string, string], { count: number }>(
      `SELECT COUNT(*) as count
       FROM psc_detention_history
       WHERE imo = ? AND inspection_date >= ? AND detained = 1`
    )
    .get(imo, sinceDate);

  return row?.count ?? 0;
}
