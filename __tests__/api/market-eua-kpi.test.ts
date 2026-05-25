import Database from 'better-sqlite3';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/market/eua-kpi', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    migration024.up(testDb);
  });

  afterEach(() => {
    testDb.close();
    jest.resetModules();
  });

  it('returns 404 when DB has no EUA data', async () => {
    testDb.exec('DELETE FROM eua_prices');
    const { GET } = await import('@/app/api/market/eua-kpi/route');
    const req = new Request('http://localhost/api/market/eua-kpi');
    const res = await GET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/no eua data/i);
  });

  it('returns value, unit, period for seeded spot row', async () => {
    const { GET } = await import('@/app/api/market/eua-kpi/route');
    const req = new Request('http://localhost/api/market/eua-kpi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(72.65);
    expect(json.unit).toBe('€/tCO₂');
    expect(json.period).toBe('2026-05-04');
  });

  it('returns most recent row when multiple dates exist', async () => {
    testDb
      .prepare(
        `INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at)
         VALUES (?, ?, 'spot', 'test', datetime('now'))`,
      )
      .run('2026-05-20', 75.10);

    const { GET } = await import('@/app/api/market/eua-kpi/route');
    const req = new Request('http://localhost/api/market/eua-kpi');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(75.10);
    expect(json.period).toBe('2026-05-20');
  });
});
