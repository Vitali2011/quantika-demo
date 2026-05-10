import type { Migration } from './types';

const SEED_BUNKER: Array<[string, string, number]> = [
  ['NLRTM', 'VLSFO', 791], ['NLRTM', 'MGO', 1192],
  ['SGSIN', 'VLSFO', 801], ['SGSIN', 'MGO', 1144],
  ['AEFJR', 'VLSFO', 880], ['AEFJR', 'MGO', 1482],
  ['USHOU', 'VLSFO', 806], ['USHOU', 'MGO', 1170],
  ['GIGIB', 'VLSFO', 771], ['GIGIB', 'MGO', 1172],
];

const migration023: Migration = {
  version: 23,
  name: 'bunker-prices-rewrite',
  up(db) {
    db.exec(`
      DROP TABLE IF EXISTS bunker_prices;
      CREATE TABLE bunker_prices (
        port_unlocode    TEXT NOT NULL,
        fuel_grade       TEXT NOT NULL,
        price_usd_per_mt REAL NOT NULL,
        price_date       TEXT NOT NULL,
        source           TEXT NOT NULL,
        fetched_at       TEXT NOT NULL,
        UNIQUE(port_unlocode, fuel_grade, price_date)
      );
      CREATE INDEX IF NOT EXISTS idx_bunker_lookup
        ON bunker_prices(port_unlocode, fuel_grade, price_date DESC);
    `);
    const stmt = db.prepare(
      `INSERT INTO bunker_prices (port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at)
       VALUES (?, ?, ?, '2026-05-09', 'static-seed', datetime('now'))`
    );
    const tx = db.transaction(() => {
      for (const [p, g, v] of SEED_BUNKER) stmt.run(p, g, v);
    });
    tx();
  },
  down(db) { db.exec(`DROP TABLE IF EXISTS bunker_prices;`); },
};

export default migration023;
