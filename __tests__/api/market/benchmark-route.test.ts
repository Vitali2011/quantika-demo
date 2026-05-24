/**
 * Integration tests for GET /api/market/benchmark route (spec-01).
 *
 * Route logic:
 * 1. DB-first: getLatestIndex(db, indexName) from market_indices for BHSI and TOEPFER_TMI
 * 2. Fallback: getCurrentBenchmark(indicator) (scraper for TMI)
 * 3. 404 if no data (not 503)
 * 4. stale=true if index_date is >7 days old
 *
 * Requirements:
 * - ?indicator=BHSI → 200 with value from market_indices
 * - ?indicator=TOEPFER_TMI → 200 with value from market_indices
 * - stale row (>7 days) → 200 with stale=true
 * - missing row → fallback to scraper or 404
 * - ?indicator=DREWRY_BREAKBULK → 404 (no data)
 * - no indicator → 400
 * - invalid indicator → 400
 */

import { GET } from '@/app/api/market/benchmark/route';

// ─── Mock session-store (server-only DB) ──────────────────────────────────────

const mockGetDatabase = jest.fn();
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: mockGetDatabase })),
}));

// ─── Mock market-indices-repository ───────────────────────────────────────────

const mockGetLatestIndex = jest.fn();
jest.mock('@/lib/market/market-indices-repository', () => ({
  getLatestIndex: (...args: unknown[]) => mockGetLatestIndex(...args),
}));

// ─── Mock getCurrentBenchmark (scraper fallback) ──────────────────────────────

const mockGetCurrentBenchmark = jest.fn();
jest.mock('@/lib/market/benchmark', () => ({
  getCurrentBenchmark: (...args: unknown[]) => mockGetCurrentBenchmark(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(indicator?: string): Request {
  const url = indicator
    ? `http://localhost/api/market/benchmark?indicator=${indicator}`
    : 'http://localhost/api/market/benchmark';
  return new Request(url);
}

const TODAY = new Date().toISOString().slice(0, 10);
const STALE_DATE = '2020-01-01';

const BHSI_ROW = { id: 'bhsi-2026-05-09', index_name: 'bhsi', index_date: '2026-05-09', value: 650, unit: 'USD/day', source: 'https://www.handybulk.com/', fetched_at: '2026-05-09T10:00:00.000Z' };
const TMI_ROW = { id: 'tmi-2026-05-09', index_name: 'tmi', index_date: '2026-05-09', value: 12683, unit: 'USD/day', source: 'static-seed', fetched_at: '2026-05-09T10:00:00.000Z' };

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDatabase.mockReturnValue({}); // mock DB handle (not used directly)
});

describe('GET /api/market/benchmark — DB path', () => {
  it('R-1: ?indicator=BHSI → 200 with value=650 from market_indices', async () => {
    mockGetLatestIndex.mockReturnValue(BHSI_ROW);

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(650);
    expect(json.indicator).toBe('BHSI');
    expect(json.unit).toBe('index');
  });

  it('R-2: ?indicator=TOEPFER_TMI → 200 with value=12683 from market_indices', async () => {
    mockGetLatestIndex.mockReturnValue(TMI_ROW);

    const res = await GET(makeRequest('TOEPFER_TMI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(12683);
    expect(json.indicator).toBe('TOEPFER_TMI');
    expect(json.unit).toBe('USD/day');
    // getCurrentBenchmark (scraper) should NOT be called when DB has the row
    expect(mockGetCurrentBenchmark).not.toHaveBeenCalled();
  });

  it('R-3: TOEPFER_TMI falls back to scraper when market_indices has no row', async () => {
    mockGetLatestIndex.mockReturnValue(null);
    const scraperBenchmark = {
      indicator: 'TOEPFER_TMI' as const,
      value: 13000,
      unit: 'USD/day',
      period: 'May 2026',
      sourceUrl: 'https://toepfer.com',
      fetchedAt: new Date().toISOString(),
    };
    mockGetCurrentBenchmark.mockResolvedValue(scraperBenchmark);

    const res = await GET(makeRequest('TOEPFER_TMI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(13000);
    expect(mockGetCurrentBenchmark).toHaveBeenCalledTimes(1);
  });

  it('R-9: recent row (today) → stale=false', async () => {
    mockGetLatestIndex.mockReturnValue({ ...BHSI_ROW, index_date: TODAY });

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.stale).toBe(false);
    expect(json.value).toBe(650);
  });

  it('R-10: stale row (>7 days) → stale=true, value still present', async () => {
    mockGetLatestIndex.mockReturnValue({ ...BHSI_ROW, index_date: STALE_DATE });

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.stale).toBe(true);
    expect(json.value).toBe(650);
  });
});

describe('GET /api/market/benchmark — null / error paths', () => {
  it('R-4: ?indicator=DREWRY_BREAKBULK → 404 (no DB row, scraper returns null)', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('DREWRY_BREAKBULK'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/DREWRY_BREAKBULK/);
  });

  it('R-5: BHSI with no market_indices row → 404 (no scraper fallback for BHSI)', async () => {
    mockGetLatestIndex.mockReturnValue(null);
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('BHSI'));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(503);
  });

  it('R-6: 404 response has descriptive error message', async () => {
    mockGetLatestIndex.mockReturnValue(null);
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
  });

  it('R-11: missing market_indices row (TOEPFER_TMI) → 404 when scraper also null', async () => {
    mockGetLatestIndex.mockReturnValue(null);
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('TOEPFER_TMI'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/market/benchmark — validation', () => {
  it('R-7: missing indicator → 400', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('R-8: invalid indicator → 400', async () => {
    const res = await GET(makeRequest('INVALID_INDICATOR'));
    expect(res.status).toBe(400);
  });
});
