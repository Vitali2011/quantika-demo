import type { Migration } from './types';

const migration005: Migration = {
  version: 5,
  name: 'market-benchmarks',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_benchmarks (
        indicator  TEXT NOT NULL,
        period     TEXT NOT NULL,
        value      REAL NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (indicator, period)
      );
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS market_benchmarks;`);
  },
};

export default migration005;
