import Database from 'better-sqlite3';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

describe('GET /api/market/bunker-kpi', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    migration023.up(testDb);
  });

  afterEach(() => {
    testDb.close();
    jest.resetModules();
  });

  it('returns 400 when grade param is missing', async () => {
    const { GET } = await import('@/app/api/market/bunker-kpi/route');
    const req = new Request('http://localhost/api/market/bunker-kpi');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid grade/i);
  });

  it('returns 400 for unknown grade', async () => {
    const { GET } = await import('@/app/api/market/bunker-kpi/route');
    const req = new Request('http://localhost/api/market/bunker-kpi?grade=IFO380');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when DB has no NLRTM data for grade', async () => {
    testDb.prepare('DELETE FROM bunker_prices WHERE port_unlocode = ?').run('NLRTM');
    const { GET } = await import('@/app/api/market/bunker-kpi/route');
    const req = new Request('http://localhost/api/market/bunker-kpi?grade=VLSFO');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns value, unit, period for seeded VLSFO row', async () => {
    const { GET } = await import('@/app/api/market/bunker-kpi/route');
    const req = new Request('http://localhost/api/market/bunker-kpi?grade=VLSFO');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.value).toBe('number');
    expect(json.unit).toBe('USD/mt');
    expect(typeof json.period).toBe('string');
  });

  it('returns value for MGO grade', async () => {
    const { GET } = await import('@/app/api/market/bunker-kpi/route');
    const req = new Request('http://localhost/api/market/bunker-kpi?grade=MGO');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(1192);
    expect(json.unit).toBe('USD/mt');
  });

  it('accepts lowercase grade param', async () => {
    const { GET } = await import('@/app/api/market/bunker-kpi/route');
    const req = new Request('http://localhost/api/market/bunker-kpi?grade=vlsfo');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.value).toBe(791);
  });
});
