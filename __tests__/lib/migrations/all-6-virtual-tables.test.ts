/**
 * @file all-6-virtual-tables.test.ts
 * @description Integration test: verify all 6 virtual tables exist after full migration run.
 * Spec: spec-03-all-6-virtual-tables-exist-after-migration
 * Test ID: TC-NBI-06
 *
 * This is the definitive gate for Phase 2 RAG foundation:
 * - Runs all migrations on clean in-memory DB
 * - Asserts all 6 virtual tables (3 vec0 + 3 FTS5) exist in sqlite_master
 * - Verifies vec0 tables accept Float32Array[768] inserts
 * - Verifies FTS5 tables accept content inserts and MATCH queries
 *
 * Catches regressions if spec-01 or spec-02 migrations are broken/dropped.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

describe('all-6-virtual-tables integration test', () => {
  let db: Database.Database;

  beforeEach(() => {
    // In-memory DB with sqlite-vec loaded (matches production setup in lib/db/index.ts)
    db = new Database(':memory:');
    sqliteVec.load(db);
  });

  afterEach(() => {
    db.close();
  });

  // TC-NBI-06: all 6 virtual tables exist after runMigrations
  it('creates all 6 virtual tables (3 vec0 + 3 FTS5) after full migration run', () => {
    // Apply all migrations
    runMigrations(db, allMigrations);

    // Query sqlite_master for virtual tables
    const virtualTables = db
      .prepare<[], { name: string; type: string; sql: string }>(
        "SELECT name, type, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%VIRTUAL%' ORDER BY name"
      )
      .all();

    const tableNames = virtualTables.map((t) => t.name);

    // Assert all 6 expected tables exist
    const expectedVecTables = ['imsbc_vec', 'igc_vec', 'jwc_vec'];
    const expectedFtsTables = ['imsbc_fts', 'igc_fts', 'jwc_fts'];
    const expectedAllTables = [...expectedVecTables, ...expectedFtsTables];

    expect(tableNames).toEqual(expect.arrayContaining(expectedAllTables));
    expect(tableNames.filter((n) => expectedAllTables.includes(n))).toHaveLength(6);

    // Verify each table is actually a virtual table (not a regular table)
    expectedAllTables.forEach((tableName) => {
      const table = virtualTables.find((t) => t.name === tableName);
      expect(table).toBeDefined();
      expect(table?.sql).toMatch(/VIRTUAL/i);
    });
  });

  it('vec0 tables accept INSERT with Float32Array[768] + content + metadata', () => {
    runMigrations(db, allMigrations);

    const vecTables = ['imsbc_vec', 'igc_vec', 'jwc_vec'];
    const testEmbedding = new Float32Array(768).fill(0.1); // 768-dim embedding

    vecTables.forEach((tableName) => {
      // Insert a test row with embedding (rowid auto-increments)
      const stmt = db.prepare(
        `INSERT INTO ${tableName} (embedding, content, metadata) VALUES (?, ?, ?)`
      );
      const result = stmt.run(testEmbedding, 'test content', '{"test": true}');
      expect(result.changes).toBe(1);

      // Verify row was inserted (rowid should be auto-generated)
      const row = db.prepare(`SELECT rowid, content FROM ${tableName} LIMIT 1`).get() as any;
      expect(row).toBeDefined();
      expect(row.content).toBe('test content');
    });
  });

  it('FTS5 tables accept INSERT of content + metadata and return results via MATCH query', () => {
    runMigrations(db, allMigrations);

    const ftsTables = ['imsbc_fts', 'igc_fts', 'jwc_fts'];

    ftsTables.forEach((tableName) => {
      // Insert a test row
      const stmt = db.prepare(`INSERT INTO ${tableName} (content, metadata) VALUES (?, ?)`);
      const result = stmt.run('dangerous cargo regulations', '{"source": "test"}');
      expect(result.changes).toBe(1);

      // Verify MATCH query works
      const rows = db
        .prepare(`SELECT content FROM ${tableName} WHERE ${tableName} MATCH 'dangerous'`)
        .all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].content).toContain('dangerous');
    });
  });

  it('vec0 tables use vec0 virtual table module', () => {
    runMigrations(db, allMigrations);

    const vecTables = ['imsbc_vec', 'igc_vec', 'jwc_vec'];

    vecTables.forEach((tableName) => {
      const tableInfo = db
        .prepare<[string], { sql: string }>(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tableName);

      expect(tableInfo).toBeDefined();
      expect(tableInfo?.sql).toMatch(/vec0/i); // Verify it uses vec0 module
    });
  });

  it('FTS5 tables use FTS5 virtual table module with unicode61 tokenizer', () => {
    runMigrations(db, allMigrations);

    const ftsTables = ['imsbc_fts', 'igc_fts', 'jwc_fts'];

    ftsTables.forEach((tableName) => {
      const tableInfo = db
        .prepare<[string], { sql: string }>(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(tableName);

      expect(tableInfo).toBeDefined();
      expect(tableInfo?.sql).toMatch(/fts5/i); // Verify it uses FTS5 module
      expect(tableInfo?.sql).toMatch(/unicode61/i); // Verify tokenizer
    });
  });
});
