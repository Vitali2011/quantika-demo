import Database from 'better-sqlite3';
import migration016 from '@/lib/migrations/016-war-risk-zones';

describe('migration 016 war-risk-zones', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });
  afterEach(() => db.close());

  it('creates war_risk_zones table with expected columns', () => {
    migration016.up(db);
    const cols = db.prepare("PRAGMA table_info(war_risk_zones)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'zone_id', 'name', 'region', 'polygon_geojson', 'port_list',
        'transit_rate_pct', 'hold_rate_pct', 'jwc_version',
        'effective_from', 'effective_to', 'source_url', 'notes', 'created_at',
      ])
    );
  });

  it('enforces zone_id as PRIMARY KEY', () => {
    migration016.up(db);
    db.prepare(`
      INSERT INTO war_risk_zones (zone_id, name, region, transit_rate_pct, hold_rate_pct, jwc_version, effective_from)
      VALUES ('red-sea', 'Red Sea', 'red-sea', 0.75, 0.50, 'JWC-2025-Q1', '2025-01-15')
    `).run();

    expect(() => {
      db.prepare(`
        INSERT INTO war_risk_zones (zone_id, name, region, transit_rate_pct, hold_rate_pct, jwc_version, effective_from)
        VALUES ('red-sea', 'Red Sea Updated', 'red-sea', 0.80, 0.55, 'JWC-2025-Q2', '2025-04-01')
      `).run();
    }).toThrow(/UNIQUE constraint failed|PRIMARY KEY/);
  });

  it('creates index idx_warrisk_region_active', () => {
    migration016.up(db);
    const indexes = db.prepare("PRAGMA index_list(war_risk_zones)").all() as any[];
    expect(indexes.some((idx: any) => idx.name === 'idx_warrisk_region_active')).toBe(true);
  });

  it('allows NULL polygon_geojson', () => {
    migration016.up(db);
    expect(() => {
      db.prepare(`
        INSERT INTO war_risk_zones (zone_id, name, region, polygon_geojson, port_list, transit_rate_pct, hold_rate_pct, jwc_version, effective_from)
        VALUES ('gulf-of-guinea', 'Gulf of Guinea', 'gulf-of-guinea', NULL, '["NGLOS","NGPHC"]', 0.50, 0.30, 'JWC-2025-Q1', '2025-01-15')
      `).run();
    }).not.toThrow();
  });

  it('allows NULL port_list', () => {
    migration016.up(db);
    expect(() => {
      db.prepare(`
        INSERT INTO war_risk_zones (zone_id, name, region, polygon_geojson, port_list, transit_rate_pct, hold_rate_pct, jwc_version, effective_from)
        VALUES ('black-sea', 'Black Sea', 'black-sea', '{"type":"Polygon","coordinates":[[[28,41],[35,41],[35,46],[28,46],[28,41]]]}', NULL, 0.60, 0.40, 'JWC-2025-Q1', '2025-01-15')
      `).run();
    }).not.toThrow();
  });

  it('allows NULL effective_to (currently active zone)', () => {
    migration016.up(db);
    const stmt = db.prepare(`
      INSERT INTO war_risk_zones (zone_id, name, region, transit_rate_pct, hold_rate_pct, jwc_version, effective_from, effective_to)
      VALUES ('persian-gulf', 'Persian Gulf', 'persian-gulf', 0.45, 0.25, 'JWC-2025-Q1', '2025-01-15', NULL)
    `);
    expect(() => stmt.run()).not.toThrow();

    const row = db.prepare("SELECT effective_to FROM war_risk_zones WHERE zone_id = 'persian-gulf'").get() as any;
    expect(row.effective_to).toBeNull();
  });

  it('rolls back cleanly via down()', () => {
    migration016.up(db);
    migration016.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain('war_risk_zones');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[];
    expect(indexes.some((idx: any) => idx.name === 'idx_warrisk_region_active')).toBe(false);
  });

  it('is idempotent (up() can run multiple times safely)', () => {
    migration016.up(db);
    expect(() => migration016.up(db)).not.toThrow();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).toContain('war_risk_zones');
  });
});
