import { isDemoMode, getDemoFrozenDate, _resetDemoFrozenDateCache } from '../demo-mode';
import Database from 'better-sqlite3';
import migration039 from '../migrations/039-demo-seed-meta';

describe('isDemoMode', () => {
  const ORIGINAL = process.env.DEMO_MODE;
  afterEach(() => { process.env.DEMO_MODE = ORIGINAL; });

  it('returns true when DEMO_MODE=true', () => {
    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);
  });

  it('returns false when DEMO_MODE=false', () => {
    process.env.DEMO_MODE = 'false';
    expect(isDemoMode()).toBe(false);
  });

  it('returns false when DEMO_MODE is unset', () => {
    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);
  });

  it('returns false for any non-"true" value (case-sensitive)', () => {
    process.env.DEMO_MODE = 'True';
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = '1';
    expect(isDemoMode()).toBe(false);
  });
});

describe('getDemoFrozenDate', () => {
  function freshDb(): Database.Database {
    const db = new Database(':memory:');
    migration039.up(db);
    return db;
  }

  beforeEach(() => _resetDemoFrozenDateCache());

  it('reads frozen_date from demo_seed_meta', () => {
    const db = freshDb();
    db.prepare("INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, '2026-05-20', 'abc')").run();

    expect(getDemoFrozenDate(db)).toBe('2026-05-20');
  });

  it('throws if demo_seed_meta is empty', () => {
    const db = freshDb();

    expect(() => getDemoFrozenDate(db)).toThrow(/demo_seed_meta has no row/);
  });

  it('caches result across calls (single DB read)', () => {
    const db = freshDb();
    db.prepare("INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, '2026-05-20', 'abc')").run();
    const prepareSpy = jest.spyOn(db, 'prepare');

    getDemoFrozenDate(db);
    getDemoFrozenDate(db);
    getDemoFrozenDate(db);
    // prepare() called only once — subsequent calls use cache
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });
});
