/**
 * TDD test for Phase 2: seedRagTables(db)
 *
 * Tests:
 * 1. Against a fresh temp DB with migrations applied (with sqliteVec loaded),
 *    all 8 RAG virtual tables are present after one call.
 * 2. Tables that have data in knowledge-ref.db (imsbc, igc, jwc, bimco) are
 *    populated with COUNT(*) > 0.
 * 3. kNN query on imsbc_vec returns rows.
 * 4. FTS MATCH on imsbc_fts returns rows.
 * 5. Counts in destination match source counts in reference db.
 * 6. Calling it twice is idempotent — counts remain the same, no error.
 * 7. Under dry=true, tables remain empty.
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from '../../../lib/migrations/runner';
import { allMigrations } from '../../../lib/migrations/index';
import { seedRagTables } from '../regenerate-matches';

const REF_DB_PATH = path.resolve(__dirname, '../../../data/knowledge/knowledge-ref.db');

function makeDb(): { db: Database.Database; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `rag-tables-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new Database(dbPath);
  sqliteVec.load(db);
  runMigrations(db, allMigrations);
  return { db, dbPath };
}

describe('seedRagTables', () => {
  let db: Database.Database;
  let dbPath: string;

  const ALL_TABLES = [
    'imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec',
    'imsbc_fts', 'igc_fts', 'jwc_fts', 'bimco_fts',
  ] as const;

  // Tables that have actual data in the prod-sourced reference artifact
  const POPULATED_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec', 'bimco_vec'] as const;
  const POPULATED_FTS_TABLES = ['imsbc_fts', 'igc_fts', 'jwc_fts', 'bimco_fts'] as const;

  beforeAll(() => {
    // Ensure the committed reference artifact exists before any test runs
    if (!fs.existsSync(REF_DB_PATH)) {
      throw new Error(`knowledge-ref.db not found at ${REF_DB_PATH}. Build it first.`);
    }
  });

  beforeEach(() => {
    ({ db, dbPath } = makeDb());
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('knowledge-ref.db exists and has > 0 rows for imsbc_vec', () => {
    const refDb = new Database(REF_DB_PATH, { readonly: true });
    sqliteVec.load(refDb);
    const { n } = refDb.prepare('SELECT COUNT(*) as n FROM imsbc_vec').get() as { n: number };
    refDb.close();
    expect(n).toBeGreaterThan(0);
  });

  it('populates all 8 RAG virtual tables (all are selectable after seeding)', async () => {
    await seedRagTables(db);
    for (const table of ALL_TABLES) {
      // Just verify we can query each table (no error = table exists + writable)
      expect(() => db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get()).not.toThrow();
    }
  });

  it('populated vec tables have COUNT(*) > 0 after seeding', async () => {
    await seedRagTables(db);
    for (const table of POPULATED_VEC_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      expect(n).toBeGreaterThan(0);
    }
  });

  it('populated fts tables have COUNT(*) > 0 after seeding', async () => {
    await seedRagTables(db);
    for (const table of POPULATED_FTS_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      expect(n).toBeGreaterThan(0);
    }
  });

  it('kNN query on imsbc_vec returns rows after seeding', async () => {
    await seedRagTables(db);
    // Use a zero-vector as a query — just needs to return rows, not meaningful similarity
    const zeroVec = JSON.stringify(new Array(768).fill(0));
    const rows = db
      .prepare(
        `SELECT rowid, content, metadata FROM imsbc_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 3`,
      )
      .all(zeroVec);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('FTS MATCH on imsbc_fts returns rows after seeding', async () => {
    await seedRagTables(db);
    // "cargo" is present in IMSBC content
    const rows = db
      .prepare(`SELECT rowid, content FROM imsbc_fts WHERE imsbc_fts MATCH ? ORDER BY rank LIMIT 3`)
      .all('cargo');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('destination counts match source counts in reference db', async () => {
    const refDb = new Database(REF_DB_PATH, { readonly: true });
    sqliteVec.load(refDb);
    const refCounts: Record<string, number> = {};
    for (const table of ALL_TABLES) {
      refCounts[table] = (refDb.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
    }
    refDb.close();

    await seedRagTables(db);

    for (const table of ALL_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      expect(n).toBe(refCounts[table]);
    }
  });

  it('is idempotent — calling twice yields same counts, no error', async () => {
    await seedRagTables(db);
    const counts1: Record<string, number> = {};
    for (const table of ALL_TABLES) {
      counts1[table] = (db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
    }

    // Second call — must not throw and must not change counts
    await expect(seedRagTables(db)).resolves.not.toThrow();

    for (const table of ALL_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      expect(n).toBe(counts1[table]);
    }
  });

  it('dry mode — populated tables remain empty when dry=true', async () => {
    await seedRagTables(db, { dry: true });
    for (const table of POPULATED_VEC_TABLES) {
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number };
      expect(n).toBe(0);
    }
  });
});
