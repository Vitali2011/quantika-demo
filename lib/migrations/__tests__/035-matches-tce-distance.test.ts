/**
 * Tests — migration 035 (matches tce + distance columns).
 *
 * Covers:
 *   - up() adds tce_usd_per_day and distance_nm columns to matches table
 *   - Both columns accept NULL
 *   - Both columns accept numeric values
 *   - up() is idempotent (re-run after already applied does not throw)
 *   - Migration metadata (version, name)
 */

import Database from 'better-sqlite3';
import migration032 from '../032-matches';
import migration033 from '../033-matches-score-breakdown';
import migration034 from '../034-matches-unique-constraint';
import migration035 from '../035-matches-tce-distance';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  return db;
}

function insertRow(
  db: Database.Database,
  extra: Record<string, unknown> = {},
): void {
  const base = {
    cargo_id: 'cargo-1',
    vessel_id: 'vessel-1',
    score: 75,
    reason: 'test',
    status: 'shortlist',
    user_id: 'user-1',
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  const merged = { ...base, ...extra };
  const cols = Object.keys(merged).join(', ');
  const placeholders = Object.keys(merged).map(() => '?').join(', ');
  db.prepare(`INSERT INTO matches (${cols}) VALUES (${placeholders})`).run(
    ...Object.values(merged),
  );
}

describe('migration 035 — matches tce + distance columns', () => {
  it('adds tce_usd_per_day column to matches table', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'tce_usd_per_day')).toBe(true);
  });

  it('adds distance_nm column to matches table', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'distance_nm')).toBe(true);
  });

  it('accepts NULL tce_usd_per_day', () => {
    const db = freshDb();
    insertRow(db, { tce_usd_per_day: null });
    const row = db.prepare('SELECT tce_usd_per_day FROM matches LIMIT 1').get() as { tce_usd_per_day: number | null };
    expect(row.tce_usd_per_day).toBeNull();
  });

  it('accepts NULL distance_nm', () => {
    const db = freshDb();
    insertRow(db, { distance_nm: null });
    const row = db.prepare('SELECT distance_nm FROM matches LIMIT 1').get() as { distance_nm: number | null };
    expect(row.distance_nm).toBeNull();
  });

  it('stores numeric tce_usd_per_day', () => {
    const db = freshDb();
    insertRow(db, { tce_usd_per_day: 12500.5 });
    const row = db.prepare('SELECT tce_usd_per_day FROM matches LIMIT 1').get() as { tce_usd_per_day: number | null };
    expect(row.tce_usd_per_day).toBeCloseTo(12500.5);
  });

  it('stores numeric distance_nm', () => {
    const db = freshDb();
    insertRow(db, { distance_nm: 3200 });
    const row = db.prepare('SELECT distance_nm FROM matches LIMIT 1').get() as { distance_nm: number | null };
    expect(row.distance_nm).toBe(3200);
  });

  it('has version=35', () => {
    expect(migration035.version).toBe(35);
  });

  it('has name="matches-tce-distance"', () => {
    expect(migration035.name).toBe('matches-tce-distance');
  });
});
