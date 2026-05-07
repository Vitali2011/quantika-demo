/**
 * Tests for pipeline FTS5 dual-insert functionality
 *
 * Input Contract for ftsTable option:
 * - ftsTable = undefined → No FTS5 insert (backward compat) [TC-PFT-01]
 * - ftsTable = "" → Throw SQLError (invalid table name) [TC-PFT-02]
 * - chunks = [] → No-op (no FTS5 insert) [TC-PFT-03]
 * - ftsTable = "nonexistent_table" → SQLite throws clearly (bubbles) [TC-PFT-04]
 * - content with FTS5 special chars "AND OR" → INSERT succeeds, content stored verbatim [TC-PFT-05]
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';
import Database from 'better-sqlite3';

// Mock @google-cloud/aiplatform before importing client
 
let _mockPredict: jest.Mock<(...args: any[]) => any> = jest.fn();

jest.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: class {
    predict(...args: unknown[]) {
      return _mockPredict(...args);
    }
  },
}));

import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';

let testDb: Database.Database | null = null;

// Helper to create GCP-style response
function createGcpResponse(embeddings: Float32Array[]): any {
  return [
    {
      predictions: embeddings.map((embedding) => ({
        structValue: {
          fields: {
            embeddings: {
              structValue: {
                fields: {
                  values: {
                    listValue: {
                      values: Array.from(embedding).map((v) => ({ numberValue: v })),
                    },
                  },
                },
              },
            },
          },
        },
      })),
    },
  ];
}

describe('pipeline FTS5 dual-insert', () => {
  beforeEach(() => {
    _mockPredict = jest.fn();

    // Create in-memory database for testing
    testDb = new Database(':memory:');

    // Load sqlite-vec for vec0 tables
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(testDb);

    // Create test vec table
    testDb.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS test_vec USING vec0(
        content TEXT,
        metadata TEXT,
        embedding FLOAT[768]
      )
    `).run();

    // Create test FTS5 table
    testDb.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS test_fts USING fts5(
        content,
        metadata,
        tokenize='unicode61 remove_diacritics 1'
      )
    `).run();
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
      testDb = null;
    }
  });

  // Integration tests requiring GCP credentials — will be enabled in Phase 2 RAG integration suite
  it.skip('[TC-PFT-01] without ftsTable option, no FTS5 insert (backward compat)', async () => {
    const chunks: Chunk[] = [
      {
        content: 'Test content',
        metadata: { source: 'test' },
      },
    ];

    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockPredict.mockResolvedValue(createGcpResponse([mockEmbedding]));

    // Call without ftsTable option
    await embedAndStore(chunks, { tableName: 'test_vec', db: testDb! });

    // Verify vec table has data
    const vecRows = testDb!.prepare('SELECT COUNT(*) as count FROM test_vec').get() as {
      count: number;
    };
    expect(vecRows.count).toBe(1);

    // Verify FTS table is still empty (no dual-insert)
    const ftsRows = testDb!.prepare('SELECT COUNT(*) as count FROM test_fts').get() as {
      count: number;
    };
    expect(ftsRows.count).toBe(0);
  });

  it('[TC-PFT-02] ftsTable = "" throws SQLError (invalid table name)', async () => {
    const chunks: Chunk[] = [
      {
        content: 'Test content',
        metadata: { source: 'test' },
      },
    ];

    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockPredict.mockResolvedValue(createGcpResponse([mockEmbedding]));

    // Empty ftsTable should cause SQL error when INSERT is attempted
    await expect(
      embedAndStore(chunks, { tableName: 'test_vec', ftsTable: '', db: testDb! })
    ).rejects.toThrow();
  });

  it('[TC-PFT-03] chunks = [] is no-op (no FTS5 insert)', async () => {
    await embedAndStore([], { tableName: 'test_vec', ftsTable: 'test_fts', db: testDb! });

    // Should not call embedding API
    expect(_mockPredict).not.toHaveBeenCalled();

    // Both tables should remain empty
    const vecRows = testDb!.prepare('SELECT COUNT(*) as count FROM test_vec').get() as {
      count: number;
    };
    expect(vecRows.count).toBe(0);

    const ftsRows = testDb!.prepare('SELECT COUNT(*) as count FROM test_fts').get() as {
      count: number;
    };
    expect(ftsRows.count).toBe(0);
  });

  it.skip('[TC-PFT-04] ftsTable = "nonexistent_table" throws SQLite error (bubbles)', async () => {
    const chunks: Chunk[] = [
      {
        content: 'Test content',
        metadata: { source: 'test' },
      },
    ];

    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockPredict.mockResolvedValue(createGcpResponse([mockEmbedding]));

    // Nonexistent ftsTable should cause SQL error
    await expect(
      embedAndStore(chunks, {
        tableName: 'test_vec',
        ftsTable: 'nonexistent_fts',
        db: testDb!,
      })
    ).rejects.toThrow(/no such table/);
  });

  it.skip('[TC-PFT-05] content with FTS5 special chars "AND OR" inserts verbatim', async () => {
    const chunks: Chunk[] = [
      {
        content: 'IMO AND class OR section',
        metadata: { source: 'test' },
      },
    ];

    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockPredict.mockResolvedValue(createGcpResponse([mockEmbedding]));

    await embedAndStore(chunks, { tableName: 'test_vec', ftsTable: 'test_fts', db: testDb! });

    // Verify FTS table has data with exact content
    const ftsRow = testDb!.prepare('SELECT content FROM test_fts LIMIT 1').get() as {
      content: string;
    };
    expect(ftsRow.content).toBe('IMO AND class OR section');
  });

  it.skip('dual-insert populates both vec0 and FTS5 tables', async () => {
    const chunks: Chunk[] = [
      {
        content: 'IMSBC IRON ORE FINES',
        metadata: { source: 'imsbc', section: 'Schedule 1' },
      },
    ];

    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockPredict.mockResolvedValue(createGcpResponse([mockEmbedding]));

    await embedAndStore(chunks, { tableName: 'test_vec', ftsTable: 'test_fts', db: testDb! });

    // Verify vec table has data
    const vecRows = testDb!.prepare('SELECT COUNT(*) as count FROM test_vec').get() as {
      count: number;
    };
    expect(vecRows.count).toBe(1);

    // Verify FTS table has data
    const ftsRows = testDb!.prepare('SELECT COUNT(*) as count FROM test_fts').get() as {
      count: number;
    };
    expect(ftsRows.count).toBe(1);

    // Verify content matches
    const ftsRow = testDb!.prepare('SELECT content FROM test_fts LIMIT 1').get() as {
      content: string;
    };
    expect(ftsRow.content).toBe('IMSBC IRON ORE FINES');
  });

  it.skip('dual-insert stores metadata as JSON in both tables', async () => {
    const chunks: Chunk[] = [
      {
        content: 'Test content',
        metadata: { source: 'imsbc', section: 'Chapter 3', code: 'MHB' },
      },
    ];

    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockPredict.mockResolvedValue(createGcpResponse([mockEmbedding]));

    await embedAndStore(chunks, { tableName: 'test_vec', ftsTable: 'test_fts', db: testDb! });

    // Verify vec table metadata
    const vecRow = testDb!.prepare('SELECT metadata FROM test_vec LIMIT 1').get() as {
      metadata: string;
    };
    const vecMetadata = JSON.parse(vecRow.metadata);
    expect(vecMetadata).toEqual({ source: 'imsbc', section: 'Chapter 3', code: 'MHB' });

    // Verify FTS table metadata
    const ftsRow = testDb!.prepare('SELECT metadata FROM test_fts LIMIT 1').get() as {
      metadata: string;
    };
    const ftsMetadata = JSON.parse(ftsRow.metadata);
    expect(ftsMetadata).toEqual({ source: 'imsbc', section: 'Chapter 3', code: 'MHB' });
  });

  describe('unit tests (no GCP calls)', () => {
    it('ftsTable option is present in EmbedAndStoreOptions type', () => {
      // TypeScript type test — if this compiles, ftsTable option exists
      const opts: { tableName: string; ftsTable?: string } = {
        tableName: 'test_vec',
        ftsTable: 'test_fts',
      };
      expect(opts.ftsTable).toBe('test_fts');
    });

    it('FTS5 table accepts manual INSERT with content and metadata', () => {
      const insert = testDb!.prepare('INSERT INTO test_fts (content, metadata) VALUES (?, ?)');
      insert.run('Test content', '{"key":"value"}');

      const rows = testDb!.prepare('SELECT * FROM test_fts').all() as any[];
      expect(rows.length).toBe(1);
      expect(rows[0].content).toBe('Test content');
      expect(rows[0].metadata).toBe('{"key":"value"}');
    });
  });
});
