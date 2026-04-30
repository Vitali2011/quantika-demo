import type { Migration } from './types';

const migration010: Migration = {
  version: 10,
  name: 'port-da-estimates',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS port_da_estimates (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        port_code               TEXT NOT NULL,
        port_name               TEXT NOT NULL,
        vessel_dwt_min          INTEGER NOT NULL,
        vessel_dwt_max          INTEGER NOT NULL,
        port_dues_usd           REAL NOT NULL,
        pilotage_usd            REAL NOT NULL,
        tugs_usd                REAL NOT NULL,
        stevedoring_usd_per_mt  REAL NOT NULL,
        cargo_type              TEXT NOT NULL,
        confidence              TEXT NOT NULL,
        source                  TEXT NOT NULL,
        updated_at              INTEGER NOT NULL,
        UNIQUE (port_code, vessel_dwt_min, vessel_dwt_max, cargo_type)
      );
      CREATE INDEX IF NOT EXISTS idx_port_da_lookup
        ON port_da_estimates(port_code, vessel_dwt_min, vessel_dwt_max, cargo_type);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_port_da_lookup;
      DROP TABLE IF EXISTS port_da_estimates;
    `);
  },
};

export default migration010;
