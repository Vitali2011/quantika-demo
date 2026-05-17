/**
 * Issue #177: BUNKER_ROTTERDAM + EUA indicators added to /api/market/benchmark.
 */
import { GET } from '@/app/api/market/benchmark/route';

const mockGetDatabase = jest.fn();
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: mockGetDatabase })),
}));

const mockGetLatestBunkerPrice = jest.fn();
jest.mock('@/lib/market/bunker-repository', () => ({
  getLatestBunkerPrice: (...args: unknown[]) => mockGetLatestBunkerPrice(...args),
}));

const mockGetLatestEuaPrice = jest.fn();
jest.mock('@/lib/market/eua-repository', () => ({
  getLatestEuaPrice: (...args: unknown[]) => mockGetLatestEuaPrice(...args),
}));

jest.mock('@/lib/market/baltic-repository', () => ({
  getLatestBalticIndex: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/market/benchmark', () => ({
  getCurrentBenchmark: jest.fn().mockResolvedValue(null),
}));

function makeRequest(indicator?: string): Request {
  const url = indicator
    ? `http://localhost/api/market/benchmark?indicator=${indicator}`
    : 'http://localhost/api/market/benchmark';
  return new Request(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDatabase.mockReturnValue({});
});

describe('GET /api/market/benchmark — BUNKER_ROTTERDAM (issue #177)', () => {
  const BUNKER_ROW = {
    port_unlocode: 'NLRTM',
    fuel_grade: 'VLSFO',
    price_usd_per_mt: 620,
    price_date: '2026-05-15',
    source: 'https://shipandbunker.com',
    fetched_at: new Date().toISOString(),
  };

  it('R-177-1: ?indicator=BUNKER_ROTTERDAM → 200 with value and unit USD/MT', async () => {
    mockGetLatestBunkerPrice.mockReturnValue(BUNKER_ROW);

    const res = await GET(makeRequest('BUNKER_ROTTERDAM'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.indicator).toBe('BUNKER_ROTTERDAM');
    expect(json.value).toBe(620);
    expect(json.unit).toBe('USD/MT');
  });

  it('R-177-2: BUNKER_ROTTERDAM queries NLRTM + VLSFO from DB', async () => {
    mockGetLatestBunkerPrice.mockReturnValue(BUNKER_ROW);

    await GET(makeRequest('BUNKER_ROTTERDAM'));

    expect(mockGetLatestBunkerPrice).toHaveBeenCalledWith(expect.anything(), 'NLRTM', 'VLSFO');
  });

  it('R-177-3: BUNKER_ROTTERDAM with no DB row → 404', async () => {
    mockGetLatestBunkerPrice.mockReturnValue(null);

    const res = await GET(makeRequest('BUNKER_ROTTERDAM'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/market/benchmark — EUA (issue #177)', () => {
  const EUA_ROW = {
    price_date: '2026-05-15',
    price_eur_per_tco2: 65.4,
    contract_type: 'spot',
    source: 'https://ember-climate.org',
    fetched_at: new Date().toISOString(),
  };

  it('R-177-4: ?indicator=EUA → 200 with value and unit EUR/tCO₂', async () => {
    mockGetLatestEuaPrice.mockReturnValue(EUA_ROW);

    const res = await GET(makeRequest('EUA'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.indicator).toBe('EUA');
    expect(json.value).toBe(65.4);
    expect(json.unit).toBe('EUR/tCO₂');
  });

  it('R-177-5: EUA with no DB row → 404', async () => {
    mockGetLatestEuaPrice.mockReturnValue(null);

    const res = await GET(makeRequest('EUA'));
    expect(res.status).toBe(404);
  });
});
