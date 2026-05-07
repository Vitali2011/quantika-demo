import Database from 'better-sqlite3';
import migration017 from '@/lib/migrations/017-eca-zones';

describe('migration 017 eca-zones', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });
  afterEach(() => db.close());

  it('creates eca_zones table with expected columns', () => {
    migration017.up(db);
    const cols = db.prepare("PRAGMA table_info(eca_zones)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'id', 'name', 'region', 'polygon_geojson',
        'fuel_sulphur_max_pct', 'effective_from', 'effective_to',
      ])
    );
  });

  it('enforces UNIQUE constraint on name', () => {
    migration017.up(db);
    db.prepare(`
      INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from)
      VALUES ('North Sea ECA', 'north-sea', '{"type":"Polygon","coordinates":[[[0,50],[10,50],[10,60],[0,60],[0,50]]]}', 0.10, '2015-01-01')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from)
        VALUES ('North Sea ECA', 'north-sea', '{"type":"Polygon","coordinates":[[[0,50],[10,50],[10,60],[0,60],[0,50]]]}', 0.10, '2015-01-01')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('allows NULL effective_to (currently active zone)', () => {
    migration017.up(db);
    const stmt = db.prepare(`
      INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from, effective_to)
      VALUES ('Baltic ECA', 'baltic', '{"type":"Polygon","coordinates":[[[10,50],[30,50],[30,65],[10,65],[10,50]]]}', 0.10, '2015-01-01', NULL)
    `);
    expect(() => stmt.run()).not.toThrow();

    const row = db.prepare("SELECT effective_to FROM eca_zones WHERE name = 'Baltic ECA'").get() as any;
    expect(row.effective_to).toBeNull();
  });

  it('stores fuel_sulphur_max_pct as REAL', () => {
    migration017.up(db);
    db.prepare(`
      INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from)
      VALUES ('North America ECA', 'north-america', '{"type":"Polygon"}', 0.10, '2015-01-01')
    `).run();

    const row = db.prepare("SELECT fuel_sulphur_max_pct FROM eca_zones WHERE name = 'North America ECA'").get() as any;
    expect(row.fuel_sulphur_max_pct).toBe(0.10);
    expect(typeof row.fuel_sulphur_max_pct).toBe('number');
  });

  it('has id as INTEGER PRIMARY KEY AUTOINCREMENT', () => {
    migration017.up(db);
    db.prepare(`
      INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from)
      VALUES ('Zone 1', 'test1', '{}', 0.10, '2015-01-01')
    `).run();
    db.prepare(`
      INSERT INTO eca_zones (name, region, polygon_geojson, fuel_sulphur_max_pct, effective_from)
      VALUES ('Zone 2', 'test2', '{}', 0.10, '2015-01-01')
    `).run();

    const rows = db.prepare("SELECT id FROM eca_zones ORDER BY id").all() as any[];
    expect(rows[0].id).toBe(1);
    expect(rows[1].id).toBe(2);
  });

  it('rolls back cleanly via down()', () => {
    migration017.up(db);
    migration017.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain('eca_zones');
  });

  it('is idempotent (up() can run multiple times safely)', () => {
    migration017.up(db);
    expect(() => migration017.up(db)).not.toThrow();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).toContain('eca_zones');
  });
});
