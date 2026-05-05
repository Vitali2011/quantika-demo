import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import { registerSource, reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '@/lib/knowledge/governance';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

import { GET } from '@/app/api/health/knowledge/route';

describe('GET /api/health/knowledge', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);

    testDb = db;
  });

  afterEach(() => {
    db.close();
  });

  it('returns 200 when all sources are healthy', async () => {
    registerSource(db, {
      slug: 'test-src',
      name: 'Test Source',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 7,
      refresh_mode: 'manual',
    });
    const id = reportSyncStarted(db, 'test-src');
    reportSyncSuccess(db, id, { rowsChanged: 1 });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
  });

  it('returns 503 when any source is failing', async () => {
    registerSource(db, {
      slug: 'test-src',
      name: 'Test Source',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 7,
      refresh_mode: 'manual',
    });

    // Force 3 consecutive failures
    for (let i = 0; i < 3; i++) {
      const id = reportSyncStarted(db, 'test-src');
      reportSyncFailure(db, id, new Error('test failure'));
    }

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('degraded');
  });

  it('returns summary counts in response', async () => {
    registerSource(db, {
      slug: 'fresh-src',
      name: 'Fresh Source',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 7,
      refresh_mode: 'manual',
    });
    registerSource(db, {
      slug: 'stale-src',
      name: 'Stale Source',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 1,
      refresh_mode: 'manual',
    });

    const id = reportSyncStarted(db, 'fresh-src');
    reportSyncSuccess(db, id, { rowsChanged: 1 });

    const res = await GET();
    const json = await res.json();
    expect(json).toHaveProperty('sources_total');
    expect(json).toHaveProperty('sources_fresh');
    expect(json).toHaveProperty('sources_stale');
    expect(json).toHaveProperty('sources_failed');
    expect(json).toHaveProperty('timestamp');
    expect(json.sources_total).toBe(2);
  });

  it('returns 200 with empty DB (0 sources)', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.sources_total).toBe(0);
    expect(json.sources_fresh).toBe(0);
    expect(json.sources_stale).toBe(0);
    expect(json.sources_failed).toBe(0);
  });

  it('returns 200 when all sources are never_synced', async () => {
    registerSource(db, {
      slug: 'never-synced',
      name: 'Never Synced',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 7,
      refresh_mode: 'manual',
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.sources_stale).toBeGreaterThan(0);
  });

  it('returns 200 when sources are overdue but not failing', async () => {
    registerSource(db, {
      slug: 'overdue-src',
      name: 'Overdue Source',
      kind: 'structured_rows',
      category: 'reference',
      stale_threshold_days: 0, // Set to 0 so any sync becomes immediately stale
      refresh_mode: 'manual',
    });

    const id = reportSyncStarted(db, 'overdue-src');
    reportSyncSuccess(db, id, { rowsChanged: 1 });

    // Manually set last_synced_at to past to make it stale
    db.prepare("UPDATE knowledge_sources SET last_synced_at = datetime('now', '-10 days') WHERE slug = 'overdue-src'").run();

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('healthy');
  });

  it('no auth required (public endpoint)', async () => {
    const res = await GET();
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
