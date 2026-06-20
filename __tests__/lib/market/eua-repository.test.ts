import Database from 'better-sqlite3';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import { getLatestEuaPrice, getEuaHistory, upsertEuaPrice, EUA_STALE_DAYS } from '@/lib/market/eua-repository';

describe('eua-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration024.up(db);
  });

  afterEach(() => db.close());

  // Seed row (2026-05-04) is older than EUA_STALE_DAYS relative to the real
  // clock, so retrieval-semantics tests opt out of the freshness gate with
  // maxAgeDays: Infinity. These assert WHICH row comes back, not its freshness.
  it('getLatestEuaPrice returns spot seed row', () => {
    const row = getLatestEuaPrice(db, 'spot', { maxAgeDays: Infinity });
    expect(row).not.toBeNull();
    expect(row!.price_eur_per_tco2).toBe(72.65);
    expect(row!.price_date).toBe('2026-05-04');
    expect(row!.source).toBe('eex-auction-static-seed');
    expect(row!.contract_type).toBe('spot');
    expect(row!.fetched_at).toBeTruthy();
  });

  it('getLatestEuaPrice defaults to spot contract_type', () => {
    // Fresh row so the default freshness gate passes; asserts the default
    // contractType argument resolves to 'spot'.
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES (date('now'), 75.00, 'spot', 'fresh-source', datetime('now'))"
    ).run();
    const row = getLatestEuaPrice(db);
    expect(row).not.toBeNull();
    expect(row!.contract_type).toBe('spot');
  });

  it('getLatestEuaPrice returns null for unknown contract_type', () => {
    const row = getLatestEuaPrice(db, 'futures-dec-2030');
    expect(row).toBeNull();
  });

  it('getLatestEuaPrice returns newest row when multiple dates exist', () => {
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2026-05-10', 75.00, 'spot', 'newer-source', datetime('now'))"
    ).run();
    const row = getLatestEuaPrice(db, 'spot', { maxAgeDays: Infinity });
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-10');
    expect(row!.price_eur_per_tco2).toBe(75.00);
  });

  it('getLatestEuaPrice ignores future-dated rows (date guard)', () => {
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2099-01-01', 9999, 'spot', 'future-source', datetime('now'))"
    ).run();
    const row = getLatestEuaPrice(db, 'spot', { maxAgeDays: Infinity });
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-04');
    expect(row!.price_eur_per_tco2).toBe(72.65);
  });

  it('getLatestEuaPrice returns null for a row older than maxAgeDays', () => {
    // Isolated contract_type with a single 30-day-old row; default gate is 7d.
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES (date('now', '-30 days'), 70.00, 'stale-test', 'stale-source', datetime('now'))"
    ).run();
    const row = getLatestEuaPrice(db, 'stale-test');
    expect(row).toBeNull();
  });

  it('getLatestEuaPrice returns the row when age equals maxAgeDays (boundary)', () => {
    // Timezone-robust: derive the boundary date with the SAME JS-local→UTC logic
    // the repository uses for its threshold, instead of mixing SQLite-UTC
    // date('now','-N days') with a JS-local threshold (which flips the boundary
    // intermittently in UTC+5 or later). Both sides now compute identically, so
    // price_date == threshold (not < threshold) → row is returned, deterministically.
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - EUA_STALE_DAYS);
    const boundaryDate = threshold.toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES (?, 71.00, 'boundary-test', 'boundary-source', datetime('now'))`
    ).run(boundaryDate);
    const row = getLatestEuaPrice(db, 'boundary-test');
    expect(row).not.toBeNull();
    expect(row!.price_eur_per_tco2).toBe(71.00);
  });

  it('getLatestEuaPrice returns a stale row when maxAgeDays is Infinity', () => {
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES (date('now', '-100 days'), 69.00, 'infinity-test', 'old-source', datetime('now'))"
    ).run();
    const row = getLatestEuaPrice(db, 'infinity-test', { maxAgeDays: Infinity });
    expect(row).not.toBeNull();
    expect(row!.price_eur_per_tco2).toBe(69.00);
  });

  it('upsertEuaPrice inserts a new row', () => {
    upsertEuaPrice(db, {
      price_date: '2026-05-10',
      price_eur_per_tco2: 73.5,
      contract_type: 'spot',
      source: 'test',
      fetched_at: new Date().toISOString(),
    });
    const row = getLatestEuaPrice(db, 'spot', { maxAgeDays: Infinity });
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-10');
    expect(row!.price_eur_per_tco2).toBe(73.5);
  });

  it('upsertEuaPrice updates existing row on conflict', () => {
    upsertEuaPrice(db, {
      price_date: '2026-05-04',
      price_eur_per_tco2: 80.0,
      contract_type: 'spot',
      source: 'updated-source',
      fetched_at: new Date().toISOString(),
    });
    // After upsert, the seed row's price should be updated
    // But since '2026-05-04' < '2026-05-11' is not inserted yet, get for '2026-05-04'
    const allRows = db.prepare("SELECT * FROM eua_prices WHERE price_date = '2026-05-04' AND contract_type = 'spot'").all() as any[];
    expect(allRows).toHaveLength(1);
    expect(allRows[0].price_eur_per_tco2).toBe(80.0);
    expect(allRows[0].source).toBe('updated-source');
  });
});

describe('getEuaHistory', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration024.up(db);
  });

  afterEach(() => db.close());

  it('returns multiple rows ordered newest-first', () => {
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2026-05-10', 75.0, 'spot', 'test', datetime('now'))"
    ).run();
    const rows = getEuaHistory(db, 'spot', 30);
    expect(rows.length).toBe(2);
    expect(rows[0]!.price_date).toBe('2026-05-10');
    expect(rows[1]!.price_date).toBe('2026-05-04');
  });

  it('respects days limit', () => {
    // Start from 2026-05-11 to avoid UNIQUE conflict with migration024 seed at 2026-05-04
    for (let i = 1; i <= 10; i++) {
      db.prepare(
        `INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2026-05-${String(i + 10).padStart(2, '0')}', ${70 + i}, 'spot', 'test', datetime('now'))`
      ).run();
    }
    const rows = getEuaHistory(db, 'spot', 5);
    expect(rows.length).toBe(5);
    expect(rows[0]!.price_date).toBe('2026-05-20');
  });

  it('returns empty array for days=0', () => {
    const rows = getEuaHistory(db, 'spot', 0);
    expect(rows).toEqual([]);
  });

  it('throws on negative days', () => {
    expect(() => getEuaHistory(db, 'spot', -1)).toThrow(RangeError);
  });

  it('excludes future-dated rows', () => {
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2099-01-01', 9999, 'spot', 'future', datetime('now'))"
    ).run();
    const rows = getEuaHistory(db, 'spot', 30);
    expect(rows.every((r) => r.price_date <= '2026-05-28')).toBe(true);
  });

  it('defaults to spot contract_type', () => {
    const rows = getEuaHistory(db, 'spot', 30);
    expect(rows.every((r) => r.contract_type === 'spot')).toBe(true);
  });
});
