import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/market/baltic-kpi', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    migration019.up(testDb);
  });

  afterEach(() => {
    testDb.close();
    jest.resetModules();
  });

  it('returns 400 when code param is missing', async () => {
    const { GET } = await import('@/app/api/market/baltic-kpi/route');
    const req = new Request('http://localhost/api/market/baltic-kpi');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid code/i);
  });

  it('returns 400 for unknown code', async () => {
    const { GET } = await import('@/app/api/market/baltic-kpi/route');
    const req = new Request('http://localhost/api/market/baltic-kpi?code=UNKNOWN');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when DB has no data for valid code', async () => {
    const { GET } = await import('@/app/api/market/baltic-kpi/route');
    const req = new Request('http://localhost/api/market/baltic-kpi?code=BDI');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns value, unit, period for seeded BDI row', async () => {
    testDb
      .prepare(
        `INSERT INTO baltic_indices (index_code, value, price_date, source)
         VALUES (?, ?, ?, ?)`,
      )
      .run('BDI', 1850, '2026-05-20', 'test-seed');

    const { GET } = await import('@/app/api/market/baltic-kpi/route');
    const req = new Request('http://localhost/api/market/baltic-kpi?code=BDI');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(1850);
    expect(json.unit).toBe('points');
    expect(json.period).toBe('2026-05-20');
  });

  it('returns most recent row when multiple dates exist', async () => {
    const insert = testDb.prepare(
      `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?, ?, ?, ?)`,
    );
    insert.run('BCI', 1600, '2026-05-18', 'test');
    insert.run('BCI', 1750, '2026-05-20', 'test');
    insert.run('BCI', 1400, '2026-05-15', 'test');

    const { GET } = await import('@/app/api/market/baltic-kpi/route');
    const req = new Request('http://localhost/api/market/baltic-kpi?code=BCI');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(1750);
    expect(json.period).toBe('2026-05-20');
  });

  it('accepts lowercase code and normalises it (BHsi → BHSI)', async () => {
    testDb
      .prepare(
        `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?, ?, ?, ?)`,
      )
      .run('BHSI', 650, '2026-05-20', 'test');

    const { GET } = await import('@/app/api/market/baltic-kpi/route');
    const req = new Request('http://localhost/api/market/baltic-kpi?code=bhsi');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(650);
  });
});
