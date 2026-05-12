import type { Migration } from './types';

const migration025: Migration = {
  version: 25,
  name: 'fx-rates',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        base_currency  TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        rate           REAL NOT NULL,
        rate_date      TEXT NOT NULL,
        source         TEXT NOT NULL DEFAULT 'frankfurter',
        fetched_at     TEXT NOT NULL,
        PRIMARY KEY (base_currency, quote_currency, rate_date)
      );
      CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
        ON fx_rates(base_currency, quote_currency, rate_date DESC);
    `);
  },
  down(db) { db.exec(`DROP TABLE IF EXISTS fx_rates;`); },
};

export default migration025;
