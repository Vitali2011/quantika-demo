import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
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
    const req = new Request('http://localhost/api/market/indices?name=tmi');
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it('returns 503 when flag undefined (boundary: undefined)', async () => {
    delete process.env.MARKET_BENCHMARK_FULL_ENABLED;
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=tmi');
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it('returns 503 when flag is empty string (boundary: empty)', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = '';
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=tmi');
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it('returns data when flag enabled', async () => {
    process.env.MARKET_BENCHMARK_FULL_ENABLED = 'true';
    const { GET } = await import('@/app/api/market/indices/route');

    const row: MarketIndexRow = {
      id: 'tmi-2026-05-10',
      index_name: 'tmi',
      index_date: '2026-05-10',
      value: 450,
      unit: 'USD/day',
      source: 'manual-csv',
      fetched_at: new Date().toISOString(),
    };
    upsertIndex(db, row);

    const req = new Request('http://localhost/api/market/indices?name=tmi');
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
        id: `tmi-2026-04-${String(i).padStart(2, '0')}`,
        index_name: 'tmi',
        index_date: `2026-04-${String(i).padStart(2, '0')}`,
        value: 400 + i,
        unit: 'USD/day',
        source: 'manual-csv',
        fetched_at: new Date().toISOString(),
      });
    }

    const req = new Request('http://localhost/api/market/indices?name=tmi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(30);
  });
});

// ── #544 BDI history: Baltic codes served from baltic_indices ────────────────

describe('GET /api/market/indices — Baltic code history (#544)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration019.up(db); // creates baltic_indices (+ port_master)
    migration027.up(db); // creates market_indices (needed by route imports)
    testDb = db;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    db.close();
    process.env = originalEnv;
  });

  it('returns BDI history from baltic_indices without flag check', async () => {
    delete process.env.MARKET_BENCHMARK_FULL_ENABLED;
    db.prepare(
      `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?, ?, ?, ?)`
    ).run('BDI', 1450, '2026-05-09', 'baltic-exchange');
    db.prepare(
      `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?, ?, ?, ?)`
    ).run('BDI', 1428, '2026-05-08', 'baltic-exchange');

    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=bdi&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(2);
    expect(json[0]).toMatchObject({ index_date: '2026-05-09', value: 1450, unit: 'points' });
    expect(json[1]).toMatchObject({ index_date: '2026-05-08', value: 1428, unit: 'points' });
  });

  it('accepts Baltic code case-insensitively (bci lowercase matches BCI in DB)', async () => {
    db.prepare(
      `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?, ?, ?, ?)`
    ).run('BCI', 3200, '2026-05-09', 'baltic-exchange');

    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=bci&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ index_date: '2026-05-09', value: 3200, unit: 'points' });
  });

  it('returns empty array when no Baltic history exists (not 404)', async () => {
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=bdi&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

// ── Bunker/EUA codes served from native tables (no flag gate) ────────────────

describe('GET /api/market/indices — bunker and EUA history', () => {
  let db: Database.Database;
  const originalEnvLocal = process.env;

  beforeEach(() => {
    db = new Database(':memory:');
    migration019.up(db);
    migration023.up(db);
    migration024.up(db);
    migration027.up(db);
    testDb = db;
    process.env = { ...originalEnvLocal };
  });

  afterEach(() => {
    db.close();
    process.env = originalEnvLocal;
  });

  it('returns VLSFO history from bunker_prices without flag gate', async () => {
    delete process.env.MARKET_BENCHMARK_FULL_ENABLED;
    db.prepare(
      `INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at)
       VALUES ('NLRTM', 'VLSFO', 700, '2026-05-10', 'test', datetime('now'))`
    ).run();

    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=vlsfo&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
    const newest = json[0];
    expect(newest).toMatchObject({ index_date: '2026-05-10', value: 700, unit: 'USD/mt' });
  });

  it('returns MGO history from bunker_prices without flag gate', async () => {
    delete process.env.MARKET_BENCHMARK_FULL_ENABLED;
    db.prepare(
      `INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at)
       VALUES ('NLRTM', 'MGO', 1200, '2026-05-10', 'test', datetime('now'))`
    ).run();

    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=mgo&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ value: 1200, unit: 'USD/mt' });
  });

  it('returns EUA history from eua_prices without flag gate', async () => {
    delete process.env.MARKET_BENCHMARK_FULL_ENABLED;
    db.prepare(
      `INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at)
       VALUES ('2026-05-10', 78.2, 'spot', 'test', datetime('now'))`
    ).run();

    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=eua&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
    expect(json[0]).toMatchObject({ value: 78.2, unit: '€/tCO₂' });
  });

  it('returns empty array for vlsfo when no data (not 404)', async () => {
    db.exec(`DELETE FROM bunker_prices WHERE fuel_grade = 'VLSFO'`);
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=vlsfo&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns empty array for eua when no data (not 404)', async () => {
    db.exec(`DELETE FROM eua_prices`);
    const { GET } = await import('@/app/api/market/indices/route');
    const req = new Request('http://localhost/api/market/indices?name=eua&days=30');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});
