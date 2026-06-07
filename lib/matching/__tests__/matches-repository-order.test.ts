/**
 * TDD test — default DB sort is fit_percent DESC (Task 5: ranking → fitPercent)
 *
 * Inserts 3 rows where score order and fit_percent order diverge, then asserts
 * that listMatches with the default sortBy returns them in fit_percent DESC order.
 *
 * Class 10 (Cleanroom): written before implementation changes.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { listMatches, createMatch } from '@/lib/matching/matches-repository';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  return db;
}

describe('listMatches — default sort is fit_percent DESC', () => {
  it('returns rows ordered by fit_percent descending when sortBy=fit_percent', () => {
    const db = freshDb();
    const uid = 'user-order-test';

    // Insert 3 rows: score and fit_percent intentionally diverge so we can
    // distinguish between "sorted by score" and "sorted by fit_percent".
    // score order: 90 > 70 > 50
    // fit_percent order: 90 > 70 > 50  (cargo-B highest, cargo-C lowest)
    createMatch(db, { cargo_id: 'cargo-A', vessel_id: 'v1', score: 90, reason: '{}', user_id: uid, fit_percent: 50 });
    createMatch(db, { cargo_id: 'cargo-B', vessel_id: 'v2', score: 50, reason: '{}', user_id: uid, fit_percent: 90 });
    createMatch(db, { cargo_id: 'cargo-C', vessel_id: 'v3', score: 70, reason: '{}', user_id: uid, fit_percent: 70 });

    const rows = listMatches(db, { user_id: uid, sortBy: 'fit_percent', sortDir: 'desc' });

    expect(rows).toHaveLength(3);
    // First row must have highest fit_percent (90), not highest score (90 belongs to cargo-A)
    expect(rows[0].fit_percent).toBe(90);
    expect(rows[0].cargo_id).toBe('cargo-B');
    expect(rows[1].fit_percent).toBe(70);
    expect(rows[1].cargo_id).toBe('cargo-C');
    expect(rows[2].fit_percent).toBe(50);
    expect(rows[2].cargo_id).toBe('cargo-A');
  });

  it('fit_percent nulls sort last when ordering by fit_percent desc', () => {
    const db = freshDb();
    const uid = 'user-null-test';

    createMatch(db, { cargo_id: 'cargo-X', vessel_id: 'v1', score: 80, reason: '{}', user_id: uid, fit_percent: 75 });
    createMatch(db, { cargo_id: 'cargo-Y', vessel_id: 'v2', score: 95, reason: '{}', user_id: uid, fit_percent: null });

    const rows = listMatches(db, { user_id: uid, sortBy: 'fit_percent', sortDir: 'desc' });

    expect(rows).toHaveLength(2);
    // Row with actual fit_percent (75) comes first; null sorts last
    expect(rows[0].cargo_id).toBe('cargo-X');
    expect(rows[1].cargo_id).toBe('cargo-Y');
  });

  it('score sortBy still works correctly', () => {
    const db = freshDb();
    const uid = 'user-score-test';

    createMatch(db, { cargo_id: 'cargo-P', vessel_id: 'v1', score: 60, reason: '{}', user_id: uid, fit_percent: 80 });
    createMatch(db, { cargo_id: 'cargo-Q', vessel_id: 'v2', score: 85, reason: '{}', user_id: uid, fit_percent: 40 });

    const rows = listMatches(db, { user_id: uid, sortBy: 'score', sortDir: 'desc' });

    expect(rows).toHaveLength(2);
    // Score order: 85 > 60, so cargo-Q first
    expect(rows[0].cargo_id).toBe('cargo-Q');
    expect(rows[1].cargo_id).toBe('cargo-P');
  });
});
