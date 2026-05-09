/**
 * TDD tests for GET /api/market/benchmark route (spec-01).
 *
 * Requirements:
 * - ?indicator=BHSI → 200 with value: 650
 * - ?indicator=TOEPFER_TMI → 200 with value: 12683
 * - ?indicator=DREWRY_BREAKBULK → 404 (no data)
 * - no indicator → 400
 * - invalid indicator → 400
 * - missing data → 404 (not 503)
 */

import { GET } from '@/app/api/market/benchmark/route';

// ─── Mock getCurrentBenchmark ─────────────────────────────────────────────────

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

function bhsiBenchmark() {
  return {
    indicator: 'BHSI',
    value: 650,
    unit: 'index',
    period: '2026-05-09',
    sourceUrl: 'static-seed',
    fetchedAt: new Date().toISOString(),
  };
}

function toepferBenchmark() {
  return {
    indicator: 'TOEPFER_TMI',
    value: 12683,
    unit: 'USD/day',
    period: '2026-05-09',
    sourceUrl: 'static-seed',
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/market/benchmark', () => {
  it('R-1: ?indicator=BHSI → 200 with value=650', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(bhsiBenchmark());

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(650);
    expect(json.indicator).toBe('BHSI');
  });

  it('R-2: ?indicator=TOEPFER_TMI → 200 with value=12683', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(toepferBenchmark());

    const res = await GET(makeRequest('TOEPFER_TMI'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.value).toBe(12683);
    expect(json.indicator).toBe('TOEPFER_TMI');
  });

  it('R-3: ?indicator=DREWRY_BREAKBULK → 404 (no data)', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('DREWRY_BREAKBULK'));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/DREWRY_BREAKBULK/);
  });

  it('R-4: missing indicator → 400', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('R-5: invalid indicator → 400', async () => {
    const res = await GET(makeRequest('INVALID_INDICATOR'));
    expect(res.status).toBe(400);
  });

  it('R-6: benchmark unavailable → 404 (not 503)', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('BHSI'));

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(503);
  });

  it('R-7: 404 response has descriptive error message', async () => {
    mockGetCurrentBenchmark.mockResolvedValue(null);

    const res = await GET(makeRequest('BHSI'));
    const json = await res.json();

    expect(typeof json.error).toBe('string');
    expect(json.error.length).toBeGreaterThan(0);
  });
});
