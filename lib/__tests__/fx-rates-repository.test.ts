import Database from 'better-sqlite3';
import { getLatestFxRate, upsertFxRate, type FxRateRow } from '../market/fx-rates-repository';

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

describe('fx-rates-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('getLatestFxRate', () => {
    it('returns null when no rows exist', () => {
      expect(getLatestFxRate(db, 'EUR', 'USD')).toBeNull();
    });

    it('returns the most recent rate for a pair', () => {
      const older: FxRateRow = {
        base_currency: 'EUR', quote_currency: 'USD',
        rate: 1.05, rate_date: '2026-05-01',
        source: 'frankfurter', fetched_at: new Date().toISOString(),
      };
      const newer: FxRateRow = {
        base_currency: 'EUR', quote_currency: 'USD',
        rate: 1.10, rate_date: '2026-05-10',
        source: 'frankfurter', fetched_at: new Date().toISOString(),
      };
      upsertFxRate(db, older);
      upsertFxRate(db, newer);
      const result = getLatestFxRate(db, 'EUR', 'USD');
      expect(result).not.toBeNull();
      expect(result!.rate).toBe(1.10);
      expect(result!.rate_date).toBe('2026-05-10');
    });

    it('returns null for unknown pair even if other pairs exist', () => {
      upsertFxRate(db, {
        base_currency: 'EUR', quote_currency: 'USD',
        rate: 1.08, rate_date: '2026-05-10',
        source: 'frankfurter', fetched_at: new Date().toISOString(),
      });
      expect(getLatestFxRate(db, 'NOK', 'USD')).toBeNull();
    });
  });

  describe('upsertFxRate', () => {
    it('inserts a new row', () => {
      const row: FxRateRow = {
        base_currency: 'NOK', quote_currency: 'USD',
        rate: 0.092, rate_date: '2026-05-11',
        source: 'frankfurter', fetched_at: new Date().toISOString(),
      };
      upsertFxRate(db, row);
      const result = getLatestFxRate(db, 'NOK', 'USD');
      expect(result).not.toBeNull();
      expect(result!.rate).toBeCloseTo(0.092);
    });

    it('updates rate on conflict for same date', () => {
      const row: FxRateRow = {
        base_currency: 'AED', quote_currency: 'USD',
        rate: 0.272, rate_date: '2026-05-11',
        source: 'frankfurter', fetched_at: new Date().toISOString(),
      };
      upsertFxRate(db, row);
      upsertFxRate(db, { ...row, rate: 0.273 });
      const result = getLatestFxRate(db, 'AED', 'USD');
      expect(result!.rate).toBeCloseTo(0.273);
    });

    it('handles zero rate without crashing (boundary: zero)', () => {
      expect(() => upsertFxRate(db, {
        base_currency: 'TST', quote_currency: 'USD',
        rate: 0, rate_date: '2026-05-11',
        source: 'test', fetched_at: new Date().toISOString(),
      })).not.toThrow();
    });
  });
});
