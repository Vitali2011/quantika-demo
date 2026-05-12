import Database from 'better-sqlite3';
import {
  getLatestIndex,
  getIndexHistory,
  upsertIndex,
  type MarketIndexRow,
} from '../market/market-indices-repository';

function buildTestDb(): Database.Database {
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
    CREATE INDEX IF NOT EXISTS idx_market_indices_lookup
      ON market_indices(index_name, index_date DESC);
  `);
  return db;
}

describe('market-indices-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('getLatestIndex', () => {
    it('returns null for unknown index', () => {
      expect(getLatestIndex(db, 'unknown-index')).toBeNull();
    });

    it('returns most recent entry', () => {
      const older: MarketIndexRow = {
        id: 'bhsi-2026-05-01',
        index_name: 'bhsi',
        index_date: '2026-05-01',
        value: 400,
        unit: 'USD/day',
        source: 'baltic-exchange',
        fetched_at: new Date().toISOString(),
      };
      const newer: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: 450,
        unit: 'USD/day',
        source: 'baltic-exchange',
        fetched_at: new Date().toISOString(),
      };
      upsertIndex(db, older);
      upsertIndex(db, newer);
      const result = getLatestIndex(db, 'bhsi');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(450);
      expect(result!.index_date).toBe('2026-05-10');
    });

    it('returns null with empty table (boundary: empty)', () => {
      expect(getLatestIndex(db, 'bhsi')).toBeNull();
    });

    it('throws RangeError when db is null (boundary: null db)', () => {
      expect(() => getLatestIndex(null as any, 'bhsi')).toThrow(RangeError);
      expect(() => getLatestIndex(null as any, 'bhsi')).toThrow('db required');
    });

    it('throws RangeError when db is undefined (boundary: undefined db)', () => {
      expect(() => getLatestIndex(undefined as any, 'bhsi')).toThrow(RangeError);
      expect(() => getLatestIndex(undefined as any, 'bhsi')).toThrow('db required');
    });

    it('throws RangeError when indexName is empty string (boundary: empty string)', () => {
      expect(() => getLatestIndex(db, '')).toThrow(RangeError);
      expect(() => getLatestIndex(db, '')).toThrow('indexName required');
    });

    it('throws RangeError when indexName is null (boundary: null)', () => {
      expect(() => getLatestIndex(db, null as any)).toThrow(RangeError);
      expect(() => getLatestIndex(db, null as any)).toThrow('indexName required');
    });

    it('throws RangeError when indexName is undefined (boundary: undefined)', () => {
      expect(() => getLatestIndex(db, undefined as any)).toThrow(RangeError);
      expect(() => getLatestIndex(db, undefined as any)).toThrow('indexName required');
    });
  });

  describe('getIndexHistory', () => {
    it('returns N days sorted by date desc', () => {
      for (let i = 0; i < 10; i++) {
        upsertIndex(db, {
          id: `tmi-2026-05-${String(i + 1).padStart(2, '0')}`,
          index_name: 'tmi',
          index_date: `2026-05-${String(i + 1).padStart(2, '0')}`,
          value: 500 + i * 10,
          unit: 'USD/day',
          source: 'manual-csv',
          fetched_at: new Date().toISOString(),
        });
      }
      const result = getIndexHistory(db, 'tmi', 3);
      expect(result).toHaveLength(3);
      expect(result[0].index_date).toBe('2026-05-10');
      expect(result[1].index_date).toBe('2026-05-09');
      expect(result[2].index_date).toBe('2026-05-08');
    });

    it('returns empty array with days=0 (boundary: zero)', () => {
      upsertIndex(db, {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: 400,
        unit: 'USD/day',
        source: 'baltic-exchange',
        fetched_at: new Date().toISOString(),
      });
      const result = getIndexHistory(db, 'bhsi', 0);
      expect(result).toEqual([]);
    });

    it('returns empty array for unknown index', () => {
      const result = getIndexHistory(db, 'unknown', 10);
      expect(result).toEqual([]);
    });

    it('throws RangeError when db is null (boundary: null db)', () => {
      expect(() => getIndexHistory(null as any, 'bhsi', 10)).toThrow(RangeError);
      expect(() => getIndexHistory(null as any, 'bhsi', 10)).toThrow('db required');
    });

    it('throws RangeError when db is undefined (boundary: undefined db)', () => {
      expect(() => getIndexHistory(undefined as any, 'bhsi', 10)).toThrow(RangeError);
      expect(() => getIndexHistory(undefined as any, 'bhsi', 10)).toThrow('db required');
    });

    it('throws RangeError when indexName is empty string (boundary: empty)', () => {
      expect(() => getIndexHistory(db, '', 10)).toThrow(RangeError);
      expect(() => getIndexHistory(db, '', 10)).toThrow('indexName required');
    });

    it('throws RangeError when indexName is null (boundary: null)', () => {
      expect(() => getIndexHistory(db, null as any, 10)).toThrow(RangeError);
      expect(() => getIndexHistory(db, null as any, 10)).toThrow('indexName required');
    });

    it('throws RangeError when indexName is undefined (boundary: undefined)', () => {
      expect(() => getIndexHistory(db, undefined as any, 10)).toThrow(RangeError);
      expect(() => getIndexHistory(db, undefined as any, 10)).toThrow('indexName required');
    });

    it('throws RangeError when days is negative (boundary: negative)', () => {
      expect(() => getIndexHistory(db, 'bhsi', -1)).toThrow(RangeError);
      expect(() => getIndexHistory(db, 'bhsi', -1)).toThrow('days must be >= 0');
    });

    it('throws RangeError when days is NaN (boundary: NaN)', () => {
      expect(() => getIndexHistory(db, 'bhsi', NaN)).toThrow(RangeError);
      expect(() => getIndexHistory(db, 'bhsi', NaN)).toThrow('days must be finite');
    });

    it('throws RangeError when days is Infinity (boundary: Infinity)', () => {
      expect(() => getIndexHistory(db, 'bhsi', Infinity)).toThrow(RangeError);
      expect(() => getIndexHistory(db, 'bhsi', Infinity)).toThrow('days must be finite');
    });

    it('throws RangeError when days is negative Infinity (boundary: -Infinity)', () => {
      expect(() => getIndexHistory(db, 'bhsi', -Infinity)).toThrow(RangeError);
      expect(() => getIndexHistory(db, 'bhsi', -Infinity)).toThrow('days must be finite');
    });
  });

  describe('upsertIndex', () => {
    it('stores record', () => {
      const row: MarketIndexRow = {
        id: 'drewry-bb-2026-05-11',
        index_name: 'drewry-bb',
        index_date: '2026-05-11',
        value: 1250,
        unit: 'USD/day',
        source: 'manual-csv',
        fetched_at: new Date().toISOString(),
      };
      upsertIndex(db, row);
      const result = getLatestIndex(db, 'drewry-bb');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(1250);
    });

    it('updates on conflict (UNIQUE constraint)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: 400,
        unit: 'USD/day',
        source: 'baltic-exchange',
        fetched_at: new Date().toISOString(),
      };
      upsertIndex(db, row);
      upsertIndex(db, { ...row, value: 420 });
      const result = getLatestIndex(db, 'bhsi');
      expect(result!.value).toBe(420);
    });

    it('throws RangeError when db is null (boundary: null db)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: 400,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(null as any, row)).toThrow(RangeError);
      expect(() => upsertIndex(null as any, row)).toThrow('db required');
    });

    it('throws RangeError when db is undefined (boundary: undefined db)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: 400,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(undefined as any, row)).toThrow(RangeError);
      expect(() => upsertIndex(undefined as any, row)).toThrow('db required');
    });

    it('throws RangeError when value is negative (boundary: negative)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: -100,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(db, row)).toThrow(RangeError);
      expect(() => upsertIndex(db, row)).toThrow('value must be >= 0');
    });

    it('throws RangeError when value is NaN (boundary: NaN)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: NaN,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(db, row)).toThrow(RangeError);
      expect(() => upsertIndex(db, row)).toThrow('value must be finite');
    });

    it('throws RangeError when value is Infinity (boundary: Infinity)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: Infinity,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(db, row)).toThrow(RangeError);
      expect(() => upsertIndex(db, row)).toThrow('value must be finite');
    });

    it('throws RangeError when required fields missing (boundary: empty object)', () => {
      expect(() => upsertIndex(db, {} as any)).toThrow(RangeError);
      expect(() => upsertIndex(db, {} as any)).toThrow('required fields');
    });

    it('throws RangeError when index_name is empty (boundary: empty string)', () => {
      const row: MarketIndexRow = {
        id: 'test-2026-05-10',
        index_name: '',
        index_date: '2026-05-10',
        value: 100,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(db, row)).toThrow(RangeError);
      expect(() => upsertIndex(db, row)).toThrow('required fields');
    });

    it('handles zero value (boundary: zero)', () => {
      const row: MarketIndexRow = {
        id: 'bhsi-2026-05-10',
        index_name: 'bhsi',
        index_date: '2026-05-10',
        value: 0,
        unit: 'USD/day',
        source: 'test',
        fetched_at: new Date().toISOString(),
      };
      expect(() => upsertIndex(db, row)).not.toThrow();
      const result = getLatestIndex(db, 'bhsi');
      expect(result!.value).toBe(0);
    });
  });
});
