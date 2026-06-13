/**
 * Regression test for FIX 2: seedTmiWithDb must NOT throw when called on a DB
 * that lacks the `demo_seed_meta` table (e.g. a fresh DB with only market_indices).
 *
 * Before the fix, getFrozenDate() would throw:
 *   SqliteError: no such table: demo_seed_meta
 */
import Database from 'better-sqlite3';
import { seedTmiWithDb } from '../../scripts/demo-seed/seed-tmi';

function makeDbWithoutMeta(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE market_indices (
      id          TEXT PRIMARY KEY NOT NULL,
      index_name  TEXT NOT NULL,
      index_date  TEXT NOT NULL,
      value       REAL NOT NULL,
      unit        TEXT NOT NULL DEFAULT 'USD/day',
      source      TEXT NOT NULL,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(index_name, index_date)
    );
  `);
  // NOTE: demo_seed_meta intentionally NOT created
  return db;
}

describe('seedTmiWithDb — no demo_seed_meta table (FIX 2 regression)', () => {
  it('does not throw when demo_seed_meta table is absent', () => {
    const db = makeDbWithoutMeta();
    expect(() => seedTmiWithDb(db, 5)).not.toThrow();
    db.close();
  });

  it('writes tmi rows when demo_seed_meta is absent', () => {
    const db = makeDbWithoutMeta();
    const { upserted } = seedTmiWithDb(db, 5);
    expect(upserted).toBe(5);

    const count = (
      db.prepare(`SELECT COUNT(*) AS c FROM market_indices WHERE index_name='tmi'`).get() as { c: number }
    ).c;
    expect(count).toBe(5);
    db.close();
  });
});
