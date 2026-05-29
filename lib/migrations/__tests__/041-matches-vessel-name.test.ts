/**
 * Tests — migration 041 (vessel_name + cargo_ref columns).
 *
 * Covers:
 *   - up() adds vessel_name column to matches
 *   - up() adds cargo_ref column to matches
 *   - Both columns accept NULL
 *   - Both columns accept non-null text values
 *   - up() is idempotent (re-run after already applied does not throw)
 *   - Migration metadata (version, name)
 */

import Database from 'better-sqlite3';
import migration032 from '../032-matches';
import migration033 from '../033-matches-score-breakdown';
import migration034 from '../034-matches-unique-constraint';
import migration035 from '../035-matches-tce-distance';
import migration036 from '../036-matches-freight-rate';
import migration041 from '../041-matches-vessel-name';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
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

describe('migration 041 — vessel_name + cargo_ref columns', () => {
  it('adds vessel_name column', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'vessel_name')).toBe(true);
  });

  it('adds cargo_ref column', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'cargo_ref')).toBe(true);
  });

  it('accepts NULL vessel_name', () => {
    const db = freshDb();
    insertRow(db, { vessel_name: null });
    const row = db.prepare('SELECT vessel_name FROM matches LIMIT 1').get() as { vessel_name: string | null };
    expect(row.vessel_name).toBeNull();
  });

  it('accepts NULL cargo_ref', () => {
    const db = freshDb();
    insertRow(db, { cargo_ref: null });
    const row = db.prepare('SELECT cargo_ref FROM matches LIMIT 1').get() as { cargo_ref: string | null };
    expect(row.cargo_ref).toBeNull();
  });

  it('stores vessel_name text', () => {
    const db = freshDb();
    insertRow(db, { vessel_name: 'MV BARABULKA' });
    const row = db.prepare('SELECT vessel_name FROM matches LIMIT 1').get() as { vessel_name: string | null };
    expect(row.vessel_name).toBe('MV BARABULKA');
  });

  it('stores cargo_ref text', () => {
    const db = freshDb();
    insertRow(db, { cargo_ref: 'Cement in sling bags' });
    const row = db.prepare('SELECT cargo_ref FROM matches LIMIT 1').get() as { cargo_ref: string | null };
    expect(row.cargo_ref).toBe('Cement in sling bags');
  });

  it('is idempotent — re-running up() does not throw', () => {
    const db = new Database(':memory:');
    migration032.up(db);
    migration033.up(db);
    migration034.up(db);
    migration035.up(db);
    migration036.up(db);
    migration041.up(db);
    expect(() => migration041.up(db)).not.toThrow();
  });

  it('has version=41', () => {
    expect(migration041.version).toBe(41);
  });

  it('has name="matches-vessel-name"', () => {
    expect(migration041.name).toBe('matches-vessel-name');
  });
});
