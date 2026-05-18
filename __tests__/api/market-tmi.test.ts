/**
 * Tests for GET /api/market/tmi
 *
 * Returns latest TMI (Tank Market Index) value from the market_indices table.
 * No auth required.
 */

import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import migration027 from '@/lib/migrations/027-market-indices';
import { upsertIndex } from '@/lib/market/market-indices-repository';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/market/tmi', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration027.up(db);
    testDb = db;
    jest.resetModules();
  });

  afterEach(() => {
    db.close();
  });

  it('returns 404 when DB is empty (no TMI data)', async () => {
    const { GET } = await import('@/app/api/market/tmi/route');
    const res = await GET(new Request('http://localhost/api/market/tmi'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('No TMI data');
  });

  it('returns 200 with value, date, and unit when TMI data is seeded', async () => {
    upsertIndex(db, {
      id: 'tmi-2026-05-10',
      index_name: 'tmi',
      index_date: '2026-05-10',
      value: 12500,
      unit: 'USD/day',
      source: 'toepfer',
      fetched_at: new Date().toISOString(),
    });

    const { GET } = await import('@/app/api/market/tmi/route');
    const res = await GET(new Request('http://localhost/api/market/tmi'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(12500);
    expect(json.date).toBe('2026-05-10');
    expect(json.unit).toBe('USD/day');
  });

  it('returns 404 when only non-tmi data exists (confirms filter)', async () => {
    upsertIndex(db, {
      id: 'bhsi-2026-05-10',
      index_name: 'bhsi',
      index_date: '2026-05-10',
      value: 1200,
      unit: 'USD/day',
      source: 'baltic-exchange',
      fetched_at: new Date().toISOString(),
    });

    const { GET } = await import('@/app/api/market/tmi/route');
    const res = await GET(new Request('http://localhost/api/market/tmi'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('No TMI data');
  });
});
