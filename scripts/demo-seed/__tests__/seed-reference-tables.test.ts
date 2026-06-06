/**
 * TDD test for Phase 1: seedReferenceTables(db)
 *
 * Tests:
 * 1. Against a fresh temp DB with migrations applied, all 3 tables are
 *    populated (COUNT > 0) after one call.
 * 2. Calling it twice does not error and counts remain the same (idempotent).
 */
import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from '../../../lib/migrations/runner';
import { allMigrations } from '../../../lib/migrations/index';
import { seedReferenceTables } from '../regenerate-matches';

function makeDb(): { db: Database.Database; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `ref-tables-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new Database(dbPath);
  runMigrations(db, allMigrations);
  return { db, dbPath };
}

describe('seedReferenceTables', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    ({ db, dbPath } = makeDb());
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('populates charterers with > 0 rows', async () => {
    await seedReferenceTables(db);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM charterers').get() as { n: number };
    expect(n).toBeGreaterThan(0);
  });

  it('populates psc_detention_history with > 0 rows', async () => {
    await seedReferenceTables(db);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM psc_detention_history').get() as { n: number };
    expect(n).toBeGreaterThan(0);
  });

  it('populates port_da_estimates with > 0 rows', async () => {
    await seedReferenceTables(db);
    const { n } = db.prepare('SELECT COUNT(*) as n FROM port_da_estimates').get() as { n: number };
    expect(n).toBeGreaterThan(0);
  });

  it('is idempotent — calling twice yields same counts, no error', async () => {
    await seedReferenceTables(db);
    const counts1 = {
      charterers: (db.prepare('SELECT COUNT(*) as n FROM charterers').get() as { n: number }).n,
      psc: (db.prepare('SELECT COUNT(*) as n FROM psc_detention_history').get() as { n: number }).n,
      portDa: (db.prepare('SELECT COUNT(*) as n FROM port_da_estimates').get() as { n: number }).n,
    };

    // Second call — must not throw
    await expect(seedReferenceTables(db)).resolves.not.toThrow();

    const counts2 = {
      charterers: (db.prepare('SELECT COUNT(*) as n FROM charterers').get() as { n: number }).n,
      psc: (db.prepare('SELECT COUNT(*) as n FROM psc_detention_history').get() as { n: number }).n,
      portDa: (db.prepare('SELECT COUNT(*) as n FROM port_da_estimates').get() as { n: number }).n,
    };

    expect(counts2.charterers).toBe(counts1.charterers);
    expect(counts2.psc).toBe(counts1.psc);
    expect(counts2.portDa).toBe(counts1.portDa);
  });
});
