import Database from 'better-sqlite3';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import { getLatestEuaPrice, upsertEuaPrice } from '@/lib/market/eua-repository';

describe('eua-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration024.up(db);
  });

  afterEach(() => db.close());

  it('getLatestEuaPrice returns spot seed row', () => {
    const row = getLatestEuaPrice(db, 'spot');
    expect(row).not.toBeNull();
    expect(row!.price_eur_per_tco2).toBe(72.65);
    expect(row!.price_date).toBe('2026-05-04');
    expect(row!.source).toBe('eex-auction-static-seed');
    expect(row!.contract_type).toBe('spot');
    expect(row!.fetched_at).toBeTruthy();
  });

  it('getLatestEuaPrice defaults to spot', () => {
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
    const row = getLatestEuaPrice(db, 'spot');
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-10');
    expect(row!.price_eur_per_tco2).toBe(75.00);
  });

  it('getLatestEuaPrice ignores future-dated rows (date guard)', () => {
    db.prepare(
      "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2099-01-01', 9999, 'spot', 'future-source', datetime('now'))"
    ).run();
    const row = getLatestEuaPrice(db, 'spot');
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-04');
    expect(row!.price_eur_per_tco2).toBe(72.65);
  });

  it('upsertEuaPrice inserts a new row', () => {
    upsertEuaPrice(db, {
      price_date: '2026-05-11',
      price_eur_per_tco2: 73.5,
      contract_type: 'spot',
      source: 'test',
      fetched_at: new Date().toISOString(),
    });
    const row = getLatestEuaPrice(db, 'spot');
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-11');
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
