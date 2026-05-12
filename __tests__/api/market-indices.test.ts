import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';
import { upsertIndex, type MarketIndexRow } from '@/lib/market/market-indices-repository';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

const originalEnv = process.env;

describe('GET /api/market/indices', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration027.up(db);
    testDb = db;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    db.close();
    process.env = originalEnv;
  });

  it('returns 503 when flag disabled', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'false';
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=bhsi');
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it('returns 503 when flag undefined (boundary: undefined)', async () => {
    delete process.env.MARKET_BENCHMARK_FULL_ENABLED;
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=bhsi');
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it('returns 503 when flag is empty string (boundary: empty)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = '';
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=bhsi');
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it('returns data when flag enabled', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const row: MarketIndexRow = {
      id: 'bhsi-2026-05-10',
      index_name: 'bhsi',
      index_date: '2026-05-10',
      value: 450,
      unit: 'USD/day',
      source: 'baltic-exchange',
      fetched_at: new Date().toISOString(),
    };
    upsertIndex(db, row);

    const req = new Request('http://localhost/api/market/indices?name=bhsi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
    expect(json[0]).toHaveProperty('index_date');
    expect(json[0]).toHaveProperty('value');
    expect(json[0]).toHaveProperty('unit');
    expect(json[0]).toHaveProperty('source');
  });

  it('returns empty array for unknown index', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const req = new Request('http://localhost/api/market/indices?name=invalid-index');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toEqual([]);
  });

  it('returns 400 when name param missing (boundary: missing)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const req = new Request('http://localhost/api/market/indices');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('name required');
  });

  it('returns 400 when name is empty string (boundary: empty)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const req = new Request('http://localhost/api/market/indices?name=');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('name required');
  });

  it('returns 400 when days is negative (boundary: negative)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const req = new Request('http://localhost/api/market/indices?name=bhsi&days=-1');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('days must be positive integer');
  });

  it('returns 400 when days is not a number (boundary: NaN)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const req = new Request('http://localhost/api/market/indices?name=bhsi&days=abc');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('days must be positive integer');
  });

  it('returns 400 when days is zero (boundary: zero)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const req = new Request('http://localhost/api/market/indices?name=bhsi&days=0');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('days must be positive integer');
  });

  it('respects days parameter', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    for (let i = 1; i <= 5; i++) {
      upsertIndex(db, {
        id: `tmi-2026-05-${String(i).padStart(2, '0')}`,
        index_name: 'tmi',
        index_date: `2026-05-${String(i).padStart(2, '0')}`,
        value: 500 + i * 10,
        unit: 'USD/day',
        source: 'manual-csv',
        fetched_at: new Date().toISOString(),
      });
    }

    const req = new Request('http://localhost/api/market/indices?name=tmi&days=3');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(3);
  });

  it('defaults to 30 days when days param omitted', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    for (let i = 1; i <= 40; i++) {
      upsertIndex(db, {
        id: `bhsi-2026-04-${String(i).padStart(2, '0')}`,
        index_name: 'bhsi',
        index_date: `2026-04-${String(i).padStart(2, '0')}`,
        value: 400 + i,
        unit: 'USD/day',
        source: 'baltic-exchange',
        fetched_at: new Date().toISOString(),
      });
    }

    const req = new Request('http://localhost/api/market/indices?name=bhsi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(30);
  });
});
