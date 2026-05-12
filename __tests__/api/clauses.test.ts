/**
 * RED tests for /api/knowledge/clauses route (spec gamma-09)
 * Input contract coverage from .specs/gamma-09-input-contracts.md
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import migration029 from '@/lib/migrations/029-bimco-rag';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

// Mock environment variable for feature flag
const originalEnv = process.env;

describe('GET /api/knowledge/clauses', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    migration029.up(db);
    testDb = db;

    // Reset env before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    db.close();
    process.env = originalEnv;
  });

  // TC-API-01: Flag disabled → return 503
  it('returns 503 when BIMCO_RAG_ENABLED is not true', async () => {
    process.env.BIMCO_RAG_ENABLED = 'false';

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=laytime');
    const res = await GET(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  // TC-API-02: Flag enabled → process request
  it('returns 200 when BIMCO_RAG_ENABLED is true', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    // Insert test data
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'Laytime shall commence upon tender of Notice of Readiness',
      JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: '8' }),
    );

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=laytime');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(Array.isArray(json.results)).toBe(true);
  });

  // TC-API-03: Missing query param → return all clauses or 400
  it('handles missing query param gracefully', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses');
    const res = await GET(req);

    // Should either return 200 with all results or 400 for missing param
    expect([200, 400]).toContain(res.status);
  });

  // TC-API-04: Empty query param → return all clauses
  it('handles empty query param', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    // Insert test data
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'Test clause content',
      JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: '1' }),
    );

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=');
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  // TC-API-05: Invalid limit (negative) → clamp to default or reject
  it('handles invalid limit (-1)', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=test&limit=-1');
    const res = await GET(req);

    // Should not crash, either clamps to valid value or returns 400
    expect([200, 400]).toContain(res.status);
  });

  // TC-API-06: Invalid limit (NaN) → clamp to default or reject
  it('handles invalid limit (NaN)', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=test&limit=invalid');
    const res = await GET(req);

    // Should not crash
    expect([200, 400]).toContain(res.status);
  });

  // TC-API-07: Limit > max → clamp to max (100)
  it('clamps limit to maximum value', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    // Insert many test rows
    for (let i = 0; i < 150; i++) {
      db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
        `Test clause ${i}`,
        JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: `${i}` }),
      );
    }

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=test&limit=1000');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    // Should not return more than 100 results
    expect(json.results.length).toBeLessThanOrEqual(100);
  });

  // TC-API-08: Invalid cp filter → return empty array
  it('returns empty results for invalid charter party filter', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    // Insert test data with GENCON 2022
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'Test clause',
      JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: '1' }),
    );

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=test&cp=INVALID');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(0);
  });

  // TC-API-09: Charter party filter works correctly
  it('filters by charter party correctly', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    // Insert test data for different charter parties
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'GENCON clause',
      JSON.stringify({ charterParty: 'GENCON 2022', clauseNumber: '1' }),
    );
    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'HEAVYCON clause',
      JSON.stringify({ charterParty: 'HEAVYCON', clauseNumber: '1' }),
    );

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=clause&cp=GENCON+2022');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();

    // All results should be GENCON 2022
    json.results.forEach((result: any) => {
      const metadata = JSON.parse(result.metadata);
      expect(metadata.charterParty).toBe('GENCON 2022');
    });
  });

  // TC-API-10: SQL injection attempt → parameterized, safe
  it('is safe from SQL injection attempts', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request("http://localhost:3000/api/knowledge/clauses?q='; DROP TABLE bimco_fts; --");

    // Should not throw or drop the table
    await expect(GET(req)).resolves.not.toThrow();

    // Verify table still exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bimco_fts'").all();
    expect(tables).toHaveLength(1);
  });

  // TC-API-11: Result structure validation
  it('returns correct result structure', async () => {
    process.env.BIMCO_RAG_ENABLED = 'true';

    db.prepare('INSERT INTO bimco_fts (content, metadata) VALUES (?, ?)').run(
      'Test clause content',
      JSON.stringify({
        charterParty: 'GENCON 2022',
        clauseNumber: '1',
        title: 'Test Title',
      }),
    );

    const { GET } = await import('@/app/api/knowledge/clauses/route');
    const req = new Request('http://localhost:3000/api/knowledge/clauses?q=test');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('results');

    if (json.results.length > 0) {
      const result = json.results[0];
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('metadata');
      expect(typeof result.content).toBe('string');
      expect(typeof result.metadata).toBe('string');
    }
  });
});
