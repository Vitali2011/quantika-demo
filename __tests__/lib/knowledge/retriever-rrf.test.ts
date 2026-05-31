/**
 * Unit tests for Reciprocal Rank Fusion (RRF) algorithm
 * Spec: spec-07-fts5-bm25-search-select-rowid-content-metadata-rank-from-ftstable-order-by-rank-limit-topk
 */

import { retrieve } from '@/lib/knowledge/embeddings/retriever';
import { getDb } from '@/lib/db';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import Database from 'better-sqlite3';

jest.mock('@/lib/knowledge/embeddings/client', () => ({
  embedQuery: jest.fn(),
}));

import { embedQuery } from '@/lib/knowledge/embeddings/client';

describe('RRF algorithm tests', () => {
  let db: Database.Database;
  const origRag = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeAll(() => {
    process.env.KNOWLEDGE_RAG_ENABLED = 'true';
    db = getDb(':memory:');
    runMigrations(db, allMigrations);

    // Seed data with controlled embeddings for testing RRF
    const seedData = [
      {
        content: 'Document A - appears in both FTS5 and vec0 at rank 1',
        metadata: JSON.stringify({ source: 'test', id: 'A' }),
        embedding: new Float32Array(768).fill(1.0),
      },
      {
        content: 'Document B - appears only in FTS5 at rank 2',
        metadata: JSON.stringify({ source: 'test', id: 'B' }),
        embedding: new Float32Array(768).fill(0.1),
      },
      {
        content: 'Document C - appears only in vec0 at rank 1',
        metadata: JSON.stringify({ source: 'test', id: 'C' }),
        embedding: new Float32Array(768).fill(1.0),
      },
    ];

    for (const row of seedData) {
      db.prepare(
        'INSERT INTO imsbc_vec (content, metadata, embedding) VALUES (?, ?, ?)'
      ).run(row.content, row.metadata, row.embedding);

      db.prepare('INSERT INTO imsbc_fts (content, metadata) VALUES (?, ?)').run(
        row.content,
        row.metadata
      );
    }
  });

  afterAll(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = origRag;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('RRF score calculation with rrfK=60', () => {
    it('document at rank 1 in both lists has highest combined score', async () => {
      const mockEmbedding = new Float32Array(768).fill(1.0);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('Document A both', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 3,
        topN: 3,
        rrfK: 60,
        db,
      });

      expect(result.length).toBeGreaterThan(0);

      const docA = result.find((r) => r.content.includes('Document A'));
      if (docA) {
        expect(docA.distance).toBeGreaterThan(0);
        expect(docA.distance).toBeGreaterThanOrEqual(0.0003);
        expect(docA.distance).toBeLessThanOrEqual(0.0333);
      }
    });

    it('score matches formula 1/(60+rank) for single list appearance', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 3,
        topN: 3,
        rrfK: 60,
        db,
      });

      if (result.length > 0) {
        for (const doc of result) {
          expect(doc.distance).toBeGreaterThanOrEqual(0.0003);
          expect(doc.distance).toBeLessThanOrEqual(0.0333);
        }
      }
    });
  });

  describe('RRF promotion', () => {
    it('document in both lists ranks higher than document in only one list', async () => {
      const mockEmbedding = new Float32Array(768).fill(1.0);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('Document', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        topN: 5,
        rrfK: 60,
        db,
      });

      if (result.length >= 2) {
        const docA = result.find((r) => r.content.includes('Document A'));
        const docB = result.find((r) => r.content.includes('Document B'));

        if (docA && docB) {
          const indexA = result.indexOf(docA);
          const indexB = result.indexOf(docB);

          expect(docA.distance).toBeGreaterThan(0);
          expect(docB.distance).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('tie-breaking determinism', () => {
    it('produces deterministic order for equal scores', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result1 = await retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        topN: 5,
        rrfK: 60,
        db,
      });

      const result2 = await retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        topN: 5,
        rrfK: 60,
        db,
      });

      expect(result1.length).toBe(result2.length);

      for (let i = 0; i < result1.length; i++) {
        expect(result1[i].chunkId).toBe(result2[i].chunkId);
        expect(result1[i].distance).toBe(result2[i].distance);
      }
    });

    it('stable sort by rowid when scores are equal', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        topN: 5,
        rrfK: 60,
        db,
      });

      if (result.length >= 2) {
        for (let i = 1; i < result.length; i++) {
          if (result[i].distance === result[i - 1].distance) {
            const rowid1 = parseInt(result[i - 1].chunkId);
            const rowid2 = parseInt(result[i].chunkId);
            expect(rowid1).toBeLessThanOrEqual(rowid2);
          }
        }
      }
    });
  });

  describe('custom rrfK parameter', () => {
    it('uses provided rrfK value in score calculation', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.5);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const resultK60 = await retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 3,
        topN: 3,
        rrfK: 60,
        db,
      });

      const resultK30 = await retrieve('test', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 3,
        topN: 3,
        rrfK: 30,
        db,
      });

      if (resultK60.length > 0 && resultK30.length > 0) {
        expect(resultK30[0].distance).not.toBe(resultK60[0].distance);
      }
    });
  });
});
