import type { Migration } from './types';

const migration017: Migration = {
  version: 17,
  name: 'eca-zones',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS eca_zones (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        name                 TEXT NOT NULL UNIQUE,
        region               TEXT NOT NULL,
        polygon_geojson      TEXT NOT NULL,
        fuel_sulphur_max_pct REAL NOT NULL,
        effective_from       TEXT NOT NULL,
        effective_to         TEXT
      );
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS eca_zones;
    `);
  },
};

export default migration017;
