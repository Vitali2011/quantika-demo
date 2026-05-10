/**
 * Integration tests for GET /api/market/benchmark route (spec-01).
 *
 * Route logic:
 * 1. DB-first: getLatestBalticIndex(db, indicator) for BHSI and TOEPFER_TMI
 * 2. Fallback: getCurrentBenchmark(indicator) (scraper for TMI)
 * 3. 404 if no data (not 503)
 *
 * Requirements:
 * - ?indicator=BHSI → 200 with value: 650 (from DB)
 * - ?indicator=TOEPFER_TMI → 200 with value: 12683 (from DB)
 * - ?indicator=DREWRY_BREAKBULK → 404 (no data)
 * - no indicator → 400
 * - invalid indicator → 400
 * - missing data → 404 (not 503)
 */

import { GET } from '@/app/api/market/benchmark/route';

// ─── Mock session-store (server-only DB) ──────────────────────────────────────

const mockGetDatabase = jest.fn();
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: mockGetDatabase })),
}));

// ─── Mock baltic-repository ───────────────────────────────────────────────────

const mockGetLatestBalticIndex = jest.fn();
jest.mock('@/lib/market/baltic-repository', () => ({
  getLatestBalticIndex: (...args: unknown[]) => mockGetLatestBalticIndex(...args),
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

const BHSI_ROW = { index_code: 'BHSI', value: 650, price_date: '2026-05-09', source: 'static-seed' };
const TMI_ROW = { index_code: 'TOEPFER_TMI', value: 12683, price_date: '2026-05-09', source: 'static-seed' };

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDatabase.mockReturnValue({}); // mock DB handle (not used directly)
});

describe('GET /api/market/benchmark — DB path', () => {
  it('R-1: ?indicator=BHSI → 200 with value=650 from DB', async () => {
    mockGetLatestBalticIndex.mockReturnValue(BHSI_ROW);

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(650);
    expect(json.indicator).toBe('BHSI');
    expect(json.unit).toBe('index');
  });

  it('R-2: ?indicator=TOEPFER_TMI → 200 with value=12683 from DB', async () => {
    mockGetLatestBalticIndex.mockReturnValue(TMI_ROW);

    const res = await GET(makeRequest('TOEPFER_TMI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(12683);
    expect(json.indicator).toBe('TOEPFER_TMI');
    expect(json.unit).toBe('USD/day');
    // getCurrentBenchmark (scraper) should NOT be called when DB has the row
    expect(mockGetCurrentBenchmark).not.toHaveBeenCalled();
  });

  it('R-3: TOEPFER_TMI falls back to scraper when DB has no row', async () => {
    mockGetLatestBalticIndex.mockReturnValue(null);
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
});

describe('GET /api/market/benchmark — null / error paths', () => {
  it('R-4: ?indicator=DREWRY_BREAKBULK → 404 (no DB row, scraper returns null)', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('DREWRY_BREAKBULK'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/DREWRY_BREAKBULK/);
  });

  it('R-5: BHSI with no DB row → 404 (no scraper fallback for BHSI)', async () => {
    mockGetLatestBalticIndex.mockReturnValue(null);
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('BHSI'));
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(503);
  });

  it('R-6: 404 response has descriptive error message', async () => {
    mockGetLatestBalticIndex.mockReturnValue(null);
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
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
