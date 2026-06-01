import Database from 'better-sqlite3';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import { getLatestBunkerPrice, getBunkerHistory, upsertBunkerPrice } from '@/lib/market/bunker-repository';

describe('bunker-repository', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration023.up(db);
  });

  afterEach(() => db.close());

  it('getLatestBunkerPrice returns SGSIN/VLSFO seed row', () => {
    const row = getLatestBunkerPrice(db, 'SGSIN', 'VLSFO');
    expect(row).not.toBeNull();
    expect(row!.port_unlocode).toBe('SGSIN');
    expect(row!.fuel_grade).toBe('VLSFO');
    expect(row!.price_usd_per_mt).toBe(801);
    expect(row!.price_date).toBe('2026-05-09');
    expect(row!.source).toBe('static-seed');
    expect(row!.fetched_at).toBeTruthy();
  });

  it('getLatestBunkerPrice returns null for unknown port', () => {
    const row = getLatestBunkerPrice(db, 'ZZZZZ', 'VLSFO');
    expect(row).toBeNull();
  });

  it('getLatestBunkerPrice returns newest row when multiple dates exist', () => {
    db.prepare(
      "INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('NLRTM', 'VLSFO', 850, '2026-05-10', 'newer-source', datetime('now'))"
    ).run();
    const row = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-10');
    expect(row!.price_usd_per_mt).toBe(850);
  });

  it('upsertBunkerPrice inserts a new row', () => {
    upsertBunkerPrice(db, {
      port_unlocode: 'CNSHA',
      fuel_grade: 'VLSFO',
      price_usd_per_mt: 750,
      price_date: '2026-05-10',
      source: 'test',
      fetched_at: new Date().toISOString(),
    });
    const row = getLatestBunkerPrice(db, 'CNSHA', 'VLSFO');
    expect(row).not.toBeNull();
    expect(row!.price_usd_per_mt).toBe(750);
  });

  it('getLatestBunkerPrice ignores future-dated rows (date guard)', () => {
    db.prepare(
      "INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('SGSIN', 'VLSFO', 9999, '2099-01-01', 'future-source', datetime('now'))"
    ).run();
    const row = getLatestBunkerPrice(db, 'SGSIN', 'VLSFO');
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-09');
    expect(row!.price_usd_per_mt).toBe(801);
  });

  it('upsertBunkerPrice updates existing row on conflict', () => {
    upsertBunkerPrice(db, {
      port_unlocode: 'SGSIN',
      fuel_grade: 'VLSFO',
      price_usd_per_mt: 900,
      price_date: '2026-05-09',
      source: 'updated-source',
      fetched_at: new Date().toISOString(),
    });
    const row = getLatestBunkerPrice(db, 'SGSIN', 'VLSFO');
    expect(row).not.toBeNull();
    expect(row!.price_usd_per_mt).toBe(900);
    expect(row!.source).toBe('updated-source');
  });
});

describe('getBunkerHistory', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration023.up(db);
  });

  afterEach(() => db.close());

  it('returns multiple rows ordered newest-first', () => {
    // Use CNSHA port (no seed rows) to avoid UNIQUE conflicts with migration023 NLRTM seed
    db.prepare(
      "INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('CNSHA', 'VLSFO', 700, '2026-05-10', 'test', datetime('now'))"
    ).run();
    db.prepare(
      "INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('CNSHA', 'VLSFO', 690, '2026-05-09', 'test', datetime('now'))"
    ).run();
    const rows = getBunkerHistory(db, 'CNSHA', 'VLSFO', 30);
    expect(rows.length).toBe(2);
    expect(rows[0]!.price_date).toBe('2026-05-10');
  });

  it('respects days limit', () => {
    // Use CNSHA port to avoid UNIQUE conflicts with migration023 NLRTM/MGO seed row
    for (let i = 1; i <= 10; i++) {
      db.prepare(
        `INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('CNSHA', 'MGO', ${1200 + i}, '2026-05-${String(i).padStart(2, '0')}', 'test', datetime('now'))`
      ).run();
    }
    const rows = getBunkerHistory(db, 'CNSHA', 'MGO', 5);
    expect(rows.length).toBe(5);
  });

  it('returns empty array for days=0', () => {
    const rows = getBunkerHistory(db, 'NLRTM', 'VLSFO', 0);
    expect(rows).toEqual([]);
  });

  it('throws on negative days', () => {
    expect(() => getBunkerHistory(db, 'NLRTM', 'VLSFO', -1)).toThrow(RangeError);
  });

  it('excludes future-dated rows', () => {
    db.prepare(
      "INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('NLRTM', 'VLSFO', 9999, '2099-01-01', 'future', datetime('now'))"
    ).run();
    const rows = getBunkerHistory(db, 'NLRTM', 'VLSFO', 30);
    expect(rows.every((r) => r.price_date <= '2026-05-28')).toBe(true);
  });
});
