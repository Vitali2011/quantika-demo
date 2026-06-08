/**
 * Tests — migration 045: matches worksheet_json column
 * TDD: migration idempotency + NULL default for existing rows
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '../lib/migrations/runner';
import { allMigrations } from '../lib/migrations';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  return db;
}

describe('migration 045 — worksheet_json column', () => {
  it('applies idempotently: column exists after runMigrations twice', () => {
    const db = makeDb();
    runMigrations(db, allMigrations);
    runMigrations(db, allMigrations);
    const cols = (db.prepare('PRAGMA table_info(matches)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('worksheet_json');
  });

  it('existing rows receive NULL for worksheet_json after migration', () => {
    const db = makeDb();
    runMigrations(db, allMigrations.slice(0, 44));
    db.exec(
      `INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at)
       VALUES ('c1', 'v1', 80, 'test', 'shortlist', NULL, 0, 0)`,
    );
    runMigrations(db, allMigrations);
    const row = db.prepare('SELECT worksheet_json FROM matches WHERE cargo_id = ?').get('c1') as { worksheet_json: string | null };
    expect(row.worksheet_json).toBeNull();
  });

  it('migration 046 (consumption-estimated) and 047 (ballast-distance) both in allMigrations; 047 is last', () => {
    const m46 = allMigrations.find((m) => m.version === 46);
    expect(m46?.name).toBe('matches-consumption-estimated');
    const last = allMigrations[allMigrations.length - 1];
    expect(last.version).toBe(47);
    expect(last.name).toBe('matches-ballast-distance');
  });
});
