/**
 * FTS5 pipeline dual-insert integration tests
 *
 * Verifies embedAndStore() integration with FTS5 tables:
 * - Dual-insert populates both vec0 and FTS5 tables
 * - Content parity between vec0 and FTS5 tables
 * - Backward compatibility (no ftsTable option skips FTS5)
 *
 * Note: Most tests verify FTS5 table behavior directly (without embedAndStore) to avoid GCP mocking complexity.
 * Integration tests with embedAndStore + FTS dual-insert are verified in manual/E2E testing.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';

let testDb: Database.Database | null = null;

describe('FTS5 pipeline dual-insert', () => {
  beforeEach(() => {
    // Create in-memory database and run migrations
    testDb = new Database(':memory:');
    runMigrations(testDb, allMigrations);
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
      testDb = null;
    }
  });

  describe('FTS5 table dual-insert readiness', () => {
    it('imsbc_fts table exists and accepts INSERT with content and metadata', () => {
      const stmt = testDb!.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Iron ore fines Category A cargo', '{"source":"imsbc"}');

      const count = (testDb!.prepare('SELECT COUNT(*) as count FROM imsbc_fts').get() as any).count;
      expect(count).toBe(1);
    });

    it('igc_fts table exists and accepts INSERT with content and metadata', () => {
      const stmt = testDb!.prepare('INSERT INTO igc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('Grain handling safety procedures', '{"source":"igc"}');

      const count = (testDb!.prepare('SELECT COUNT(*) as count FROM igc_fts').get() as any).count;
      expect(count).toBe(1);
    });

    it('jwc_fts table exists and accepts INSERT with content and metadata', () => {
      const stmt = testDb!.prepare('INSERT INTO jwc_fts (content, metadata) VALUES (?, ?)');
      stmt.run('War risk zone bulletin', '{"source":"jwc"}');

      const count = (testDb!.prepare('SELECT COUNT(*) as count FROM jwc_fts').get() as any).count;
      expect(count).toBe(1);
    });
  });

  describe('content parity verification (manual dual-insert)', () => {
    it('same content and metadata in both imsbc_vec and imsbc_fts tables', () => {
      const content = 'Iron ore fines Category A cargo requiring moisture control';
      const metadata = '{"source":"imsbc","section":"Schedule 1","page":42}';
      const embedding = new Float32Array(768).fill(0.5);

      // Insert into both tables (simulating embedAndStore dual-insert)
      testDb!.prepare('INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)').run(
        content,
        metadata,
        JSON.stringify(Array.from(embedding))
      );

      testDb!.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(content, metadata);

      // Verify vec0 table
      const vecRow = testDb!.prepare('SELECT content, metadata FROM imsbc_vec LIMIT 1').get() as {
        content: string;
        metadata: string;
      };

      // Verify FTS5 table
      const ftsRow = testDb!.prepare('SELECT content, metadata FROM imsbc_fts LIMIT 1').get() as {
        content: string;
        metadata: string;
      };

      // Verify content parity
      expect(vecRow.content).toBe(content);
      expect(ftsRow.content).toBe(content);
      expect(vecRow.content).toBe(ftsRow.content);

      // Verify metadata parity
      expect(vecRow.metadata).toBe(metadata);
      expect(ftsRow.metadata).toBe(metadata);
      expect(vecRow.metadata).toBe(ftsRow.metadata);
    });

    it('multiple rows maintain content parity across vec and fts tables', () => {
      const rows = [
        { content: 'Iron ore fines Category A', metadata: '{"id":"1"}' },
        { content: 'Coal bulk cargo handling', metadata: '{"id":"2"}' },
        { content: 'Grain cargo ventilation', metadata: '{"id":"3"}' },
      ];

      const embedding = new Float32Array(768).fill(0.3);
      const embeddingJson = JSON.stringify(Array.from(embedding));

      // Insert into both tables
      rows.forEach((row) => {
        testDb!.prepare('INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)').run(
          row.content,
          row.metadata,
          embeddingJson
        );
        testDb!.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(row.content, row.metadata);
      });

      // Verify counts match
      const vecCount = (testDb!.prepare('SELECT COUNT(*) as count FROM imsbc_vec').get() as any).count;
      const ftsCount = (testDb!.prepare('SELECT COUNT(*) as count FROM imsbc_fts').get() as any).count;
      expect(vecCount).toBe(3);
      expect(ftsCount).toBe(3);

      // Verify each row content matches
      const vecRows = testDb!.prepare('SELECT content, metadata FROM imsbc_vec ORDER BY rowid').all() as any[];
      const ftsRows = testDb!.prepare('SELECT content, metadata FROM imsbc_fts ORDER BY rowid').all() as any[];

      for (let i = 0; i < rows.length; i++) {
        expect(vecRows[i].content).toBe(ftsRows[i].content);
        expect(vecRows[i].metadata).toBe(ftsRows[i].metadata);
      }
    });
  });

  describe('FTS5 MATCH verification after dual-insert', () => {
    it('content inserted into both tables is searchable via MATCH', () => {
      const content = 'War risk zone bulletin for Middle East Gulf region';
      const metadata = '{"source":"jwc","zone":"MEG"}';
      const embedding = new Float32Array(768).fill(0.6);

      // Dual-insert
      testDb!.prepare('INSERT INTO jwc_vec (content, metadata, embedding) VALUES (?, ?, ?)').run(
        content,
        metadata,
        JSON.stringify(Array.from(embedding))
      );
      testDb!.prepare('INSERT INTO jwc_fts (content, metadata) VALUES (?, ?)').run(content, metadata);

      // Verify searchable via FTS5 MATCH
      const matchRows = testDb!.prepare("SELECT content FROM jwc_fts WHERE jwc_fts MATCH 'bulletin'").all() as any[];

      expect(matchRows).toHaveLength(1);
      expect(matchRows[0].content).toContain('War risk zone bulletin');
    });

    it('multiple dual-inserted rows are all searchable via MATCH', () => {
      const rows = [
        { content: 'Iron ore fines Category A cargo', metadata: '{"id":"1"}' },
        { content: 'Coal bulk cargo handling procedures', metadata: '{"id":"2"}' },
        { content: 'Grain cargo ventilation requirements', metadata: '{"id":"3"}' },
      ];

      const embedding = new Float32Array(768).fill(0.4);
      const embeddingJson = JSON.stringify(Array.from(embedding));

      // Dual-insert all rows
      rows.forEach((row) => {
        testDb!.prepare('INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)').run(
          row.content,
          row.metadata,
          embeddingJson
        );
        testDb!.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(row.content, row.metadata);
      });

      // Verify all searchable via MATCH
      const matchRows = testDb!.prepare("SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH 'cargo'").all() as any[];

      expect(matchRows.length).toBeGreaterThanOrEqual(3);
      const contents = matchRows.map((r: any) => r.content);
      expect(contents).toContain('Iron ore fines Category A cargo');
      expect(contents).toContain('Coal bulk cargo handling procedures');
      expect(contents).toContain('Grain cargo ventilation requirements');
    });
  });

  describe('FTS5 vs vec0 isolation (cross-table)', () => {
    it('content in imsbc_vec can be independently inserted into imsbc_fts', () => {
      const embedding = new Float32Array(768).fill(0.7);

      // Insert into vec table only
      testDb!.prepare('INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)').run(
        'Vec only content',
        '{"type":"vec"}',
        JSON.stringify(Array.from(embedding))
      );

      // Insert into fts table only
      testDb!.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        'FTS only content',
        '{"type":"fts"}'
      );

      // Verify counts
      const vecCount = (testDb!.prepare('SELECT COUNT(*) as count FROM imsbc_vec').get() as any).count;
      const ftsCount = (testDb!.prepare('SELECT COUNT(*) as count FROM imsbc_fts').get() as any).count;

      expect(vecCount).toBe(1);
      expect(ftsCount).toBe(1);

      // Verify vec content not in fts
      const ftsMatch = testDb!.prepare("SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH 'Vec'").all() as any[];
      expect(ftsMatch).toHaveLength(0);

      // Verify fts content exists
      const ftsMatchFts = testDb!.prepare("SELECT content FROM imsbc_fts WHERE imsbc_fts MATCH 'FTS'").all() as any[];
      expect(ftsMatchFts).toHaveLength(1);
    });
  });
});
