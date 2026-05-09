/**
 * Migration 019: port_master + baltic_indices
 *
 * port_master  — UN/LOCODE port directory (structured rows, seeded via
 *                scripts/knowledge-unlocode-seed.ts)
 * baltic_indices — BDI/BCI/BSI/BHSI dry bulk freight indices (seeded via
 *                  scripts/knowledge-baltic-seed.ts)
 */

import type { Migration } from './types';

const migration019: Migration = {
  version: 19,
  name: 'port-master-baltic-indices',
  up(db) {
    db.exec(`
      -- UN/LOCODE port directory
      CREATE TABLE IF NOT EXISTS port_master (
        unlocode    TEXT PRIMARY KEY,                        -- 5-char UN/LOCODE e.g. "NLRTM"
        name        TEXT NOT NULL,                           -- canonical port name
        country     TEXT NOT NULL,                          -- ISO-2 country code
        lat         REAL,                                   -- decimal latitude (nullable)
        lon         REAL,                                   -- decimal longitude (nullable)
        subdivision TEXT,                                   -- state/province code
        updated_at  TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_port_master_country ON port_master(country);

      -- Baltic dry bulk freight indices (BDI / BCI / BSI / BHSI)
      CREATE TABLE IF NOT EXISTS baltic_indices (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        index_code  TEXT NOT NULL,                          -- 'BDI', 'BCI', 'BSI', 'BHSI'
        value       REAL NOT NULL,
        price_date  TEXT NOT NULL,                          -- ISO date 'YYYY-MM-DD'
        fetched_at  TEXT DEFAULT (datetime('now')),
        source      TEXT,
        UNIQUE(index_code, price_date)
      );

      CREATE INDEX IF NOT EXISTS idx_baltic_indices_code_date ON baltic_indices(index_code, price_date DESC);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_baltic_indices_code_date;
      DROP TABLE IF EXISTS baltic_indices;
      DROP INDEX IF EXISTS idx_port_master_country;
      DROP TABLE IF EXISTS port_master;
    `);
  },
};

export default migration019;
