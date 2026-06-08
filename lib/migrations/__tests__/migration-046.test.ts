/**
 * Tests — migration 046 (consumption_estimated column).
 *
 * Covers:
 *   - up() adds consumption_estimated column to matches
 *   - Column accepts NULL
 *   - Column accepts integer values (0, 1)
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
import migration044 from '../044-matches-item-index';
import migration045 from '../045-matches-worksheet';
import migration046 from '../046-matches-consumption-estimated';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  migration044.up(db);
  migration045.up(db);
  migration046.up(db);
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

describe('migration 046 — consumption_estimated column', () => {
  it('adds consumption_estimated column', () => {
    const db = freshDb();
    const cols = db.prepare('PRAGMA table_info(matches)').all() as Array<{name: string}>;
    const names = cols.map(c => c.name);
    expect(names).toContain('consumption_estimated');
  });

  it('accepts NULL consumption_estimated', () => {
    const db = freshDb();
    insertRow(db, { consumption_estimated: null });
    const row = db.prepare('SELECT consumption_estimated FROM matches LIMIT 1').get() as { consumption_estimated: number | null };
    expect(row.consumption_estimated).toBeNull();
  });

  it('accepts integer 1 (true) for consumption_estimated', () => {
    const db = freshDb();
    insertRow(db, { consumption_estimated: 1 });
    const row = db.prepare('SELECT consumption_estimated FROM matches LIMIT 1').get() as { consumption_estimated: number | null };
    expect(row.consumption_estimated).toBe(1);
  });

  it('accepts integer 0 (false) for consumption_estimated', () => {
    const db = freshDb();
    insertRow(db, { consumption_estimated: 0 });
    const row = db.prepare('SELECT consumption_estimated FROM matches LIMIT 1').get() as { consumption_estimated: number | null };
    expect(row.consumption_estimated).toBe(0);
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
    migration044.up(db);
    migration045.up(db);
    migration046.up(db);
    expect(() => migration046.up(db)).not.toThrow();
  });

  it('has version=46', () => {
    expect(migration046.version).toBe(46);
  });

  it('has name="matches-consumption-estimated"', () => {
    expect(migration046.name).toBe('matches-consumption-estimated');
  });
});
