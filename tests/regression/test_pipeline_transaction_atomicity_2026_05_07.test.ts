/**
 * Adversarial regression — pipeline.ts dual-insert atomicity
 * Cold-start QA wave 2026-05-07 (Q1 + Q2 from .test-review-2026-05-07/attack_plan.md)
 *
 * Surface under test: lib/knowledge/embeddings/pipeline.ts::embedAndStore
 *
 * Findings sought:
 * ── Q1 (HIGH) non-atomic vec0 + FTS5 dual-insert ─────────────────────────
 * For each chunk in a batch, pipeline.ts runs:
 *     stmt.run({ ... })          // INSERT INTO imsbc_vec
 *     if (ftsStmt) ftsStmt.run() // INSERT INTO imsbc_fts
 * NEITHER call is wrapped in `db.transaction(...)`. If `ftsStmt.run` for the
 * Nth chunk throws (FTS5 schema corruption, disk full, foreign-key fault,
 * concurrency timeout), chunks 1..N have ALREADY been written to imsbc_vec
 * and committed. The corpus carries vec rows that have no FTS counterpart.
 * RRF retrieval is silently biased toward vec0 (FTS half undercounts) and
 * the dual-source contract from spec-09 is violated.
 *
 * ── Q2 (HIGH) wrong-dim Vertex response aborts mid-batch ─────────────────
 * vec0 columns are FLOAT[768]. If embedDocuments returns Float32Array of
 * length ≠ 768 for any chunk in a batch (Vertex API drift, partial response,
 * model swap), the corresponding vec INSERT throws "dimension mismatch". By
 * Q1's non-atomicity, earlier chunks in the same batch (and any earlier
 * batches) are already committed. Same data-inconsistency, different fault
 * source.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';

// Mock @google-cloud/aiplatform BEFORE importing pipeline (which imports client).
let mockPredict: jest.Mock<(...args: any[]) => any> = jest.fn();
jest.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: class {
    predict(...args: unknown[]) {
      return mockPredict(...args);
    }
  },
}));

import { embedAndStore } from '@/lib/knowledge/embeddings/pipeline';

// Vertex-shape response builder
function gcpResponse(embeddings: Float32Array[]): any {
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

function makeChunks(n: number, prefix = 'c'): Chunk[] {
  return Array.from({ length: n }, (_, i) => ({
    content: `${prefix}-${i}-test`,
    metadata: { source: 'imsbc', section: `S${i}` },
  })) as Chunk[];
}

function newDbWithRagTables(): Database.Database {
  const db = new Database(':memory:');
  // Load sqlite-vec for vec0 virtual tables
   
  const sqliteVec = require('sqlite-vec');
  sqliteVec.load(db);

  // Create the SAME schema as migration 018 — pipeline.ts allowlists 'imsbc_vec' and 'imsbc_fts'.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS imsbc_vec USING vec0(
      embedding FLOAT[768],
      content TEXT,
      metadata TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS imsbc_fts USING fts5(
      content,
      metadata,
      tokenize='unicode61 remove_diacritics 1'
    );
  `);
  return db;
}

describe('Q1 — pipeline.ts dual-insert atomicity (vec0 + FTS5)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = newDbWithRagTables();
    mockPredict = jest.fn();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
    jest.restoreAllMocks();
  });

  it('Q1-a: vec count equals fts count after a successful 5-chunk batch (control)', async () => {
    // 5 valid 768-dim embeddings
    const embeddings = Array.from({ length: 5 }, () => new Float32Array(768).fill(0.01));
    mockPredict.mockResolvedValueOnce(gcpResponse(embeddings));

    await embedAndStore(makeChunks(5), {
      tableName: 'imsbc_vec',
      ftsTable: 'imsbc_fts',
      truncate: true,
      db,
    });

    const vecCount = (db.prepare('SELECT COUNT(*) as n FROM imsbc_vec').get() as any).n;
    const ftsCount = (db.prepare('SELECT COUNT(*) as n FROM imsbc_fts').get() as any).n;
    expect(vecCount).toBe(5);
    expect(ftsCount).toBe(5);
  });

  it('Q1-b: when the FTS5 INSERT fails on chunk #3, vec count and fts count MUST stay aligned', async () => {
    // 5 valid 768-dim embeddings
    const embeddings = Array.from({ length: 5 }, () => new Float32Array(768).fill(0.02));
    mockPredict.mockResolvedValueOnce(gcpResponse(embeddings));

    // Wrap db.prepare so the 3rd execution of the FTS5 INSERT throws.
    let ftsRunCalls = 0;
    const realPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const real = realPrepare(sql);
      if (sql.includes('INTO imsbc_fts')) {
        // Wrap the run() to inject a fault on the 3rd chunk
        const proxied = new Proxy(real, {
          get(target, prop) {
            if (prop === 'run') {
              return (...args: unknown[]) => {
                ftsRunCalls += 1;
                if (ftsRunCalls === 3) {
                  throw new Error('simulated FTS5 failure on 3rd chunk');
                }
                return (target as any).run(...args);
              };
            }
            return (target as any)[prop];
          },
        });
        return proxied;
      }
      return real;
    }) as typeof db.prepare;

    let caught: unknown = null;
    try {
      await embedAndStore(makeChunks(5), {
        tableName: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        truncate: true,
        db,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    const vecCount = (db.prepare('SELECT COUNT(*) as n FROM imsbc_vec').get() as any).n;
    const ftsCount = (db.prepare('SELECT COUNT(*) as n FROM imsbc_fts').get() as any).n;

    // STRICT atomicity contract: vec count == fts count, regardless of where
    // the failure landed. Today: vec=3 (commits before throw), fts=2 (only the
    // first two FTS inserts succeeded), so this assertion FAILS and pins the
    // non-atomic dual-insert.
    expect(vecCount).toBe(ftsCount);
  });
});

describe('Q2 — wrong-dim Vertex response leaves split-brain corpus', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = newDbWithRagTables();
    mockPredict = jest.fn();
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
    jest.restoreAllMocks();
  });

  it('Q2-a: a single wrong-dim embedding (e.g. 100 dims) MUST NOT leave partially-written batch', async () => {
    // 4 valid 768-dim + 1 wrong-dim (length 100). The wrong-dim chunk is the 3rd.
    const embeddings = [
      new Float32Array(768).fill(0.05),
      new Float32Array(768).fill(0.06),
      new Float32Array(100).fill(0.07), // ← bad
      new Float32Array(768).fill(0.08),
      new Float32Array(768).fill(0.09),
    ];
    mockPredict.mockResolvedValueOnce(gcpResponse(embeddings));

    let caught: unknown = null;
    try {
      await embedAndStore(makeChunks(5, 'wd'), {
        tableName: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        truncate: true,
        db,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).not.toBeNull();
    const vecCount = (db.prepare('SELECT COUNT(*) as n FROM imsbc_vec').get() as any).n;
    const ftsCount = (db.prepare('SELECT COUNT(*) as n FROM imsbc_fts').get() as any).n;

    // STRICT: a wrong-dim mid-batch must roll back the entire batch.
    // Today: vec=2 (chunks 1+2 committed before chunk 3 throws), fts=2 → mismatched
    // OR equal but not zero. Either way, the batch is partially written —
    // contract violated. Test passes only if both counters are zero.
    expect(vecCount).toBe(0);
    expect(ftsCount).toBe(0);
  });
});
