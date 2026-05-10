import Database from 'better-sqlite3';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';

describe('migration 024 eua-prices-rewrite', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });

  afterEach(() => db.close());

  it('creates eua_prices table with expected columns', () => {
    migration024.up(db);
    const cols = db.prepare('PRAGMA table_info(eua_prices)').all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'price_date', 'price_eur_per_tco2', 'contract_type', 'source', 'fetched_at',
      ])
    );
  });

  it('seeds 1 row', () => {
    migration024.up(db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM eua_prices').get() as any).c;
    expect(count).toBe(1);
  });

  it('seeds spot row with price_eur_per_tco2=72.65', () => {
    migration024.up(db);
    const row = db.prepare(
      "SELECT * FROM eua_prices WHERE contract_type = 'spot'"
    ).get() as any;
    expect(row).not.toBeNull();
    expect(row.price_eur_per_tco2).toBe(72.65);
    expect(row.price_date).toBe('2026-05-04');
    expect(row.source).toBe('eex-auction-static-seed');
  });

  it('enforces UNIQUE constraint on (price_date, contract_type)', () => {
    migration024.up(db);
    expect(() => {
      db.prepare(
        "INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at) VALUES ('2026-05-04', 99, 'spot', 'test', datetime('now'))"
      ).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('is idempotent (up() can run multiple times)', () => {
    migration024.up(db);
    expect(() => migration024.up(db)).not.toThrow();
    const count = (db.prepare('SELECT COUNT(*) as c FROM eua_prices').get() as any).c;
    expect(count).toBe(1);
  });

  it('rolls back cleanly via down()', () => {
    migration024.up(db);
    migration024.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t: any) => t.name)).not.toContain('eua_prices');
  });

  it('has version=24 and name=eua-prices-rewrite', () => {
    expect(migration024.version).toBe(24);
    expect(migration024.name).toBe('eua-prices-rewrite');
  });
});
