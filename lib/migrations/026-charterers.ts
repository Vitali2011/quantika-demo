import type { Migration } from './types';

const migration026: Migration = {
  version: 26,
  name: 'charterers',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS charterers (
        id           TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL UNIQUE,
        tier         TEXT NOT NULL CHECK(tier IN ('blue-chip','second','weak')),
        payment_history TEXT NOT NULL DEFAULT '[]',
        require_lc   INTEGER NOT NULL DEFAULT 0,
        notes        TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_charterers_tier ON charterers(tier);
      CREATE INDEX IF NOT EXISTS idx_charterers_name ON charterers(name);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_charterers_name;
      DROP INDEX IF EXISTS idx_charterers_tier;
      DROP TABLE IF EXISTS charterers;
    `);
  },
};

export default migration026;
