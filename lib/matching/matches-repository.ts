import type Database from 'better-sqlite3';

export type MatchStatus = 'shortlist' | 'saved' | 'dismissed' | 'archived';

export interface StoredMatch {
  id: number;
  cargo_id: string;
  vessel_id: string;
  score: number;
  reason: string;
  status: MatchStatus;
  user_id: string | null;
  created_at: number;
  updated_at: number;
  reason_structured: string | null;
  cargo_type: string | null;
  load_port: string | null;
  discharge_port: string | null;
  laycan_start: number | null;
  laycan_end: number | null;
  vessel_dwt: number | null;
}

export interface CreateMatchInput {
  cargo_id: string;
  vessel_id: string;
  score: number;
  reason: string;
  status?: MatchStatus;
  user_id?: string | null;
  reason_structured?: string | null;
  cargo_type?: string | null;
  load_port?: string | null;
  discharge_port?: string | null;
  laycan_start?: number | null;
  laycan_end?: number | null;
  vessel_dwt?: number | null;
}

export interface ListMatchesOptions {
  status?: MatchStatus;
  sortBy: 'score' | 'created_at';
  sortDir: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  cargo_type?: string[];
  route?: string;
  laycan_from?: number;
  laycan_to?: number;
  score_min?: number;
  dwt_min?: number;
  dwt_max?: number;
  user_id?: string | null;
}

const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  shortlist: ['saved', 'dismissed', 'archived'],
  saved: ['archived', 'dismissed'],
  dismissed: ['archived', 'saved'],
  archived: ['saved'],
};

function hasM3Columns(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'reason_structured');
}

export function createMatch(db: Database.Database, input: CreateMatchInput): StoredMatch {
  const now = Date.now();
  const status: MatchStatus = input.status ?? 'shortlist';
  const user_id = input.user_id !== undefined ? input.user_id : null;

  let result: { lastInsertRowid: number | bigint; changes: number };

  if (hasM3Columns(db)) {
    const reason_structured = input.reason_structured ?? null;
    const cargo_type = input.cargo_type ?? null;
    const load_port = input.load_port ?? null;
    const discharge_port = input.discharge_port ?? null;
    const laycan_start = input.laycan_start ?? null;
    const laycan_end = input.laycan_end ?? null;
    const vessel_dwt = input.vessel_dwt ?? null;

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO matches
         (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
          reason_structured, cargo_type, load_port, discharge_port,
          laycan_start, laycan_end, vessel_dwt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    result = stmt.run(
      input.cargo_id,
      input.vessel_id,
      input.score,
      input.reason,
      status,
      user_id,
      now,
      now,
      reason_structured,
      cargo_type,
      load_port,
      discharge_port,
      laycan_start,
      laycan_end,
      vessel_dwt,
    );
  } else {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    result = stmt.run(input.cargo_id, input.vessel_id, input.score, input.reason, status, user_id, now, now);
  }

  if (result.changes === 0) {
    // Duplicate silently ignored by UNIQUE constraint — return the existing row.
    const existing = db
      .prepare(
        `SELECT * FROM matches
         WHERE cargo_id = ? AND vessel_id = ?
           AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
         LIMIT 1`,
      )
      .get(input.cargo_id, input.vessel_id, user_id, user_id) as StoredMatch | undefined;
    return existing!;
  }

  return getMatch(db, result.lastInsertRowid as number) as StoredMatch;
}

export function getMatch(db: Database.Database, id: number): StoredMatch | null {
  const row = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as StoredMatch | undefined;
  return row ?? null;
}

export function listMatches(db: Database.Database, opts: ListMatchesOptions): StoredMatch[] {
  const { status, sortBy, sortDir, limit, offset } = opts;
  const {
    cargo_type,
    route,
    laycan_from,
    laycan_to,
    score_min,
    dwt_min,
    dwt_max,
    user_id,
  } = opts;

  const allowedSortBy = sortBy === 'created_at' ? 'created_at' : 'score';
  const allowedSortDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }

  if (user_id !== undefined && user_id !== null) {
    conditions.push(`user_id = ?`);
    params.push(user_id);
  }

  if (cargo_type && cargo_type.length > 0) {
    const placeholders = cargo_type.map(() => '?').join(', ');
    conditions.push(`cargo_type IN (${placeholders})`);
    params.push(...cargo_type);
  }

  if (route !== undefined && route !== '') {
    // Escape SQL LIKE metacharacters so user input matches literally.
    // Backslash must be escaped first; ESCAPE '\' tells SQLite to treat
    // \%, \_, \\ as literal characters.
    const escaped = route.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push(
      `(LOWER(load_port) LIKE LOWER(?) ESCAPE '\\' OR LOWER(discharge_port) LIKE LOWER(?) ESCAPE '\\')`
    );
    const pattern = `%${escaped}%`;
    params.push(pattern, pattern);
  }

  if (laycan_from !== undefined) {
    conditions.push(`laycan_end >= ?`);
    params.push(laycan_from);
  }

  if (laycan_to !== undefined) {
    conditions.push(`laycan_start <= ?`);
    params.push(laycan_to);
  }

  if (score_min !== undefined) {
    const effectiveMin = Math.max(0, score_min);
    conditions.push(`score >= ?`);
    params.push(effectiveMin);
  }

  if (dwt_min !== undefined) {
    conditions.push(`vessel_dwt >= ?`);
    params.push(dwt_min);
  }

  if (dwt_max !== undefined) {
    conditions.push(`vessel_dwt <= ?`);
    params.push(dwt_max);
  }

  let query = `SELECT * FROM matches`;
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(` AND `);
  }

  query += ` ORDER BY ${allowedSortBy} ${allowedSortDir}, id ${allowedSortDir}`;

  if (limit !== undefined) {
    query += ` LIMIT ?`;
    params.push(limit);
    if (offset !== undefined) {
      query += ` OFFSET ?`;
      params.push(offset);
    }
  } else if (offset !== undefined) {
    query += ` LIMIT -1 OFFSET ?`;
    params.push(offset);
  }

  return db.prepare(query).all(...params) as StoredMatch[];
}

export function updateMatchStatus(db: Database.Database, id: number, newStatus: MatchStatus): StoredMatch {
  const existing = getMatch(db, id);
  if (!existing) {
    throw new Error(`Match not found: ${id}`);
  }

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid transition: ${existing.status} → ${newStatus}`);
  }

  const now = Date.now();
  db.prepare(`UPDATE matches SET status = ?, updated_at = ? WHERE id = ?`)
    .run(newStatus, now, id);

  return getMatch(db, id) as StoredMatch;
}
