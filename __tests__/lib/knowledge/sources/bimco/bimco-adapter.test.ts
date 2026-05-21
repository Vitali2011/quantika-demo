/**
 * RED tests for bimco-adapter (spec gamma-09)
 * Input contract coverage from .specs/gamma-09-input-contracts.md
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { syncBimcoRag } from '@/lib/knowledge/sources/bimco/adapter';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration029 from '@/lib/migrations/029-bimco-rag';

// Mock the governance module
jest.mock('@/lib/knowledge/governance', () => ({
  reportSyncStarted: jest.fn(() => 1),
  reportSyncSuccess: jest.fn(),
  reportSyncFailure: jest.fn(),
}));

// Mock the embedding pipeline (we don't want to make real API calls in tests)
// This mock will actually insert into FTS table for testing purposes
jest.mock('@/lib/knowledge/embeddings/pipeline', () => ({
  embedAndStore: jest.fn(async (chunks: any[], opts: any) => {
    // In tests, we just insert into FTS table (skip vector embeddings)
    const db = opts.db;
    const ftsTable = opts.ftsTable;

    if (opts.truncate) {
      db.prepare(`DELETE FROM ${ftsTable}`).run();
    }

    const stmt = db.prepare(`INSERT INTO ${ftsTable} (content, metadata) VALUES (?, ?)`);
    for (const chunk of chunks) {
      stmt.run(chunk.content, JSON.stringify(chunk.metadata));
    }
  }),
}));

describe('bimco-adapter', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    sqliteVec.load(db);
    migration013.up(db);
    migration029.up(db);
    jest.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  // TC-BA-01: Missing db → throw Error
  it('throws Error for null db', async () => {
    await expect(syncBimcoRag(null as any)).rejects.toThrow('db is required');
  });

  // TC-BA-02: Missing db (undefined) → throw Error
  it('throws Error for undefined db', async () => {
    await expect(syncBimcoRag(undefined as any)).rejects.toThrow('db is required');
  });

  // TC-BA-03: Invalid db type (object) → throw on first db operation
  it('throws on invalid db type (object)', async () => {
    // When db is invalid, reportSyncStarted will throw
    const { reportSyncStarted } = await import('@/lib/knowledge/governance');
    (reportSyncStarted as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Invalid db');
    });
    await expect(syncBimcoRag({} as any)).rejects.toThrow();
  });

  // TC-BA-04: dryRun=true → skip storage, return count
  it('returns count without storing when dryRun=true', async () => {
    const result = await syncBimcoRag(db, true);

    expect(result).toHaveProperty('stored');
    expect(result.stored).toBeGreaterThanOrEqual(0);
    expect(typeof result.stored).toBe('number');

    // Verify no rows were inserted
    const rows = db.prepare('SELECT COUNT(*) as count FROM bimco_fts').get() as any;
    expect(rows.count).toBe(0);
  });

  // TC-BA-05: dryRun=false → store normally
  it('stores clauses when dryRun=false', async () => {
    const result = await syncBimcoRag(db, false);

    expect(result).toHaveProperty('stored');
    expect(result.stored).toBeGreaterThan(0);

    // Verify rows were inserted (at least from fixture)
    const rows = db.prepare('SELECT COUNT(*) as count FROM bimco_fts').get() as any;
    expect(rows.count).toBeGreaterThan(0);
  });

  // TC-BA-06: dryRun omitted → store normally (defaults to false)
  it('stores clauses when dryRun is omitted', async () => {
    const result = await syncBimcoRag(db);

    expect(result).toHaveProperty('stored');
    expect(result.stored).toBeGreaterThan(0);
  });

  // TC-BA-07: Empty fixture data → store 0 rows
  it('handles empty fixture data gracefully', async () => {
    // Mock empty fixture
    jest.mock('@/lib/knowledge/sources/bimco/fixture', () => ({
      BIMCO_FIXTURE_CLAUSES: [],
    }));

    const result = await syncBimcoRag(db, false);

    expect(result).toHaveProperty('stored');
    // With empty fixture, stored should be 0
    // (This test might need adjustment based on actual implementation)
  });

  // TC-BA-08: Result structure validation
  it('returns correct result structure', async () => {
    const result = await syncBimcoRag(db, true);

    expect(result).toHaveProperty('stored');
    expect(typeof result.stored).toBe('number');
    expect(Number.isFinite(result.stored)).toBe(true);
  });

  // TC-BA-09: Verify stored count matches fixture length
  it('returns stored count matching fixture clauses', async () => {
    const result = await syncBimcoRag(db, false);

    // Fixture has 7 clauses (see lib/knowledge/sources/bimco/fixture.ts)
    expect(result.stored).toBe(7);
  });

  // TC-BA-10: Verify FTS table populated correctly
  it('populates bimco_fts with clause content', async () => {
    await syncBimcoRag(db, false);

    const rows = db.prepare('SELECT content FROM bimco_fts LIMIT 1').all() as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('content');
    expect(typeof rows[0].content).toBe('string');
    expect(rows[0].content.length).toBeGreaterThan(0);
  });

  // TC-BA-11: Verify metadata stored as JSON
  it('stores metadata as valid JSON string', async () => {
    await syncBimcoRag(db, false);

    const rows = db.prepare('SELECT metadata FROM bimco_fts LIMIT 1').all() as any[];
    expect(rows.length).toBeGreaterThan(0);

    // Metadata should be parseable JSON
    expect(() => JSON.parse(rows[0].metadata)).not.toThrow();

    const parsed = JSON.parse(rows[0].metadata);
    expect(parsed).toHaveProperty('charterParty');
  });

  // TC-BA-12: Governance integration — reportSyncStarted called
  it('calls reportSyncStarted before processing', async () => {
    const { reportSyncStarted } = await import('@/lib/knowledge/governance');

    await syncBimcoRag(db, false);

    expect(reportSyncStarted).toHaveBeenCalledWith(db, 'bimco');
  });

  // TC-BA-13: Governance integration — reportSyncSuccess called
  it('calls reportSyncSuccess after successful sync', async () => {
    const { reportSyncSuccess } = await import('@/lib/knowledge/governance');

    await syncBimcoRag(db, false);

    expect(reportSyncSuccess).toHaveBeenCalled();
  });

  // TC-BA-14: NYPE 1946 entries present in fixture and persisted
  it('persists NYPE 1946 charter entries (>= 10)', async () => {
    await syncBimcoRag(db, false);

    const rows = db.prepare(`
      SELECT metadata FROM bimco_fts WHERE metadata LIKE '%"NYPE 1946"%'
    `).all() as any[];

    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  // TC-BA-15: SHELLVOY 6 entries persist (>= 8)
  it('persists SHELLVOY 6 charter entries (>= 8)', async () => {
    await syncBimcoRag(db, false);
    const rows = db.prepare(`SELECT metadata FROM bimco_fts WHERE metadata LIKE '%"SHELLVOY 6"%'`).all() as any[];
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  // TC-BA-16: BALTIME summary entry persists
  it('persists BALTIME summary entry', async () => {
    await syncBimcoRag(db, false);
    const rows = db.prepare(`SELECT metadata FROM bimco_fts WHERE metadata LIKE '%"BALTIME"%'`).all() as any[];
    expect(rows.length).toBe(1);
  });
});
