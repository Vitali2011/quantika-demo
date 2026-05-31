/**
 * Tests — migration 042 (fit_percent + fit_breakdown columns).
 *
 * Covers:
 *   - up() adds fit_percent column
 *   - up() adds fit_breakdown column
 *   - Both columns accept NULL
 *   - fit_percent accepts REAL values
 *   - fit_breakdown accepts JSON text
 *   - up() is idempotent (re-run does not throw)
 *   - Migration metadata (version, name)
 */

import Database from 'better-sqlite3';
import migration032 from '../032-matches';
import migration033 from '../033-matches-score-breakdown';
import migration034 from '../034-matches-unique-constraint';
import migration035 from '../035-matches-tce-distance';
import migration036 from '../036-matches-freight-rate';
import migration041 from '../041-matches-vessel-name';
import migration042 from '../042-matches-fit';

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

describe('migration 042 — fit_percent + fit_breakdown columns', () => {
  it('adds fit_percent column', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'fit_percent')).toBe(true);
  });

  it('adds fit_breakdown column', () => {
    const db = freshDb();
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'fit_breakdown')).toBe(true);
  });

  it('accepts NULL fit_percent', () => {
    const db = freshDb();
    insertRow(db, { fit_percent: null });
    const row = db.prepare('SELECT fit_percent FROM matches LIMIT 1').get() as { fit_percent: number | null };
    expect(row.fit_percent).toBeNull();
  });

  it('accepts NULL fit_breakdown', () => {
    const db = freshDb();
    insertRow(db, { fit_breakdown: null });
    const row = db.prepare('SELECT fit_breakdown FROM matches LIMIT 1').get() as { fit_breakdown: string | null };
    expect(row.fit_breakdown).toBeNull();
  });

  it('stores fit_percent real value', () => {
    const db = freshDb();
    insertRow(db, { fit_percent: 78.5 });
    const row = db.prepare('SELECT fit_percent FROM matches LIMIT 1').get() as { fit_percent: number | null };
    expect(row.fit_percent).toBeCloseTo(78.5);
  });

  it('stores fit_breakdown JSON text', () => {
    const db = freshDb();
    const fb = JSON.stringify({ components: [{ factor: 'utilisation', label: 'Size / utilisation', weight: 25, score: 20, rationale: 'test' }] });
    insertRow(db, { fit_breakdown: fb });
    const row = db.prepare('SELECT fit_breakdown FROM matches LIMIT 1').get() as { fit_breakdown: string | null };
    expect(row.fit_breakdown).toBe(fb);
    const parsed = JSON.parse(row.fit_breakdown!);
    expect(parsed.components[0].factor).toBe('utilisation');
  });

  it('is idempotent — re-running up() does not throw', () => {
    const db = new Database(':memory:');
    migration032.up(db);
    migration033.up(db);
    migration034.up(db);
    migration035.up(db);
    migration036.up(db);
    migration041.up(db);
    migration042.up(db);
    expect(() => migration042.up(db)).not.toThrow();
  });

  it('has version=42', () => {
    expect(migration042.version).toBe(42);
  });

  it('has name="matches-fit"', () => {
    expect(migration042.name).toBe('matches-fit');
  });
});
