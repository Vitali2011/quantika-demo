import type { Migration } from './types';

const migration015: Migration = {
  version: 15,
  name: 'port-distances',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS port_distances (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        origin          TEXT NOT NULL,
        dest            TEXT NOT NULL,
        route_via       TEXT NOT NULL DEFAULT 'direct',
        distance_nm     REAL NOT NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(origin, dest, route_via)
      );
      CREATE INDEX IF NOT EXISTS idx_port_distances_origin ON port_distances(origin);
      CREATE INDEX IF NOT EXISTS idx_port_distances_dest ON port_distances(dest);
      CREATE INDEX IF NOT EXISTS idx_port_distances_route ON port_distances(route_via);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_port_distances_route;
      DROP INDEX IF EXISTS idx_port_distances_dest;
      DROP INDEX IF EXISTS idx_port_distances_origin;
      DROP TABLE IF EXISTS port_distances;
    `);
  },
};

export default migration015;
