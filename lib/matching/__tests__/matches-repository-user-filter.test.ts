/**
 * RED tests — user_id scoping for listMatches (N1 bug fix)
 *
 * Covers:
 *   - listMatches(db, { user_id }) returns only that user's matches
 *   - listMatches without user_id returns all matches (backward compat)
 *   - user_id = null rows are excluded when filtering by a specific user_id
 *   - Boundary Class 1 (Empty): no matches for user → empty array
 *   - Boundary Class 10 (Cleanroom): no implementation read
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  return db;
}

describe('listMatches — user_id filter', () => {
  it('returns only matches belonging to the given user_id', () => {
    const db = freshDb();
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'fit', user_id: 'session-A' });
    createMatch(db, { cargo_id: 'c2', vessel_id: 'v2', score: 70, reason: 'fit', user_id: 'session-B' });
    createMatch(db, { cargo_id: 'c3', vessel_id: 'v3', score: 60, reason: 'fit', user_id: null });

    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', user_id: 'session-A' });

    expect(results).toHaveLength(1);
    expect(results[0].cargo_id).toBe('c1');
    expect(results[0].user_id).toBe('session-A');
  });

  it('returns empty array when no matches exist for the given user_id', () => {
    const db = freshDb();
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'fit', user_id: 'session-B' });

    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', user_id: 'session-A' });

    expect(results).toHaveLength(0);
  });

  it('returns all matches when user_id is not provided (backward compat)', () => {
    const db = freshDb();
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 80, reason: 'fit', user_id: 'session-A' });
    createMatch(db, { cargo_id: 'c2', vessel_id: 'v2', score: 70, reason: 'fit', user_id: 'session-B' });

    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc' });

    expect(results).toHaveLength(2);
  });

  it('excludes null user_id rows when filtering by a specific session', () => {
    const db = freshDb();
    createMatch(db, { cargo_id: 'c1', vessel_id: 'v1', score: 90, reason: 'fit', user_id: null });
    createMatch(db, { cargo_id: 'c2', vessel_id: 'v2', score: 80, reason: 'fit', user_id: 'session-A' });

    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', user_id: 'session-A' });

    expect(results).toHaveLength(1);
    expect(results[0].cargo_id).toBe('c2');
  });
});
