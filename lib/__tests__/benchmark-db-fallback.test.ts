/**
 * Tests for benchmark.ts DB fallback — when fetchToepferTmi() returns null,
 * getCurrentBenchmark('TOEPFER_TMI') should fall back to the DB value.
 *
 * Covers:
 *   1. market_indices.tmi row → used as fallback (stale=true)
 *   2. No tmi row → falls back to baltic_indices TOEPFER_TMI (stale=true)
 *   3. Neither → returns null (existing behaviour)
 *   4. Scraper success → still wins over DB (unchanged path)
 *   5. Non-TMI indicator with scraper null → still returns null (unchanged)
 */
import Database from 'better-sqlite3';

// We mock the module BEFORE importing getCurrentBenchmark
jest.mock('../market/toepfer-scraper', () => ({
  fetchToepferTmi: jest.fn(),
}));
jest.mock('../session-store', () => ({
  getStore: jest.fn(),
}));

import { fetchToepferTmi } from '../market/toepfer-scraper';
import { getStore } from '../session-store';
import { getCurrentBenchmark, _clearCacheForTesting } from '../market/benchmark';
import type { MarketBenchmark } from '../types';

const mockFetchToepferTmi = fetchToepferTmi as jest.MockedFunction<typeof fetchToepferTmi>;
const mockGetStore = getStore as jest.MockedFunction<typeof getStore>;

// ─── DB helpers ───────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_indices (
      id          TEXT PRIMARY KEY NOT NULL,
      index_name  TEXT NOT NULL,
      index_date  TEXT NOT NULL,
      value       REAL NOT NULL,
      unit        TEXT NOT NULL DEFAULT 'USD/day',
      source      TEXT NOT NULL,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(index_name, index_date)
    );
    CREATE TABLE IF NOT EXISTS baltic_indices (
      index_code  TEXT NOT NULL,
      value       REAL NOT NULL,
      price_date  TEXT NOT NULL,
      source      TEXT NOT NULL,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(index_code, price_date)
    );
  `);
  return db;
}

function seedBalticToepfer(db: Database.Database, value = 12683, date = '2026-05-09'): void {
  db.prepare(
    `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?,?,?,?)`,
  ).run('TOEPFER_TMI', value, date, 'static-seed');
}

function seedMarketTmi(db: Database.Database, value = 12900, date = '2026-05-10'): void {
  db.prepare(
    `INSERT INTO market_indices (id, index_name, index_date, value, unit, source, fetched_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(`tmi-${date}`, 'tmi', date, value, 'USD/day', 'demo-seed', date + 'T12:00:00.000Z');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getCurrentBenchmark — DB fallback for TOEPFER_TMI', () => {
  let db: Database.Database;

  beforeEach(() => {
    _clearCacheForTesting();
    db = makeDb();
    mockFetchToepferTmi.mockResolvedValue(null);
    mockGetStore.mockReturnValue({ getDatabase: () => db } as ReturnType<typeof getStore>);
  });

  afterEach(() => {
    db.close();
    jest.clearAllMocks();
  });

  it('falls back to market_indices.tmi when scraper returns null', async () => {
    seedMarketTmi(db, 12900, '2026-05-10');
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(12900);
    expect(result!.indicator).toBe('TOEPFER_TMI');
    expect(result!.unit).toBe('USD/day');
    expect(result!.stale).toBe(true);
    expect(result!.period).toBeTruthy();
  });

  it('falls back to baltic_indices TOEPFER_TMI when no tmi in market_indices', async () => {
    seedBalticToepfer(db, 12683, '2026-05-09');
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(12683);
    expect(result!.indicator).toBe('TOEPFER_TMI');
    expect(result!.unit).toBe('USD/day');
    expect(result!.stale).toBe(true);
    expect(result!.period).toBeTruthy();
  });

  it('market_indices.tmi takes priority over baltic_indices when both present', async () => {
    seedMarketTmi(db, 12900, '2026-05-10');
    seedBalticToepfer(db, 12683, '2026-05-09');
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result!.value).toBe(12900);
  });

  it('returns null when neither DB source exists', async () => {
    // Empty DB, no rows
    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result).toBeNull();
  });

  it('scraper success still wins over DB (unchanged path)', async () => {
    const scraperResult: MarketBenchmark = {
      indicator: 'TOEPFER_TMI',
      value: 13100,
      unit: 'USD/day',
      period: 'Jun 2026',
      sourceUrl: 'https://example.com',
      fetchedAt: new Date().toISOString(),
    };
    mockFetchToepferTmi.mockResolvedValue(scraperResult);
    seedMarketTmi(db, 12900, '2026-05-10');

    const result = await getCurrentBenchmark('TOEPFER_TMI');
    expect(result!.value).toBe(13100);
    expect(result!.stale).toBeUndefined();
  });

  it('non-TMI indicator with scraper null still returns null', async () => {
    // BHSI, DREWRY_BREAKBULK, etc — no DB fallback for these
    const result = await getCurrentBenchmark('BHSI');
    expect(result).toBeNull();
  });
});
