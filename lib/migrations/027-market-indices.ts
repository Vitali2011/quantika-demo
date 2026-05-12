import type { Migration } from './types';

const migration027: Migration = {
  version: 27,
  name: 'market-indices',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_indices (
        id          TEXT PRIMARY KEY NOT NULL,
        index_name  TEXT NOT NULL,
        index_date  TEXT NOT NULL,
        value       REAL NOT NULL,
        unit        TEXT NOT NULL DEFAULT 'USD/day',
        source      TEXT NOT NULL,
        fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(index_name, index_date)
      );
      CREATE INDEX IF NOT EXISTS idx_market_indices_lookup
        ON market_indices(index_name, index_date DESC);
    `);
  },
  down(db) { db.exec(`DROP TABLE IF EXISTS market_indices;`); },
};

export default migration027;
