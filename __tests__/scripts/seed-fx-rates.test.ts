import Database from 'better-sqlite3';

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
import { seed } from '@/scripts/seed-fx-rates';

const usdRatesData = { rates: { '2026-05-15': { EUR: 0.92, GBP: 0.79, CNY: 7.25 } } };
const eurRatesData = { rates: { '2026-05-15': { GBP: 0.86, CNY: 7.87 } } };

function okResponse(data: object): Response {
  return { ok: true, json: async () => data } as Response;
}

function rowCount(): number {
  return (mockDb.prepare('SELECT COUNT(*) as c FROM fx_rates').get() as { c: number }).c;
}

describe('seed-fx-rates', () => {
  beforeEach(() => {
    mockDb = buildTestDb();
  });

  afterEach(() => {
    mockDb.close();
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  it('inserts all currency pairs on happy path', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(okResponse(usdRatesData))
      .mockResolvedValueOnce(okResponse(eurRatesData));

    await seed();

    // 1 day × (3 USD pairs + 3 inverse) + (2 EUR pairs + 2 inverse) = 10 rows
    expect(rowCount()).toBe(10);

    const pairs = (
      mockDb
        .prepare('SELECT base_currency, quote_currency FROM fx_rates')
        .all() as Array<{ base_currency: string; quote_currency: string }>
    ).map(r => `${r.base_currency}_${r.quote_currency}`);

    expect(pairs).toContain('USD_EUR');
    expect(pairs).toContain('EUR_USD');
    expect(pairs).toContain('EUR_GBP');
    expect(pairs).toContain('GBP_EUR');
  });

  it('skips rate=0 — no Infinity written to DB', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(
        okResponse({ rates: { '2026-05-15': { EUR: 0, GBP: 0.79, CNY: 7.25 } } }),
      )
      .mockResolvedValueOnce(okResponse(eurRatesData));

    await seed();

    // EUR=0 skipped: 4 (USD→GBP/CNY + inverse) + 4 (EUR→GBP/CNY + inverse) = 8
    expect(rowCount()).toBe(8);

    const rows = mockDb.prepare('SELECT rate FROM fx_rates').all() as { rate: number }[];
    expect(rows.every(r => isFinite(r.rate))).toBe(true);
  });

  it('skips rate=null — no NaN/Infinity written to DB', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(
        okResponse({
          rates: { '2026-05-15': { EUR: null as unknown as number, GBP: 0.79, CNY: 7.25 } },
        }),
      )
      .mockResolvedValueOnce(okResponse(eurRatesData));

    await seed();

    expect(rowCount()).toBe(8);

    const rows = mockDb.prepare('SELECT rate FROM fx_rates').all() as { rate: number }[];
    expect(rows.every(r => isFinite(r.rate))).toBe(true);
  });

  it('retries on 503 and succeeds on second attempt', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response) // first USD attempt
      .mockResolvedValueOnce(okResponse(usdRatesData))               // retry succeeds
      .mockResolvedValueOnce(okResponse(eurRatesData));               // EUR fetch

    const seedPromise = seed();
    await jest.runAllTimersAsync();
    await seedPromise;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(rowCount()).toBe(10);
  });

  it('throws and writes nothing after all 3 retries exhausted (503 every attempt)', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 } as Response);

    const seedPromise = seed();
    // Register rejection handler before advancing timers to avoid unhandledRejection race
    const assertion = expect(seedPromise).rejects.toThrow('frankfurter.app');
    await jest.runAllTimersAsync();
    await assertion;

    expect(global.fetch).toHaveBeenCalledTimes(3); // 3 attempts exhausted
    expect(rowCount()).toBe(0);                    // nothing committed
  });
});
