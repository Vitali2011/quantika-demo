import type { Migration } from './types';

const migration028: Migration = {
  version: 28,
  name: 'psc-history',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS psc_detention_history (
        id           TEXT PRIMARY KEY NOT NULL,
        imo          TEXT NOT NULL,
        inspection_date TEXT NOT NULL,
        port         TEXT,
        authority    TEXT NOT NULL CHECK(authority IN ('paris-mou','tokyo-mou','uscg','other')),
        deficiencies INTEGER NOT NULL DEFAULT 0,
        detained     INTEGER NOT NULL DEFAULT 0,
        source_url   TEXT,
        fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_psc_imo ON psc_detention_history(imo, inspection_date DESC);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_psc_imo;
      DROP TABLE IF EXISTS psc_detention_history;
    `);
  },
};

export default migration028;
