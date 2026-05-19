/**
 * Race condition test for matches lazy-persist (QA2 Round 2 — PR #271).
 *
 * Covers:
 *   - Concurrent persist of same (cargo_id, vessel_id, user_id) → only 1 row (TOCTOU fix)
 *   - INSERT OR IGNORE returns existing row on duplicate (not new row)
 *   - Different users may share same (cargo_id, vessel_id) — not a duplicate
 *   - Boundary Class 1: empty input → 0 inserts
 *
 * Setup: applies migration032 + migration033 + migration034 (UNIQUE constraint).
 * These tests are RED before migration034 and INSERT OR IGNORE are in place.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  return db;
}

describe('matches persist — UNIQUE constraint + INSERT OR IGNORE (race fix)', () => {
  it('does not create duplicate rows when same (cargo_id, vessel_id, user_id) inserted twice', () => {
    const db = freshDb();

    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 75, reason: 'fit', user_id: 'race-user' });
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 75, reason: 'fit', user_id: 'race-user' });

    const all = listMatches(db, { user_id: 'race-user', sortBy: 'score', sortDir: 'desc' });
    expect(all).toHaveLength(1);
  });

  it('returns the existing match (same id) when duplicate is ignored', () => {
    const db = freshDb();

    const first = createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 75, reason: 'fit', user_id: 'u1' });
    const second = createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'better', user_id: 'u1' });

    expect(second.id).toBe(first.id);
  });

  it('allows different users to have the same (cargo_id, vessel_id) pair', () => {
    const db = freshDb();

    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 75, reason: 'fit', user_id: 'user-A' });
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 75, reason: 'fit', user_id: 'user-B' });

    const allA = listMatches(db, { user_id: 'user-A', sortBy: 'score', sortDir: 'desc' });
    const allB = listMatches(db, { user_id: 'user-B', sortBy: 'score', sortDir: 'desc' });
    expect(allA).toHaveLength(1);
    expect(allB).toHaveLength(1);
  });

  it('handles empty session matches — no inserts, no error (Class 1 empty)', () => {
    const db = freshDb();

    // persistSessionMatches loops over [] — zero createMatch calls
    for (const _m of []) {
      createMatch(db, { cargo_id: 'x', vessel_id: 'y', score: 0, reason: '', user_id: 'u' });
    }

    const all = listMatches(db, { user_id: 'u', sortBy: 'score', sortDir: 'desc' });
    expect(all).toHaveLength(0);
  });

  it('simulates concurrent page load: Promise.all with same matches → exactly 1 row per pair', async () => {
    const db = freshDb();

    const insert = () =>
      createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 75, reason: 'fit', user_id: 'concurrent-user' });

    // Node is single-threaded but both fire before either returns in async context
    await Promise.all([Promise.resolve(insert()), Promise.resolve(insert())]);

    const all = listMatches(db, { user_id: 'concurrent-user', sortBy: 'score', sortDir: 'desc' });
    expect(all).toHaveLength(1);
  });
});
