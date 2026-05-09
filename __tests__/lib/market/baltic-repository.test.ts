import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import migration020 from '@/lib/migrations/020-toepfer-tmi-seed';
import { getLatestBalticIndex } from '@/lib/market/baltic-repository';

describe('getLatestBalticIndex', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migration019.up(db);
    migration020.up(db);
  });

  afterEach(() => db.close());

  it('returns TOEPFER_TMI row with value=12683', () => {
    const row = getLatestBalticIndex(db, 'TOEPFER_TMI');
    expect(row).not.toBeNull();
    expect(row!.index_code).toBe('TOEPFER_TMI');
    expect(row!.value).toBe(12683);
    expect(row!.price_date).toBe('2026-05-09');
    expect(row!.source).toBe('static-seed');
  });

  it('returns BHSI row (not null)', () => {
    const row = getLatestBalticIndex(db, 'BHSI');
    expect(row).not.toBeNull();
    expect(row!.index_code).toBe('BHSI');
  });

  it('returns null for NONEXISTENT index', () => {
    const row = getLatestBalticIndex(db, 'NONEXISTENT');
    expect(row).toBeNull();
  });

  it('returns the newest row when multiple dates exist for the same index_code', () => {
    // Insert an older row for TOEPFER_TMI
    db.prepare(
      `INSERT INTO baltic_indices (index_code, value, price_date, source) VALUES (?, ?, ?, ?)`
    ).run('TOEPFER_TMI', 11000, '2026-01-01', 'static-seed-old');

    // The seed row from migration020 has date 2026-05-09 which is newer
    const row = getLatestBalticIndex(db, 'TOEPFER_TMI');
    expect(row).not.toBeNull();
    expect(row!.price_date).toBe('2026-05-09');
    expect(row!.value).toBe(12683);
  });
});
