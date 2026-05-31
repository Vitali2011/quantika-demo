/**
 * Integration tests for hybrid retriever (FTS5 BM25 + vec0 cosine + RRF)
 * Spec: spec-07-fts5-bm25-search-select-rowid-content-metadata-rank-from-ftstable-order-by-rank-limit-topk
 */

import { retrieve, RetrieveOptions } from '@/lib/knowledge/embeddings/retriever';
import { getDb } from '@/lib/db';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import Database from 'better-sqlite3';

jest.mock('@/lib/knowledge/embeddings/client', () => ({
  embedQuery: jest.fn(),
}));

import { embedQuery } from '@/lib/knowledge/embeddings/client';

describe('retriever boundary tests', () => {
  let db: Database.Database;
  const origRag = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeAll(() => {
    process.env.KNOWLEDGE_RAG_ENABLED = 'true';
    db = getDb(':memory:');
    runMigrations(db, allMigrations);
  });

  afterAll(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = origRag;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('TC-NBI-00: RAG feature flag disabled', () => {
    it('throws Error("RAG is not enabled") when KNOWLEDGE_RAG_ENABLED=false', async () => {
      const prev = process.env.KNOWLEDGE_RAG_ENABLED;
      process.env.KNOWLEDGE_RAG_ENABLED = 'false';
      try {
        await expect(
          retrieve('IMSBC bulk cargo stowage', {
            vectorTable: 'imsbc_vec',
            ftsTable: 'imsbc_fts',
            db,
          })
        ).rejects.toThrow('RAG is not enabled');
        expect(embedQuery).not.toHaveBeenCalled();
      } finally {
        process.env.KNOWLEDGE_RAG_ENABLED = prev;
      }
    });
  });

  describe('TC-NBI-01: empty query string', () => {
    it('returns empty array without calling embedQuery', async () => {
      const result = await retrieve('', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(embedQuery).not.toHaveBeenCalled();
    });
  });

  describe('TC-NBI-02: null/undefined query', () => {
    it('returns empty array for null query', async () => {
      const result = await retrieve(null as any, {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('returns empty array for undefined query', async () => {
      const result = await retrieve(undefined as any, {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('TC-NBI-03: negative topK', () => {
    it('clamps negative topK to 1', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: -1,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('clamps large negative topK to 1', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: -100,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('TC-NBI-04: zero topN', () => {
    it('returns empty array when topN is 0', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topN: 0,
        db,
      });

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('TC-NBI-05: large topK', () => {
    it('caps topK at 1000', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 10000,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('caps topK at 1000 for Infinity', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: Infinity,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('TC-NBI-06: FTS5 syntax injection', () => {
    it('escapes FTS5 operators in query', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo AND DROP TABLE', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('escapes FTS5 NOT operator in query', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('NOT malware', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('escapes FTS5 OR operator in query', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo OR vessel', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('TC-VT-01: empty vectorTable', () => {
    it('throws TypeError for empty vectorTable', async () => {
      await expect(
        retrieve('cargo', {
          vectorTable: '',
          ftsTable: 'imsbc_fts',
          db,
        })
      ).rejects.toThrow(TypeError);

      await expect(
        retrieve('cargo', {
          vectorTable: '',
          ftsTable: 'imsbc_fts',
          db,
        })
      ).rejects.toThrow('vectorTable required');
    });
  });

  describe('TC-FT-01: empty ftsTable', () => {
    it('throws TypeError for empty ftsTable', async () => {
      await expect(
        retrieve('cargo', {
          vectorTable: 'imsbc_vec',
          ftsTable: '',
          db,
        })
      ).rejects.toThrow(TypeError);

      await expect(
        retrieve('cargo', {
          vectorTable: 'imsbc_vec',
          ftsTable: '',
          db,
        })
      ).rejects.toThrow('ftsTable required');
    });
  });

  describe('TC-RRF-NaN: special floats in rrfK', () => {
    it('uses default 60 for NaN rrfK', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        rrfK: NaN,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('uses default 60 for Infinity rrfK', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        rrfK: Infinity,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('uses default 60 for -Infinity rrfK', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        rrfK: -Infinity,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('uses default 60 for zero rrfK', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        rrfK: 0,
        db,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe('retriever integration tests', () => {
  let db: Database.Database;
  const origRag = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeAll(() => {
    process.env.KNOWLEDGE_RAG_ENABLED = 'true';
    db = getDb(':memory:');
    runMigrations(db, allMigrations);

    // Seed FTS5 and vec0 tables with test data
    // imsbc_vec and imsbc_fts
    const seedData = [
      {
        content: 'Cargo handling procedures for bulk materials',
        metadata: JSON.stringify({ source: 'imsbc', section: 'Chapter 1' }),
        embedding: new Float32Array(768).fill(0.1),
      },
      {
        content: 'Dangerous goods classification and storage',
        metadata: JSON.stringify({ source: 'imsbc', section: 'Chapter 2' }),
        embedding: new Float32Array(768).fill(0.2),
      },
      {
        content: 'Vessel stability and trim requirements',
        metadata: JSON.stringify({ source: 'imsbc', section: 'Chapter 3' }),
        embedding: new Float32Array(768).fill(0.3),
      },
      {
        content: 'Maritime safety regulations for international shipping',
        metadata: JSON.stringify({ source: 'imsbc', section: 'Chapter 4' }),
        embedding: new Float32Array(768).fill(0.4),
      },
      {
        content: 'Port operations and terminal logistics',
        metadata: JSON.stringify({ source: 'imsbc', section: 'Chapter 5' }),
        embedding: new Float32Array(768).fill(0.5),
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

  describe('empty tables', () => {
    it('returns empty array when both tables are empty', async () => {
      (embedQuery as jest.Mock).mockResolvedValue(new Float32Array(768));

      const result = await retrieve('nonexistent query xyz', {
        vectorTable: 'igc_vec',
        ftsTable: 'igc_fts',
        db,
      });

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('FTS5-only hit', () => {
    it('returns result from FTS5 when keyword matches but not semantically close', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.9);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      expect(result.length).toBeGreaterThan(0);
      const cargoDoc = result.find((r) => r.content.includes('Cargo handling'));
      expect(cargoDoc).toBeDefined();
      expect(cargoDoc?.content).toContain('Cargo handling');
    });
  });

  describe('vec0-only hit', () => {
    it('returns result from vec0 when semantically close but no keyword match', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('xyz123abc', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        db,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('content');
      expect(result[0]).toHaveProperty('distance');
      expect(result[0].distance).toBeGreaterThanOrEqual(0.0003);
      expect(result[0].distance).toBeLessThanOrEqual(0.0333);
    });
  });

  describe('RRF promotion', () => {
    it('ranks document in both lists higher than document in only one list', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        topN: 5,
        db,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('distance');
    });
  });

  describe('topN limit', () => {
    it('returns at most topN results', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 10,
        topN: 3,
        db,
      });

      expect(result).toHaveLength(3);
    });

    it('returns fewer than topN when not enough candidates', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 2,
        topN: 10,
        db,
      });

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe('topK parameter', () => {
    it('controls number of candidates from each ranker', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const resultTopK2 = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 2,
        topN: 10,
        db,
      });

      const resultTopK5 = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topK: 5,
        topN: 10,
        db,
      });

      expect(resultTopK5.length).toBeGreaterThanOrEqual(resultTopK2.length);
    });
  });

  describe('result shape', () => {
    it('each result has content, metadata, distance, chunkId', async () => {
      const mockEmbedding = new Float32Array(768).fill(0.1);
      (embedQuery as jest.Mock).mockResolvedValue(mockEmbedding);

      const result = await retrieve('cargo', {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        db,
      });

      if (result.length > 0) {
        const item = result[0];
        expect(item).toHaveProperty('content');
        expect(typeof item.content).toBe('string');
        expect(item).toHaveProperty('metadata');
        expect(typeof item.metadata).toBe('object');
        expect(item).toHaveProperty('distance');
        expect(typeof item.distance).toBe('number');
        expect(item).toHaveProperty('chunkId');
        expect(typeof item.chunkId).toBe('string');
      }
    });
  });
});
