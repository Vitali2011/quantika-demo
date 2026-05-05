import Database from 'better-sqlite3';
import migration015 from '@/lib/migrations/015-port-distances';

describe('migration 015 port-distances', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });
  afterEach(() => db.close());

  it('creates port_distances table with expected columns', () => {
    migration015.up(db);
    const cols = db.prepare("PRAGMA table_info(port_distances)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'port_from', 'port_to', 'distance_nm', 'source', 'fetched_at',
      ])
    );
  });
});
