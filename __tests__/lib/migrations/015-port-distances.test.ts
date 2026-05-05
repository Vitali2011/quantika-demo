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
        'id', 'origin', 'dest', 'route_via', 'distance_nm', 'created_at',
      ])
    );
  });

  it('creates indexes on origin, dest, and route_via', () => {
    migration015.up(db);
    const indexes = db.prepare("PRAGMA index_list(port_distances)").all() as any[];
    expect(indexes.some((idx: any) => idx.name.includes('origin'))).toBe(true);
    expect(indexes.some((idx: any) => idx.name.includes('dest'))).toBe(true);
    expect(indexes.some((idx: any) => idx.name.includes('route'))).toBe(true);
  });

  it('enforces UNIQUE constraint on (origin, dest, route_via)', () => {
    migration015.up(db);
    db.prepare(`
      INSERT INTO port_distances (origin, dest, route_via, distance_nm)
      VALUES ('BEANR', 'DEHAM', 'direct', 245.0)
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO port_distances (origin, dest, route_via, distance_nm)
        VALUES ('BEANR', 'DEHAM', 'direct', 246.0)
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('allows same origin+dest with different route_via', () => {
    migration015.up(db);
    db.prepare(`
      INSERT INTO port_distances (origin, dest, route_via, distance_nm)
      VALUES ('BRTER', 'CNQIN', 'suez', 11200.0)
    `).run();

    db.prepare(`
      INSERT INTO port_distances (origin, dest, route_via, distance_nm)
      VALUES ('BRTER', 'CNQIN', 'cape', 14500.0)
    `).run();

    const rows = db.prepare(`
      SELECT route_via, distance_nm FROM port_distances
      WHERE origin = 'BRTER' AND dest = 'CNQIN'
      ORDER BY route_via
    `).all() as any[];

    expect(rows).toHaveLength(2);
    expect(rows[0].route_via).toBe('cape');
    expect(rows[0].distance_nm).toBe(14500.0);
    expect(rows[1].route_via).toBe('suez');
    expect(rows[1].distance_nm).toBe(11200.0);
  });

  it('rolls back cleanly via down()', () => {
    migration015.up(db);
    migration015.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain('port_distances');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[];
    expect(indexes.some((idx: any) => idx.name.includes('origin'))).toBe(false);
    expect(indexes.some((idx: any) => idx.name.includes('dest'))).toBe(false);
    expect(indexes.some((idx: any) => idx.name.includes('route'))).toBe(false);
  });

  it('is idempotent (up() can run multiple times safely)', () => {
    migration015.up(db);
    expect(() => migration015.up(db)).not.toThrow();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).toContain('port_distances');
  });
});
