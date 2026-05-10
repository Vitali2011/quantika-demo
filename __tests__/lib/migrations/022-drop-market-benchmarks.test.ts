import Database from 'better-sqlite3';
import migration005 from '../../../lib/migrations/005-market-benchmarks';
import migration022 from '../../../lib/migrations/022-drop-market-benchmarks';

describe('migration022 — drop market_benchmarks', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration005.up(db);
  });

  afterEach(() => db.close());

  it('table exists before migration', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_benchmarks'")
      .get();
    expect(row).toBeTruthy();
  });

  it('up() drops the table', () => {
    migration022.up(db);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_benchmarks'")
      .get();
    expect(row).toBeUndefined();
  });

  it('up() is idempotent — safe to run twice', () => {
    migration022.up(db);
    expect(() => migration022.up(db)).not.toThrow();
  });

  it('down() is a no-op — table stays dropped', () => {
    migration022.up(db);
    expect(() => migration022.down(db)).not.toThrow();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='market_benchmarks'")
      .get();
    expect(row).toBeUndefined();
  });
});
