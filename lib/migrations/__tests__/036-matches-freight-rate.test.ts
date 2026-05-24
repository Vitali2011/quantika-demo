/**
 * Tests — migration 036 (freight_rate_usd_per_mt + freight_rate_source columns).
 *
 * Covers:
 *   - up() adds both columns to matches table
 *   - Both columns accept NULL
 *   - Both columns accept non-null values
 *   - up() is idempotent (re-run after already applied does not throw)
 *   - Migration metadata (version, name)
 */

import Database from 'better-sqlite3';
import migration032 from '../032-matches';
import migration033 from '../033-matches-score-breakdown';
import migration034 from '../034-matches-unique-constraint';
import migration035 from '../035-matches-tce-distance';
import migration036 from '../036-matches-freight-rate';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
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

describe('migration 036 — freight rate columns', () => {
  it('adds freight_rate_usd_per_mt column', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'freight_rate_usd_per_mt')).toBe(true);
  });

  it('adds freight_rate_source column', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'freight_rate_source')).toBe(true);
  });

  it('accepts NULL freight_rate_usd_per_mt', () => {
    const db = freshDb();
    insertRow(db, { freight_rate_usd_per_mt: null });
    const row = db.prepare('SELECT freight_rate_usd_per_mt FROM matches LIMIT 1').get() as { freight_rate_usd_per_mt: number | null };
    expect(row.freight_rate_usd_per_mt).toBeNull();
  });

  it('accepts NULL freight_rate_source', () => {
    const db = freshDb();
    insertRow(db, { freight_rate_source: null });
    const row = db.prepare('SELECT freight_rate_source FROM matches LIMIT 1').get() as { freight_rate_source: string | null };
    expect(row.freight_rate_source).toBeNull();
  });

  it('stores numeric freight_rate_usd_per_mt', () => {
    const db = freshDb();
    insertRow(db, { freight_rate_usd_per_mt: 28.5 });
    const row = db.prepare('SELECT freight_rate_usd_per_mt FROM matches LIMIT 1').get() as { freight_rate_usd_per_mt: number | null };
    expect(row.freight_rate_usd_per_mt).toBeCloseTo(28.5);
  });

  it('stores freight_rate_source text', () => {
    const db = freshDb();
    insertRow(db, { freight_rate_source: 'estimated' });
    const row = db.prepare('SELECT freight_rate_source FROM matches LIMIT 1').get() as { freight_rate_source: string | null };
    expect(row.freight_rate_source).toBe('estimated');
  });

  it('is idempotent — re-running up() does not throw', () => {
    const db = new Database(':memory:');
    migration032.up(db);
    migration033.up(db);
    migration034.up(db);
    migration035.up(db);
    migration036.up(db);
    expect(() => migration036.up(db)).not.toThrow();
  });

  it('has version=36', () => {
    expect(migration036.version).toBe(36);
  });

  it('has name="matches-freight-rate"', () => {
    expect(migration036.name).toBe('matches-freight-rate');
  });
});
