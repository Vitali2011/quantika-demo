import type { Migration } from './types';

const migration030: Migration = {
  version: 30,
  name: 'roi-metrics',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS roi_metrics (
        id               TEXT PRIMARY KEY NOT NULL,
        voyage_id        TEXT NOT NULL,
        deal_date        TEXT NOT NULL,
        cohort_month     TEXT NOT NULL,
        freight_usd      REAL,
        bunker_cost_usd  REAL,
        demurrage_usd    REAL,
        despatch_usd     REAL,
        tce_actual_usd   REAL,
        tce_baseline_usd REAL,
        savings_usd      REAL GENERATED ALWAYS AS
          (COALESCE(tce_actual_usd,0) - COALESCE(tce_baseline_usd,0)) STORED,
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_roi_cohort ON roi_metrics(cohort_month, deal_date);
      CREATE INDEX IF NOT EXISTS idx_roi_voyage ON roi_metrics(voyage_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_roi_voyage;
      DROP INDEX IF EXISTS idx_roi_cohort;
      DROP TABLE IF EXISTS roi_metrics;
    `);
  },
};

export default migration030;
