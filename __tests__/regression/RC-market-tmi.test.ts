/**
 * RC-market-tmi.test.ts
 *
 * Regression test for F-03: GET /api/market/tmi alias route.
 *
 * Covers:
 * - 404 when market_indices table has no tmi rows
 * - 200 with { value: number, date: string, unit: string } when data present
 */

import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';
import { upsertIndex } from '@/lib/market/market-indices-repository';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/market/tmi', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    migration027.up(testDb);
    jest.resetModules();
  });

  afterEach(() => {
    testDb.close();
  });

  it('returns 404 when table is empty', async () => {
    const { GET } = await import('@/app/api/market/tmi/route');
    const req = new Request('http://localhost/api/market/tmi');
    const res = await GET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 200 with value as number when data present', async () => {
    upsertIndex(testDb, {
      id: 'tmi-2026-05-13',
      index_name: 'tmi',
      index_date: '2026-05-13',
      value: 5200,
      unit: 'USD/day',
      source: 'seed-synthetic',
      fetched_at: new Date().toISOString(),
    });

    const { GET } = await import('@/app/api/market/tmi/route');
    const req = new Request('http://localhost/api/market/tmi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.value).toBe('number');
    expect(json).toHaveProperty('date');
    expect(json).toHaveProperty('unit');
  });

  it('returns the most recent tmi row (boundary: multiple rows)', async () => {
    const rows = [
      { id: 'tmi-2026-05-11', date: '2026-05-11', value: 4800 },
      { id: 'tmi-2026-05-13', date: '2026-05-13', value: 5200 },
      { id: 'tmi-2026-05-12', date: '2026-05-12', value: 5000 },
    ];
    for (const r of rows) {
      upsertIndex(testDb, {
        id: r.id,
        index_name: 'tmi',
        index_date: r.date,
        value: r.value,
        unit: 'USD/day',
        source: 'seed-synthetic',
        fetched_at: new Date().toISOString(),
      });
    }

    const { GET } = await import('@/app/api/market/tmi/route');
    const req = new Request('http://localhost/api/market/tmi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(5200);
    expect(json.date).toBe('2026-05-13');
  });
});
