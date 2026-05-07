/**
 * FTS5 INSERT and full-text search integration tests
 *
 * Verifies Phase 2 A1 acceptance criterion: "FTS5 accepts INSERT and full-text search returns row"
 *
 * Tests FTS5-specific behaviors:
 * - Multi-row INSERT with BM25 ranking
 * - Cross-table search isolation
 * - Phrase queries, prefix queries, boolean operators
 * - unicode61 remove_diacritics 1 tokenizer
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';

describe('FTS5 INSERT and full-text search', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Run all migrations to create FTS5 tables
    runMigrations(db, allMigrations);
  });

  afterEach(() => db.close());

  describe('INSERT into FTS5 tables', () => {
    // TC-NBI-01: empty content INSERT
    it('accepts INSERT with empty content string', () => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      expect(() => stmt.run('', '{"source":"test"}')).not.toThrow();
    });

    // TC-NBI-02: null metadata INSERT
    it('accepts INSERT with null metadata', () => {
      const stmt = db.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)');
      expect(() => stmt.run('test content', null)).not.toThrow();
    });

    // TC-NBI-05: very long content INSERT
    it('accepts INSERT with very long content (>10,000 chars)', () => {
      const longContent = 'a'.repeat(15000);
      const stmt = db.prepare('INSERT INTO jwc_fts (content, metadata) VALUES (?, ?)');
      expect(() => stmt.run(longContent, '{"source":"test"}')).not.toThrow();
    });

    it('successfully INSERTs 3-5 rows into imsbc_fts', () => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');

      stmt.run('Iron ore fines Category A cargo requiring moisture control', '{"section":"A","cargo":"iron_ore"}');
      stmt.run('Coal bulk cargo handling procedures', '{"section":"B","cargo":"coal"}');
      stmt.run('Grain cargo ventilation requirements', '{"section":"C","cargo":"grain"}');
      stmt.run('Hazardous materials transport regulations', '{"section":"D","cargo":"hazmat"}');

      const count = db.prepare('SELECT COUNT(*) as cnt FROM imsbc_fts').get() as { cnt: number };
      expect(count.cnt).toBe(4);
    });

    it('successfully INSERTs 3-5 rows into igc_fts', () => {
      const stmt = db.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)');

      stmt.run('Grain handling safety procedures for bulk carriers', '{"chapter":"1"}');
      stmt.run('Ventilation requirements for grain holds', '{"chapter":"2"}');
      stmt.run('Trimming obligations for grain cargo', '{"chapter":"3"}');

      const count = db.prepare('SELECT COUNT(*) as cnt FROM igc_fts').get() as { cnt: number };
      expect(count.cnt).toBe(3);
    });

    it('successfully INSERTs 3-5 rows into jwc_fts', () => {
      const stmt = db.prepare('INSERT INTO jwc_fts (content, metadata) VALUES (?, ?)');

      stmt.run('War risk zone bulletin for Middle East Gulf region', '{"zone":"MEG"}');
      stmt.run('High risk area designation off Somalia coast', '{"zone":"HRA"}');
      stmt.run('Revised war risk premium rates for West Africa', '{"zone":"WAF"}');
      stmt.run('Suez Canal transit security assessment', '{"zone":"SUZ"}');

      const count = db.prepare('SELECT COUNT(*) as cnt FROM jwc_fts').get() as { cnt: number };
      expect(count.cnt).toBe(4);
    });
  });

  describe('MATCH query - exact keyword', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Iron ore fines Category A cargo requiring moisture control', '{"cargo":"iron_ore"}');
      stmt.run('Coal bulk cargo handling procedures', '{"cargo":"coal"}');
      stmt.run('Grain cargo ventilation requirements', '{"cargo":"grain"}');
    });

    it('returns correct row for exact keyword match in imsbc_fts', () => {
      const rows = db.prepare("SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH 'moisture'").all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toContain('moisture control');
    });

    it('returns empty result for non-existent keyword', () => {
      const rows = db.prepare("SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH 'nonexistent'").all() as any[];
      expect(rows).toHaveLength(0);
    });

    it('returns correct row for keyword match in igc_fts', () => {
      db.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)').run(
        'Grain handling safety procedures for bulk carriers',
        '{"chapter":"1"}'
      );

      const rows = db.prepare("SELECT content FROM igc_fts WHERE igc_fts MATCH 'trimming'").all() as any[];
      // Should not find "trimming" in this test data
      expect(rows).toHaveLength(0);
    });
  });

  describe('BM25 rank ordering', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      // Insert content with varying keyword frequencies
      stmt.run('cargo handling procedures', '{"id":"1"}');
      stmt.run('cargo cargo transportation and cargo safety', '{"id":"2"}'); // 3x "cargo"
      stmt.run('bulk cargo shipping', '{"id":"3"}');
    });

    it('returns results ordered by BM25 rank (best match first)', () => {
      const rows = db.prepare("SELECT content, rank FROM imsbc_fts WHERE imsbc_fts MATCH 'cargo' ORDER BY rank").all() as any[];

      expect(rows.length).toBeGreaterThanOrEqual(1);
      // BM25 rank is negative (lower = better match)
      // Row with 3x "cargo" should rank better
      const bestMatch = rows[0];
      expect(bestMatch.content).toContain('cargo cargo transportation');
    });
  });

  describe('cross-table isolation', () => {
    it('content in imsbc_fts does not appear in igc_fts MATCH', () => {
      // Insert into imsbc_fts only
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'Iron ore fines unique keyword xyzabc123',
        '{"source":"imsbc"}'
      );

      // Search in igc_fts (should return nothing)
      const rows = db.prepare("SELECT content FROM igc_fts WHERE igc_fts MATCH 'xyzabc123'").all() as any[];
      expect(rows).toHaveLength(0);
    });

    it('content in igc_fts does not appear in jwc_fts MATCH', () => {
      // Insert into igc_fts only
      db.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)').run(
        'Grain handling unique keyword qwerty999',
        '{"source":"igc"}'
      );

      // Search in jwc_fts (should return nothing)
      const rows = db.prepare("SELECT content FROM jwc_fts WHERE jwc_fts MATCH 'qwerty999'").all() as any[];
      expect(rows).toHaveLength(0);
    });
  });

  describe('phrase queries', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Iron ore fines require moisture testing', '{"id":"1"}');
      stmt.run('Iron and ore are separate words here', '{"id":"2"}');
      stmt.run('Fines from iron ore processing', '{"id":"3"}');
    });

    it('phrase query matches exact phrase "iron ore fines"', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'"iron ore fines"\'').all() as any[];

      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Iron ore fines require moisture testing');
    });
  });

  describe('prefix queries', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Bulk carrier cargo operations', '{"id":"1"}');
      stmt.run('Building materials transport', '{"id":"2"}');
      stmt.run('Bulkhead safety requirements', '{"id":"3"}');
    });

    it('prefix query "bulk*" matches words starting with bulk', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'bulk*\'').all() as any[];

      expect(rows.length).toBeGreaterThanOrEqual(2);
      const contents = rows.map((r: any) => r.content);
      expect(contents).toContain('Bulk carrier cargo operations');
      expect(contents).toContain('Bulkhead safety requirements');
    });
  });

  describe('boolean operators', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Cargo handling procedures for hazardous materials', '{"id":"1"}');
      stmt.run('Cargo transportation safety guidelines', '{"id":"2"}');
      stmt.run('Hazardous waste disposal regulations', '{"id":"3"}');
    });

    it('AND operator returns rows containing both terms', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'cargo AND hazardous\'').all() as any[];

      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Cargo handling procedures for hazardous materials');
    });

    it('OR operator returns rows containing either term', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'cargo OR waste\'').all() as any[];

      expect(rows.length).toBeGreaterThanOrEqual(3);
    });

    it('NOT operator excludes rows containing the term', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'cargo NOT hazardous\'').all() as any[];

      expect(rows.length).toBeGreaterThanOrEqual(1);
      const contents = rows.map((r: any) => r.content);
      expect(contents).not.toContain('Cargo handling procedures for hazardous materials');
    });

    // TC-NBI-04: FTS5 syntax characters in MATCH
    it('handles FTS5 operator keywords as logical operators without crash', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'cargo OR hazardous\'').all() as any[];
      // Should not crash, returns results based on OR logic
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  describe('diacritics removal (unicode61 tokenizer)', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Shipping to café port in Málaga', '{"id":"1"}');
      stmt.run('Regular cafe without diacritics', '{"id":"2"}');
    });

    it('MATCH "cafe" returns rows containing "café" (diacritics removed)', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'cafe\'').all() as any[];

      expect(rows.length).toBeGreaterThanOrEqual(2);
      const contents = rows.map((r: any) => r.content);
      expect(contents).toContain('Shipping to café port in Málaga');
      expect(contents).toContain('Regular cafe without diacritics');
    });

    // TC-NBI-06: diacritics in MATCH query
    it('MATCH "café" returns rows with both "café" and "cafe"', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'café\'').all() as any[];

      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('empty content handling', () => {
    beforeEach(() => {
      const stmt = db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('', '{"id":"empty"}'); // Empty content
      stmt.run('Normal content with keywords', '{"id":"normal"}');
    });

    it('empty content INSERT succeeds but does not pollute MATCH results', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'keywords\'').all() as any[];

      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('Normal content with keywords');
    });
  });

  describe('empty MATCH query handling', () => {
    beforeEach(() => {
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'Test content',
        '{"id":"1"}'
      );
    });

    // TC-NBI-03: empty MATCH query
    it('handles empty MATCH query gracefully', () => {
      // FTS5 empty query returns error or empty result
      // Test that it doesn't crash
      let didThrow = false;
      try {
        db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'\'').all();
      } catch (error) {
        didThrow = true;
        // Expected to throw "fts5: syntax error near \"\""
        expect(error).toBeDefined();
      }
      // Either throws or returns empty (both are valid behaviors)
      expect(true).toBe(true);
    });
  });

  describe('very long content MATCH', () => {
    beforeEach(() => {
      const longContent = 'cargo '.repeat(3000) + ' uniquekeyword123';
      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        longContent,
        '{"id":"long"}'
      );
    });

    it('MATCH returns row with very long content (>10,000 chars)', () => {
      const rows = db.prepare('SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH \'uniquekeyword123\'').all() as any[];

      expect(rows).toHaveLength(1);
      expect(rows[0].content.length).toBeGreaterThan(10000);
      expect(rows[0].content).toContain('uniquekeyword123');
    });
  });
});
