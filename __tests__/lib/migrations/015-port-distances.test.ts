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

  it('creates indexes on port_from and port_to', () => {
    migration015.up(db);
    const indexes = db.prepare("PRAGMA index_list(port_distances)").all() as any[];
    expect(indexes.some((idx: any) => idx.name.includes('port_from'))).toBe(true);
    expect(indexes.some((idx: any) => idx.name.includes('port_to'))).toBe(true);
  });

  it('enforces UNIQUE constraint on (port_from, port_to)', () => {
    migration015.up(db);
    db.prepare(`
      INSERT INTO port_distances (port_from, port_to, distance_nm, source)
      VALUES ('Antwerp', 'Hamburg', 245.0, 'test')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO port_distances (port_from, port_to, distance_nm, source)
        VALUES ('Antwerp', 'Hamburg', 246.0, 'test-duplicate')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('rolls back cleanly via down()', () => {
    migration015.up(db);
    migration015.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain('port_distances');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[];
    expect(indexes.some((idx: any) => idx.name.includes('port_from'))).toBe(false);
    expect(indexes.some((idx: any) => idx.name.includes('port_to'))).toBe(false);
  });

  it('is idempotent (up() can run multiple times safely)', () => {
    migration015.up(db);
    expect(() => migration015.up(db)).not.toThrow();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).toContain('port_distances');
  });
});
