import type { Migration } from './types';

const migration024: Migration = {
  version: 24,
  name: 'eua-prices-rewrite',
  up(db) {
    db.exec(`
      DROP TABLE IF EXISTS eua_prices;
      CREATE TABLE eua_prices (
        price_date         TEXT NOT NULL,
        price_eur_per_tco2 REAL NOT NULL,
        contract_type      TEXT NOT NULL DEFAULT 'spot',
        source             TEXT NOT NULL,
        fetched_at         TEXT NOT NULL,
        UNIQUE(price_date, contract_type)
      );
      CREATE INDEX IF NOT EXISTS idx_eua_lookup ON eua_prices(contract_type, price_date DESC);
    `);
    db.prepare(
      `INSERT INTO eua_prices (price_date, price_eur_per_tco2, contract_type, source, fetched_at)
       VALUES ('2026-05-04', 72.65, 'spot', 'eex-auction-static-seed', datetime('now'))`
    ).run();
  },
  down(db) { db.exec(`DROP TABLE IF EXISTS eua_prices;`); },
};

export default migration024;
