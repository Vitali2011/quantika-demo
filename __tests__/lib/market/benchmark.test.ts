/**
 * TDD tests for lib/market/benchmark.ts (spec-01: Benchmark Rewire).
 *
 * Requirements:
 * - getCurrentBenchmark('BHSI') reads from baltic_indices via getLatestBalticIndex
 * - getCurrentBenchmark('TOEPFER_TMI') reads from DB; fallback to fetchToepferTmi if null
 * - getCurrentBenchmark('DREWRY_BREAKBULK') returns null (no source)
 * - When DB returns null for BHSI → returns null (no scraper fallback)
 * - MarketBenchmark shape is correct for DB-sourced entries
 */

import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration020 from '@/lib/migrations/020-toepfer-tmi-seed';
import { getCurrentBenchmark, _clearCacheForTesting } from '@/lib/market/benchmark';

// ─── Mock DB access ───────────────────────────────────────────────────────────

let mockDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => mockDb,
  })),
}));

// ─── Mock toepfer scraper for TOEPFER_TMI fallback tests ─────────────────────

const mockFetchToepferTmi = jest.fn();
jest.mock('@/lib/market/toepfer-scraper', () => ({
  fetchToepferTmi: (...args: unknown[]) => mockFetchToepferTmi(...args),
}));

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDb = new Database(':memory:');
  mockDb.exec('PRAGMA foreign_keys = ON');
  migration019.up(mockDb);
  migration020.up(mockDb);
  _clearCacheForTesting();
  jest.clearAllMocks();
});

afterEach(() => {
  mockDb.close();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getCurrentBenchmark — BHSI (DB-sourced)', () => {
  it('B-1: returns MarketBenchmark with value=650 for BHSI', async () => {
    const result = await getCurrentBenchmark('BHSI');
    expect(result).not.toBeNull();
    expect(result!.indicator).toBe('BHSI');
    expect(result!.value).toBe(650);
    expect(result!.unit).toBe('index');
  });

  it('B-2: BHSI result has correct shape (period + sourceUrl + fetchedAt)', async () => {
    const result = await getCurrentBenchmark('BHSI');
    expect(result).not.toBeNull();
    expect(result!.period).toBe('2026-05-09');
    expect(result!.sourceUrl).toBe('static-seed');
    expect(typeof result!.fetchedAt).toBe('string');
    // fetchedAt should be a valid ISO 8601 timestamp
    expect(() => new Date(result!.fetchedAt)).not.toThrow();
  });

  it('B-3: returns null for BHSI when DB has no row', async () => {
    // Remove the BHSI row
    mockDb.exec(`DELETE FROM baltic_indices WHERE index_code = 'BHSI'`);
    const result = await getCurrentBenchmark('BHSI');
    expect(result).toBeNull();
  });
});

describe('getCurrentBenchmark — TOEPFER_TMI (DB with scraper fallback)', () => {
  it('T-1: returns MarketBenchmark with value=12683 for TOEPFER_TMI from DB', async () => {
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).not.toBeNull();
    expect(result!.indicator).toBe('TOEPFER_TMI');
    expect(result!.value).toBe(12683);
    expect(result!.unit).toBe('USD/day');
  });

  it('T-2: TOEPFER_TMI period and sourceUrl come from DB row', async () => {
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result!.period).toBe('2026-05-09');
    expect(result!.sourceUrl).toBe('static-seed');
  });

  it('T-3: scraper fallback is used when DB has no TOEPFER_TMI row', async () => {
    mockDb.exec(`DELETE FROM baltic_indices WHERE index_code = 'TOEPFER_TMI'`);
    const scraperResult = {
      indicator: 'TOEPFER_TMI' as const,
      value: 13000,
      unit: 'USD/day',
      period: 'May 2026',
      sourceUrl: 'https://toepfer.com/tmi',
      fetchedAt: new Date().toISOString(),
    };
    mockFetchToepferTmi.mockResolvedValue(scraperResult);

    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(mockFetchToepferTmi).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(13000);
  });

  it('T-4: returns null when DB has no TOEPFER_TMI row and scraper returns null', async () => {
    mockDb.exec(`DELETE FROM baltic_indices WHERE index_code = 'TOEPFER_TMI'`);
    mockFetchToepferTmi.mockResolvedValue(null);

    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).toBeNull();
  });

  it('T-5: scraper is NOT called when DB has TOEPFER_TMI row', async () => {
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).not.toBeNull();
    expect(mockFetchToepferTmi).not.toHaveBeenCalled();
  });
});

describe('getCurrentBenchmark — DREWRY_BREAKBULK', () => {
  it('D-1: returns null for DREWRY_BREAKBULK (no data source)', async () => {
    const result = await getCurrentBenchmark('DREWRY_BREAKBULK');
    expect(result).toBeNull();
  });
});
