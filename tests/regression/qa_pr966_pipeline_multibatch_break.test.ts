/**
 * COLD-START QA adversarial breaker — PR #966 (reverent-hamilton-edd6de)
 * Target: lib/knowledge/embeddings/pipeline.ts — per-batch db.transaction fix.
 *
 * The PR wraps each MAX_BATCH_SIZE(250) batch in its OWN db.transaction. The
 * fix's claimed contract is "vec0 and FTS5 row counts can never diverge".
 * These tests attack that contract directly:
 *
 *  X1: a >250-chunk corpus where the SECOND batch faults mid-row. Earlier
 *      batches are already committed (per-batch atomicity). The invariant that
 *      MUST survive is vec_count === fts_count (no split-brain). If the txn were
 *      missing or scoped wrong, batch-2 would leave vec rows without fts pairs.
 *
 *  X2: embedDocuments returns FEWER embeddings than chunks (length drift). The
 *      undefined embedding hits Array.from(undefined) -> throws INSIDE the txn.
 *      Whole batch must roll back: vec == fts == 0.
 *
 *  X3: NaN inside an embedding cell. JSON.stringify(Array.from) emits `null`
 *      for NaN; vec0 must either accept (count aligned) or reject (roll back).
 *      Either way vec MUST equal fts — never diverge.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';

let mockEmbedDocuments: jest.Mock<(texts: string[]) => Promise<Float32Array[]>>;
let embedAndStore: typeof import('@/lib/knowledge/embeddings/pipeline').embedAndStore;

function freshPipeline(): void {
  jest.resetModules();
  mockEmbedDocuments = jest.fn();
  jest.doMock('@/lib/knowledge/embeddings/client', () => ({
    embedDocuments: (texts: string[]) => mockEmbedDocuments(texts),
    embedQuery: () => { throw new Error('not expected'); },
  }));
  ({ embedAndStore } = require('@/lib/knowledge/embeddings/pipeline'));
}

function makeChunks(n: number): Chunk[] {
  return Array.from({ length: n }, (_, i) => ({
    content: `c-${i}`,
    metadata: { source: 'imsbc', section: `S${i}` },
  })) as Chunk[];
}

function newDb(): Database.Database {
  const db = new Database(':memory:');
  require('sqlite-vec').load(db);
  db.exec(`
    CREATE VIRTUAL TABLE imsbc_vec USING vec0(embedding FLOAT[768], content TEXT, metadata TEXT);
    CREATE VIRTUAL TABLE imsbc_fts USING fts5(content, metadata, tokenize='unicode61 remove_diacritics 1');
  `);
  return db;
}
const count = (db: Database.Database, t: string) =>
  (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n;

describe('PR#966 X — pipeline multi-batch atomicity invariant', () => {
  let db: Database.Database;
  beforeEach(() => { db = newDb(); freshPipeline(); });
  afterEach(() => { try { db.close(); } catch {} jest.restoreAllMocks(); });

  it('X1: 300 chunks (2 batches), 2nd batch FTS faults — vec_count MUST equal fts_count', async () => {
    // 300 chunks -> batch1=250, batch2=50. Each embedDocuments call returns the
    // right count of valid 768-dim vectors.
    mockEmbedDocuments
      .mockResolvedValueOnce(Array.from({ length: 250 }, () => new Float32Array(768).fill(0.01)))
      .mockResolvedValueOnce(Array.from({ length: 50 }, () => new Float32Array(768).fill(0.02)));

    // Inject an FTS fault on the 270th overall fts insert (i.e. 20th of batch 2).
    let ftsCalls = 0;
    const realPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const real = realPrepare(sql);
      if (sql.includes('INTO imsbc_fts')) {
        return new Proxy(real, {
          get(t, p) {
            if (p === 'run') return (...a: unknown[]) => {
              ftsCalls += 1;
              if (ftsCalls === 270) throw new Error('FTS fault in batch 2');
              return (t as any).run(...a);
            };
            return (t as any)[p];
          },
        });
      }
      return real;
    }) as typeof db.prepare;

    let threw = false;
    try {
      await embedAndStore(makeChunks(300), { tableName: 'imsbc_vec', ftsTable: 'imsbc_fts', truncate: true, db });
    } catch { threw = true; }

    expect(threw).toBe(true);
    const v = count(db, 'imsbc_vec');
    const f = count(db, 'imsbc_fts');
    // Batch 1 (250) committed fully; batch 2 rolled back entirely. The hard
    // invariant: no vec row lacks an fts pair. vec === fts (expected 250 === 250).
    expect(v).toBe(f);
    expect(v).toBe(250);
  });

  it('X2: embedDocuments returns 4 vectors for 5 chunks — undefined embed must roll the batch back to 0/0', async () => {
    mockEmbedDocuments.mockResolvedValueOnce(
      Array.from({ length: 4 }, () => new Float32Array(768).fill(0.03)), // one short
    );
    let threw = false;
    try {
      await embedAndStore(makeChunks(5), { tableName: 'imsbc_vec', ftsTable: 'imsbc_fts', truncate: true, db });
    } catch { threw = true; }
    expect(threw).toBe(true);
    expect(count(db, 'imsbc_vec')).toBe(0);
    expect(count(db, 'imsbc_fts')).toBe(0);
  });

  it('X3: NaN cell in an embedding — vec_count MUST equal fts_count (no split-brain)', async () => {
    const bad = new Float32Array(768).fill(0.04);
    bad[5] = NaN;
    mockEmbedDocuments.mockResolvedValueOnce([
      new Float32Array(768).fill(0.04),
      bad,
      new Float32Array(768).fill(0.04),
    ]);
    let threw = false;
    try {
      await embedAndStore(makeChunks(3), { tableName: 'imsbc_vec', ftsTable: 'imsbc_fts', truncate: true, db });
    } catch { threw = true; }
    // Whether vec0 accepts JSON-null cells or rejects them, the counts must agree.
    expect(count(db, 'imsbc_vec')).toBe(count(db, 'imsbc_fts'));
  });
});
