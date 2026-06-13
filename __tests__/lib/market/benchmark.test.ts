/**
 * Unit tests for lib/market/benchmark.ts
 *
 * Note: DB-first lookup (BHSI/TOEPFER_TMI from baltic_indices) is done in the
 * route handler (app/api/market/benchmark/route.ts), which is server-only.
 * benchmark.ts itself is browser-safe — only uses fetch()-based scraper.
 *
 * Tests here cover:
 * - getCurrentBenchmark TOEPFER_TMI scraper path
 * - getCurrentBenchmark DREWRY_BREAKBULK → null
 * - in-memory cache behaviour
 * - formatBenchmarkReference helper
 */

import { getCurrentBenchmark, formatBenchmarkReference, _clearCacheForTesting } from '@/lib/market/benchmark';
import type { MarketBenchmark } from '@/lib/types';

// ─── Mock toepfer scraper ─────────────────────────────────────────────────────

const mockFetchToepferTmi = jest.fn();
jest.mock('@/lib/market/toepfer-scraper', () => ({
  fetchToepferTmi: (...args: unknown[]) => mockFetchToepferTmi(...args),
}));

// ─── Mock session-store so DB fallback sees an empty DB ───────────────────────

import Database from 'better-sqlite3';

const mockGetStore = jest.fn();
jest.mock('@/lib/session-store', () => ({
  getStore: (...args: unknown[]) => mockGetStore(...args),
}));

// ─── Setup ───────────────────────────────────────────────────────────────────

// Empty in-memory DB that has the two tables but no rows — so DB fallback returns null.
let emptyDb: Database.Database;

beforeEach(() => {
  _clearCacheForTesting();
  jest.clearAllMocks();
  emptyDb = new Database(':memory:');
  emptyDb.exec(`
    CREATE TABLE IF NOT EXISTS market_indices (
      id TEXT PRIMARY KEY NOT NULL, index_name TEXT NOT NULL, index_date TEXT NOT NULL,
      value REAL NOT NULL, unit TEXT NOT NULL DEFAULT 'USD/day', source TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(index_name, index_date)
    );
    CREATE TABLE IF NOT EXISTS baltic_indices (
      index_code TEXT NOT NULL, value REAL NOT NULL, price_date TEXT NOT NULL,
      source TEXT NOT NULL, fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(index_code, price_date)
    );
  `);
  mockGetStore.mockReturnValue({ getDatabase: () => emptyDb });
});

afterEach(() => {
  emptyDb.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getCurrentBenchmark — TOEPFER_TMI (scraper path)', () => {
  it('T-1: calls scraper and returns MarketBenchmark', async () => {
    const scraperResult: MarketBenchmark = {
      indicator: 'TOEPFER_TMI',
      value: 12683,
      unit: 'USD/day',
      period: 'May 2026',
      sourceUrl: 'https://heavyliftpfi.com/market-data/',
      fetchedAt: new Date().toISOString(),
    };
    mockFetchToepferTmi.mockResolvedValue(scraperResult);

    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(mockFetchToepferTmi).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(12683);
    expect(result!.indicator).toBe('TOEPFER_TMI');
  });

  it('T-2: returns null when scraper returns null AND no DB data', async () => {
    // emptyDb has the tables but no rows, so DB fallback returns null too
    mockFetchToepferTmi.mockResolvedValue(null);
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).toBeNull();
  });

  it('T-3: caches result; scraper is NOT called on second invocation', async () => {
    const scraperResult: MarketBenchmark = {
      indicator: 'TOEPFER_TMI',
      value: 12683,
      unit: 'USD/day',
      period: 'May 2026',
      sourceUrl: 'https://heavyliftpfi.com/market-data/',
      fetchedAt: new Date().toISOString(),
    };
    mockFetchToepferTmi.mockResolvedValue(scraperResult);

    await getCurrentBenchmark('TOEPFER_TMI');
    await getCurrentBenchmark('TOEPFER_TMI');
    expect(mockFetchToepferTmi).toHaveBeenCalledTimes(1);
  });
});

describe('getCurrentBenchmark — BHSI (no scraper — returns null at benchmark layer)', () => {
  it('B-1: returns null for BHSI (DB lookup is done at route layer)', async () => {
    // BHSI has no scraper fallback in benchmark.ts; DB lookup is done in route.ts
    const result = await getCurrentBenchmark('BHSI');
    expect(result).toBeNull();
    expect(mockFetchToepferTmi).not.toHaveBeenCalled();
  });
});

describe('getCurrentBenchmark — DREWRY_BREAKBULK', () => {
  it('D-1: returns null (no data source)', async () => {
    const result = await getCurrentBenchmark('DREWRY_BREAKBULK');
    expect(result).toBeNull();
  });
});

describe('formatBenchmarkReference', () => {
  it('F-1: formats USD value correctly', () => {
    const benchmark: MarketBenchmark = {
      indicator: 'TOEPFER_TMI',
      value: 12683,
      unit: 'USD/day',
      period: 'Apr 2026',
      sourceUrl: 'https://toepfer.com',
      fetchedAt: new Date().toISOString(),
    };
    const result = formatBenchmarkReference(benchmark);
    expect(result).toBe('Toepfer TMI Apr 2026 — $12,683/day TCE');
  });

  it('F-2: handles round numbers without decimals', () => {
    const benchmark: MarketBenchmark = {
      indicator: 'TOEPFER_TMI',
      value: 10000,
      unit: 'USD/day',
      period: 'Jan 2026',
      sourceUrl: 'https://toepfer.com',
      fetchedAt: new Date().toISOString(),
    };
    const result = formatBenchmarkReference(benchmark);
    expect(result).toBe('Toepfer TMI Jan 2026 — $10,000/day TCE');
  });
});
