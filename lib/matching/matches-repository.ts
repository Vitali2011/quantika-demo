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
}

export interface CreateMatchInput {
  cargo_id: string;
  vessel_id: string;
  score: number;
  reason: string;
  status?: MatchStatus;
  user_id?: string | null;
}

export interface ListMatchesOptions {
  status?: MatchStatus;
  sortBy: 'score' | 'created_at';
  sortDir: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  shortlist: ['saved', 'dismissed', 'archived'],
  saved: ['archived', 'dismissed'],
  dismissed: ['archived', 'saved'],
  archived: ['saved'],
};

export function createMatch(db: Database.Database, input: CreateMatchInput): StoredMatch {
  const now = Date.now();
  const status: MatchStatus = input.status ?? 'shortlist';
  const user_id = input.user_id !== undefined ? input.user_id : null;

  const stmt = db.prepare(
    `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(input.cargo_id, input.vessel_id, input.score, input.reason, status, user_id, now, now);
  const id = result.lastInsertRowid as number;

  return getMatch(db, id) as StoredMatch;
}

export function getMatch(db: Database.Database, id: number): StoredMatch | null {
  const row = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as StoredMatch | undefined;
  return row ?? null;
}

export function listMatches(db: Database.Database, opts: ListMatchesOptions): StoredMatch[] {
  const { status, sortBy, sortDir, limit, offset } = opts;

  const allowedSortBy = sortBy === 'created_at' ? 'created_at' : 'score';
  const allowedSortDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  let query = `SELECT * FROM matches`;
  const params: unknown[] = [];

  if (status) {
    query += ` WHERE status = ?`;
    params.push(status);
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
