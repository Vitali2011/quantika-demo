/**
 * RED tests — deleteOrphanSessionMatches (DEMO_MODE bloat cleanup, approach B)
 *
 * In DEMO_MODE every login renders /dashboard + /matches, which call
 * persistSessionMatches — writing a per-session COPY of every seeded match
 * (user_id = sessionId) into the served demo-seed.db. Those copies are correct
 * for session isolation but nothing removes them when the session ends, so the
 * matches table grows by ~436 rows per login forever.
 *
 * deleteOrphanSessionMatches prunes copies whose session no longer exists in
 * the `sessions` table, bounding the table to live sessions and (on the first
 * post-deploy logins) wiping the accumulated prod bloat.
 *
 * Invariants under test:
 *   - Seeded snapshot rows (user_id IS NULL) are NEVER deleted.
 *   - Copies of LIVE sessions (a `sessions` row exists) are preserved.
 *   - Copies of DEAD sessions (no `sessions` row) are deleted.
 *   - Returns the number of rows deleted.
 *   - Boundary Class 1 (Empty): no orphans → 0 deleted, nothing touched.
 *   - Boundary Class 10 (Cleanroom): no implementation read.
 */

import Database from 'better-sqlite3';
import migration001 from '@/lib/migrations/001-initial-sessions';
import migration032 from '@/lib/migrations/032-matches';
import { createMatch, deleteOrphanSessionMatches } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration001.up(db); // sessions
  migration032.up(db); // matches
  return db;
}

function insertSession(db: Database.Database, id: string): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, access_token, created_at, expires_at, data) VALUES (?, ?, ?, ?, ?)',
  ).run(id, 'demo-seed', now, now + 3_600_000, '{}');
}

function countMatches(db: Database.Database, where = ''): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM matches ${where}`).get() as { n: number };
  return row.n;
}

describe('deleteOrphanSessionMatches', () => {
  it('deletes copies whose session no longer exists and returns the count', () => {
    const db = freshDb();
    insertSession(db, 'live-A');
    // seeded snapshot row (authoritative — must survive)
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'seed', user_id: null });
    // live session copy (session still exists — must survive)
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'copy', user_id: 'live-A' });
    // dead session copies (no `sessions` row — must be pruned)
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'copy', user_id: 'dead-B' });
    createMatch(db, { cargo_id: 'c2', vessel_id: 'v2', score: 70, reason: 'copy', user_id: 'dead-B' });

    const deleted = deleteOrphanSessionMatches(db);

    expect(deleted).toBe(2);
    expect(countMatches(db, "WHERE user_id = 'dead-B'")).toBe(0); // orphan pruned
    expect(countMatches(db, "WHERE user_id = 'live-A'")).toBe(1); // live session preserved
    expect(countMatches(db, 'WHERE user_id IS NULL')).toBe(1);    // seed preserved
    db.close();
  });

  it('never deletes seeded snapshot rows (user_id IS NULL), even with no live sessions', () => {
    const db = freshDb();
    // no sessions at all → every non-NULL copy is an orphan
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'seed', user_id: null });
    createMatch(db, { cargo_id: 'c2', vessel_id: 'v2', score: 77, reason: 'seed', user_id: null });
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'copy', user_id: 'gone' });

    const deleted = deleteOrphanSessionMatches(db);

    expect(deleted).toBe(1);
    expect(countMatches(db, 'WHERE user_id IS NULL')).toBe(2);
    expect(countMatches(db)).toBe(2);
    db.close();
  });

  it('is a no-op when there are no orphan copies (returns 0)', () => {
    const db = freshDb();
    insertSession(db, 'live-A');
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'seed', user_id: null });
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 88, reason: 'copy', user_id: 'live-A' });

    const deleted = deleteOrphanSessionMatches(db);

    expect(deleted).toBe(0);
    expect(countMatches(db)).toBe(2);
    db.close();
  });

  it('prunes copies from many dead logins in one call (no unbounded accumulation)', () => {
    const db = freshDb();
    // 4 seeded snapshot rows
    for (let i = 0; i < 4; i++) {
      createMatch(db, { cargo_id: `c${i}`, vessel_id: `v${i}`, score: 80, reason: 'seed', user_id: null });
    }
    // 3 past logins each left 4 copies = 12 orphans
    for (const sess of ['gone-1', 'gone-2', 'gone-3']) {
      for (let i = 0; i < 4; i++) {
        createMatch(db, { cargo_id: `c${i}`, vessel_id: `v${i}`, score: 80, reason: 'copy', user_id: sess });
      }
    }
    expect(countMatches(db)).toBe(16);

    const deleted = deleteOrphanSessionMatches(db);

    expect(deleted).toBe(12);
    expect(countMatches(db)).toBe(4);                              // only the seeded snapshot remains
    expect(countMatches(db, 'WHERE user_id IS NOT NULL')).toBe(0); // zero accumulation
    db.close();
  });
});
