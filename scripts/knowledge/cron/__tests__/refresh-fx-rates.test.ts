/**
 * TDD tests for refresh-fx-rates cron script.
 * Fetches EUR, GBP, NOK, AED rates from Frankfurter API and upserts into fx_rates.
 */

import Database from 'better-sqlite3';

// Mock getStore before importing the cron
let mockDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: () => ({ getDb: () => mockDb }),
}));

function buildTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE fx_rates (
      base_currency  TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate           REAL NOT NULL,
      rate_date      TEXT NOT NULL,
      source         TEXT NOT NULL DEFAULT 'frankfurter',
      fetched_at     TEXT NOT NULL,
      PRIMARY KEY (base_currency, quote_currency, rate_date)
    );
    CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
      ON fx_rates(base_currency, quote_currency, rate_date DESC);
  `);
  return db;
}

// Import after mock setup
import { main } from '../refresh-fx-rates';

describe('refresh-fx-rates cron', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    mockDb = buildTestDb();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    mockDb.close();
    jest.resetAllMocks();
  });

  it('exits 0 and inserts all currency pairs on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        amount: 1,
        base: 'USD',
        date: '2026-05-11',
        rates: { EUR: 0.926, GBP: 0.787, NOK: 10.87, AED: 3.67 },
      }),
    } as Response);

    await main();

    expect(exitSpy).toHaveBeenCalledWith(0);

    // Should have stored USD→EUR, USD→GBP, USD→NOK, USD→AED
    const rows = mockDb.prepare('SELECT base_currency, quote_currency, rate FROM fx_rates ORDER BY base_currency, quote_currency').all() as Array<{ base_currency: string; quote_currency: string; rate: number }>;
    const pairs = rows.map(r => `${r.base_currency}_${r.quote_currency}`);
    expect(pairs).toContain('USD_EUR');
    expect(pairs).toContain('USD_GBP');
    expect(pairs).toContain('USD_NOK');
    expect(pairs).toContain('USD_AED');
    // Should also have reverse pairs
    expect(pairs).toContain('EUR_USD');
    expect(pairs).toContain('GBP_USD');
    expect(pairs).toContain('NOK_USD');
    expect(pairs).toContain('AED_USD');
  });

  it('exits 1 when Frankfurter API is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network timeout'));

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const count = (mockDb.prepare('SELECT COUNT(*) as c FROM fx_rates').get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it('exits 1 when API returns non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('stores correct rate values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        amount: 1,
        base: 'USD',
        date: '2026-05-11',
        rates: { EUR: 0.926, GBP: 0.787, NOK: 10.87, AED: 3.67 },
      }),
    } as Response);

    await main();

    const usdEur = mockDb.prepare('SELECT rate FROM fx_rates WHERE base_currency = ? AND quote_currency = ?').get('USD', 'EUR') as { rate: number } | undefined;
    expect(usdEur).toBeDefined();
    expect(usdEur!.rate).toBeCloseTo(0.926);

    const eurUsd = mockDb.prepare('SELECT rate FROM fx_rates WHERE base_currency = ? AND quote_currency = ?').get('EUR', 'USD') as { rate: number } | undefined;
    expect(eurUsd).toBeDefined();
    expect(eurUsd!.rate).toBeCloseTo(1 / 0.926);
  });
});
