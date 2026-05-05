import type { Migration } from './types';

const migration015: Migration = {
  version: 15,
  name: 'port-distances',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS port_distances (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        port_from       TEXT NOT NULL,
        port_to         TEXT NOT NULL,
        distance_nm     REAL NOT NULL,
        source          TEXT,
        fetched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(port_from, port_to)
      );
      CREATE INDEX IF NOT EXISTS idx_port_from ON port_distances(port_from);
      CREATE INDEX IF NOT EXISTS idx_port_to ON port_distances(port_to);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_port_to;
      DROP INDEX IF EXISTS idx_port_from;
      DROP TABLE IF EXISTS port_distances;
    `);
  },
};

export default migration015;
