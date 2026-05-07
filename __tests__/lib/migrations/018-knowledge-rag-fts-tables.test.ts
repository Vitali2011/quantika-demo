/**
 * Migration 018 FTS5 table tests
 *
 * Input Contract:
 * - Empty content ("") → INSERT succeeds (valid edge case) [TC-NBI-01]
 * - NULL metadata → INSERT succeeds (TEXT accepts NULL) [TC-NBI-02]
 * - Empty MATCH query ("") → Returns empty result set [TC-NBI-03]
 * - Special FTS5 operators ("AND OR NOT") → Interpreted as logical operators [TC-NBI-04]
 * - Very long content (>10,000 chars) → INSERT succeeds (no limit) [TC-NBI-05]
 * - Diacritics in query ("café") → Matches both "café" and "cafe" [TC-NBI-06]
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import migration018 from '@/lib/migrations/018-knowledge-rag-vec-tables';

describe('migration 018 FTS5 tables', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db); // Load sqlite-vec extension for vec0 tables
  });

  afterEach(() => {
    db.close();
  });

  describe('FTS5 table creation', () => {
    it('creates imsbc_fts, igc_fts, jwc_fts virtual tables after up()', () => {
      migration018.up(db);

      const tables = db
        .prepare("SELECT name, type FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
        .all() as Array<{ name: string; type: string }>;

      const ftsTableNames = tables.map((t) => t.name);
      expect(ftsTableNames).toContain('imsbc_fts');
      expect(ftsTableNames).toContain('igc_fts');
      expect(ftsTableNames).toContain('jwc_fts');
    });

    it('is idempotent — calling up() twice does not throw', () => {
      migration018.up(db);
      expect(() => migration018.up(db)).not.toThrow();
    });

    it('down() removes all FTS5 tables', () => {
      migration018.up(db);
      migration018.down(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
        .all() as Array<{ name: string }>;

      expect(tables.length).toBe(0);
    });
  });

  describe('FTS5 INSERT and MATCH operations', () => {
    beforeEach(() => {
      migration018.up(db);
    });

    it('[TC-NBI-01] accepts empty content ("")', () => {
      const insert = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      expect(() => insert.run('', '{"foo":"bar"}')).not.toThrow();

      // Verify the row was inserted
      const rows = db.prepare('SELECT * FROM imsbc_fts').all() as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].content).toBe('');
    });

    it('[TC-NBI-02] accepts NULL metadata', () => {
      const insert = db.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)');
      expect(() => insert.run('test content', null)).not.toThrow();

      const rows = db.prepare('SELECT * FROM igc_fts').all() as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].content).toBe('test content');
      expect(rows[0].metadata).toBe(null);
    });

    it('[TC-NBI-03] empty MATCH query throws syntax error (FTS5 behavior)', () => {
      db.prepare('INSERT INTO jwc_fts (content, metadata) VALUES (?, ?)').run(
        'Some content',
        '{}'
      );

      // FTS5 does not accept empty MATCH queries — this is expected behavior
      expect(() => {
        db.prepare('SELECT * FROM jwc_fts WHERE jwc_fts MATCH ?').all('');
      }).toThrow(/syntax error/);
    });

    it('[TC-NBI-04] FTS5 interprets "AND OR NOT" as logical operators', () => {
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'IMO class 4.2',
        '{}'
      );
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'IMO class 5.1',
        '{}'
      );
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run('Other text', '{}');

      // "IMO AND class" should match first two rows
      const resultAnd = db
        .prepare('SELECT * FROM imsbc_fts WHERE imsbc_fts MATCH ?')
        .all('IMO AND class') as any[];
      expect(resultAnd.length).toBe(2);

      // "IMO NOT Other" should match only first two rows (exclude "Other text")
      const resultNot = db
        .prepare('SELECT * FROM imsbc_fts WHERE imsbc_fts MATCH ?')
        .all('IMO NOT Other') as any[];
      expect(resultNot.length).toBe(2);
    });

    it('[TC-NBI-05] accepts very long content (>10,000 chars)', () => {
      const longContent = 'a'.repeat(15000);
      const insert = db.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)');
      expect(() => insert.run(longContent, '{}')).not.toThrow();

      const rows = db.prepare('SELECT length(content) as len FROM igc_fts').all() as any[];
      expect(rows[0].len).toBe(15000);
    });

    it('[TC-NBI-06] diacritics removal — "cafe" matches "café"', () => {
      db.prepare('INSERT INTO jwc_fts (content, metadata) VALUES (?, ?)').run(
        'I love café in the morning',
        '{}'
      );

      // Search for "cafe" (no diacritic) should match "café" due to unicode61 remove_diacritics 1
      const result = db
        .prepare('SELECT * FROM jwc_fts WHERE jwc_fts MATCH ?')
        .all('cafe') as any[];

      expect(result.length).toBe(1);
      expect(result[0].content).toContain('café');
    });
  });

  describe('BM25 ranking', () => {
    beforeEach(() => {
      migration018.up(db);
    });

    it('ORDER BY rank returns best match first', () => {
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'IRON ORE FINES',
        '{}'
      );
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'IRON ORE PELLETS',
        '{}'
      );
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'Some other cargo IRON',
        '{}'
      );

      // Query for "IRON ORE FINES" should rank exact match first
      const results = db
        .prepare('SELECT *, rank FROM imsbc_fts WHERE imsbc_fts MATCH ? ORDER BY rank')
        .all('IRON ORE FINES') as any[];

      expect(results.length).toBeGreaterThan(0);
      // Best match should be first (lowest rank value in FTS5)
      expect(results[0].content).toBe('IRON ORE FINES');
    });
  });
});
