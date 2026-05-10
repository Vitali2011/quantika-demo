import Database from 'better-sqlite3';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';

describe('migration 023 bunker-prices-rewrite', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });

  afterEach(() => db.close());

  it('creates bunker_prices table with expected columns', () => {
    migration023.up(db);
    const cols = db.prepare('PRAGMA table_info(bunker_prices)').all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'port_unlocode', 'fuel_grade', 'price_usd_per_mt', 'price_date', 'source', 'fetched_at',
      ])
    );
  });

  it('seeds 10 rows', () => {
    migration023.up(db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM bunker_prices').get() as any).c;
    expect(count).toBe(10);
  });

  it('seeds SGSIN/VLSFO = 801', () => {
    migration023.up(db);
    const row = db.prepare(
      "SELECT price_usd_per_mt, price_date, source FROM bunker_prices WHERE port_unlocode = 'SGSIN' AND fuel_grade = 'VLSFO'"
    ).get() as any;
    expect(row).not.toBeNull();
    expect(row.price_usd_per_mt).toBe(801);
    expect(row.price_date).toBe('2026-05-09');
    expect(row.source).toBe('static-seed');
  });

  it('enforces UNIQUE constraint on (port_unlocode, fuel_grade, price_date)', () => {
    migration023.up(db);
    expect(() => {
      db.prepare(
        "INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at) VALUES ('SGSIN', 'VLSFO', 999, '2026-05-09', 'test', datetime('now'))"
      ).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('is idempotent (up() can run multiple times)', () => {
    migration023.up(db);
    expect(() => migration023.up(db)).not.toThrow();
    const count = (db.prepare('SELECT COUNT(*) as c FROM bunker_prices').get() as any).c;
    expect(count).toBe(10);
  });

  it('rolls back cleanly via down()', () => {
    migration023.up(db);
    migration023.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t: any) => t.name)).not.toContain('bunker_prices');
  });

  it('has version=23 and name=bunker-prices-rewrite', () => {
    expect(migration023.version).toBe(23);
    expect(migration023.name).toBe('bunker-prices-rewrite');
  });
});
