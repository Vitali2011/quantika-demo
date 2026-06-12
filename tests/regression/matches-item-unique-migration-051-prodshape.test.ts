/**
 * test-skill wave-c review — migration 051 data-contract on a PROD-SHAPED DB.
 * Branch: feat/wave-c-engine-logic · HEAD: 13029428
 *
 * Prod DBs (sessions.db / demo-seed.db) sit at migration 050 with real rows:
 * item indices all 0 (044 DEFAULT), seed rows user_id=NULL, sentinel buckets,
 * per-session UUID copies. 051 must upgrade IN PLACE: drop the coarse unique
 * index, add the item-aware one, lose no rows, and flip the second-item
 * insert from silently-ignored to persisted. down() must dedup before
 * re-tightening. This exercises the exact runner path prod deploy uses
 * (runMigrations applies only pending versions).
 */
import Database from 'better-sqlite3';
import { runMigrations, getAppliedVersions } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import migration051 from '@/lib/migrations/051-matches-item-unique';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';

type IndexRow = { name: string; unique: number };

function indexNames(db: Database.Database): Map<string, number> {
  const rows = db.prepare(`PRAGMA index_list('matches')`).all() as IndexRow[];
  return new Map(rows.map((r) => [r.name, r.unique]));
}

function prodShapedDbAt050(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations.filter((m) => m.version <= 50));
  return db;
}

const pair = { cargo_id: 'c-email-1', vessel_id: 'v-email-1', score: 70, reason: 'r' };

describe('migration 051 on a prod-shaped DB (050 + data)', () => {
  it('upgrades in place: index swap, zero data loss, second item row unlocked', () => {
    const db = prodShapedDbAt050();

    // Prod-like rows under the COARSE index: seed (NULL user), session, sentinel.
    createMatch(db, { ...pair, user_id: null });
    createMatch(db, { ...pair, user_id: 'sess-uuid-1' });
    createMatch(db, { ...pair, user_id: '__demo_review__' });

    // Pre-051 symptom: a second ITEM of the same email pair is silently ignored.
    createMatch(db, { ...pair, user_id: 'sess-uuid-1', cargo_item_index: 1 });
    expect(listMatches(db, { user_id: 'sess-uuid-1', sortBy: 'score', sortDir: 'desc' })).toHaveLength(1);
    expect(indexNames(db).get('idx_matches_unique_cargo_vessel_user')).toBe(1);

    const before = db.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number };

    // Deploy step: runner applies ONLY pending 051.
    runMigrations(db, allMigrations);
    expect(getAppliedVersions(db)).toContain(51);

    const idx = indexNames(db);
    expect(idx.has('idx_matches_unique_cargo_vessel_user')).toBe(false);
    expect(idx.get('idx_matches_unique_pair_item')).toBe(1); // unique

    const after = db.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number };
    expect(after.n).toBe(before.n); // zero data loss

    // Post-051: the second item persists; the same item pair still dedups.
    createMatch(db, { ...pair, user_id: 'sess-uuid-1', cargo_item_index: 1 });
    createMatch(db, { ...pair, user_id: 'sess-uuid-1', cargo_item_index: 1 });
    const rows = listMatches(db, { user_id: 'sess-uuid-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cargo_item_index).sort()).toEqual([0, 1]);

    // NULL-user seed rows still unique per item pair (COALESCE branch of the index).
    createMatch(db, { ...pair, user_id: null });
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM matches WHERE user_id IS NULL`).get() as { n: number }).n,
    ).toBe(1);
  });

  it('down() dedups to MIN(rowid) per coarse key before re-tightening', () => {
    const db = prodShapedDbAt050();
    runMigrations(db, allMigrations);
    createMatch(db, { ...pair, user_id: 'sess-1', cargo_item_index: 0, fit_percent: 80 });
    createMatch(db, { ...pair, user_id: 'sess-1', cargo_item_index: 1, fit_percent: 75 });

    migration051.down(db);

    const rows = db.prepare(`SELECT cargo_item_index FROM matches WHERE user_id = 'sess-1'`).all() as Array<{
      cargo_item_index: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].cargo_item_index).toBe(0); // earliest row survives (mirrors 034)
    expect(indexNames(db).get('idx_matches_unique_cargo_vessel_user')).toBe(1);
  });
});
