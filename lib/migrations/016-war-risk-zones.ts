import type { Migration } from './types';

const migration016: Migration = {
  version: 16,
  name: 'war-risk-zones',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS war_risk_zones (
        zone_id          TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        region           TEXT NOT NULL,
        polygon_geojson  TEXT,
        port_list        TEXT,
        transit_rate_pct REAL NOT NULL,
        hold_rate_pct    REAL NOT NULL,
        jwc_version      TEXT NOT NULL,
        effective_from   TEXT NOT NULL,
        effective_to     TEXT,
        source_url       TEXT,
        notes            TEXT,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_warrisk_region_active ON war_risk_zones(region, effective_to);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_warrisk_region_active;
      DROP TABLE IF EXISTS war_risk_zones;
    `);
  },
};

export default migration016;
