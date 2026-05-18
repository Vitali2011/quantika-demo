/**
 * RED tests — migration 032 (matches table).
 *
 * Covers:
 *   - up() creates the matches table with all required columns
 *   - up() creates all three indexes
 *   - up() enforces the status CHECK constraint
 *   - up() is idempotent (IF NOT EXISTS)
 *   - down() drops the table and indexes cleanly
 *   - Boundary Class 1 (Empty): NULL user_id accepted
 *   - Boundary Class 3 (Negative): score=0 and score=100 are valid
 *   - Boundary Class 5 (Switch/dispatch): all four valid status values insert OK
 */

import Database from 'better-sqlite3';
import migration032 from '../032-matches';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  return db;
}

const VALID_STATUSES = ['shortlist', 'saved', 'dismissed', 'archived'] as const;

describe('migration 032 — matches table', () => {
  // --- up() structure ---

  it('creates matches table with all required columns', () => {
    const db = freshDb();
    // Inserting a full valid row must not throw
    db.prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('cargo-1', 'vessel-1', 80, '{"a":1}', 'shortlist', 'user-1', Date.now(), Date.now());

    const row = db
      .prepare(`SELECT * FROM matches WHERE cargo_id = ?`)
      .get('cargo-1') as Record<string, unknown>;

    expect(row.id).toBeDefined();
    expect(row.cargo_id).toBe('cargo-1');
    expect(row.vessel_id).toBe('vessel-1');
    expect(row.score).toBe(80);
    expect(row.reason).toBe('{"a":1}');
    expect(row.status).toBe('shortlist');
    expect(row.user_id).toBe('user-1');
  });

  it('auto-increments the primary key', () => {
    const db = freshDb();
    const ins = db.prepare(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    ins.run('c1', 'v1', 50, '{}', 'shortlist', 1000, 1000);
    ins.run('c2', 'v2', 60, '{}', 'saved', 2000, 2000);
    const rows = db.prepare('SELECT id FROM matches ORDER BY id').all() as { id: number }[];
    expect(rows[0].id).toBe(1);
    expect(rows[1].id).toBe(2);
  });

  // --- Boundary Class 1: NULL user_id ---

  it('accepts NULL user_id (nullable column)', () => {
    const db = freshDb();
    expect(() =>
      db.prepare(
        `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('c1', 'v1', 50, '{}', 'shortlist', null, 1000, 1000)
    ).not.toThrow();

    const row = db
      .prepare('SELECT user_id FROM matches LIMIT 1')
      .get() as { user_id: string | null };
    expect(row.user_id).toBeNull();
  });

  // --- Boundary Class 3: score boundaries ---

  it('accepts score=0 (lower boundary)', () => {
    const db = freshDb();
    expect(() =>
      db.prepare(
        `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('c1', 'v1', 0, '{}', 'shortlist', 1000, 1000)
    ).not.toThrow();
  });

  it('accepts score=100 (upper boundary)', () => {
    const db = freshDb();
    expect(() =>
      db.prepare(
        `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('c1', 'v1', 100, '{}', 'shortlist', 1000, 1000)
    ).not.toThrow();
  });

  // --- Boundary Class 5: all valid status enum values ---

  it.each(VALID_STATUSES)(
    'accepts status="%s" (valid enum)',
    (status) => {
      const db = freshDb();
      expect(() =>
        db.prepare(
          `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run('c1', 'v1', 50, '{}', status, 1000, 1000)
      ).not.toThrow();
    }
  );

  it('rejects invalid status value (CHECK constraint)', () => {
    const db = freshDb();
    expect(() =>
      db.prepare(
        `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('c1', 'v1', 50, '{}', 'unknown', 1000, 1000)
    ).toThrow();
  });

  it('rejects empty string status (not in CHECK list)', () => {
    const db = freshDb();
    expect(() =>
      db.prepare(
        `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('c1', 'v1', 50, '{}', '', 1000, 1000)
    ).toThrow();
  });

  // --- indexes exist ---

  it('creates idx_matches_status_created index', () => {
    const db = freshDb();
    const idx = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_matches_status_created'`
      )
      .get() as { name: string } | undefined;
    expect(idx).toBeDefined();
    expect(idx!.name).toBe('idx_matches_status_created');
  });

  it('creates idx_matches_cargo index', () => {
    const db = freshDb();
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_matches_cargo'`)
      .get() as { name: string } | undefined;
    expect(idx).toBeDefined();
  });

  it('creates idx_matches_vessel index', () => {
    const db = freshDb();
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_matches_vessel'`)
      .get() as { name: string } | undefined;
    expect(idx).toBeDefined();
  });

  // --- idempotency ---

  it('up() is idempotent — running twice does not throw', () => {
    const db = new Database(':memory:');
    expect(() => migration032.up(db)).not.toThrow();
    expect(() => migration032.up(db)).not.toThrow();
  });

  // --- down() ---

  it('down() drops the matches table', () => {
    const db = freshDb();
    migration032.down(db);
    const tbl = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='matches'`)
      .get();
    expect(tbl).toBeUndefined();
  });

  it('down() drops all three indexes', () => {
    const db = freshDb();
    migration032.down(db);
    const indexes = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index'
         AND name IN ('idx_matches_status_created','idx_matches_cargo','idx_matches_vessel')`
      )
      .all();
    expect(indexes).toHaveLength(0);
  });

  it('down() is idempotent — running twice does not throw', () => {
    const db = freshDb();
    expect(() => migration032.down(db)).not.toThrow();
    expect(() => migration032.down(db)).not.toThrow();
  });

  // --- migration metadata ---

  it('has version=32', () => {
    expect(migration032.version).toBe(32);
  });

  it('has name="matches"', () => {
    expect(migration032.name).toBe('matches');
  });
});
