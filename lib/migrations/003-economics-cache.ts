import type { Migration } from './types';

const migration003: Migration = {
  version: 3,
  name: 'economics-cache',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bunker_prices (
        port       TEXT NOT NULL,
        day        TEXT NOT NULL,
        vlsfo      REAL NOT NULL,
        mgo        REAL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (port, day)
      );

      CREATE TABLE IF NOT EXISTS eua_prices (
        day        TEXT PRIMARY KEY,
        price      REAL NOT NULL,
        fetched_at TEXT NOT NULL
      );
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS eua_prices;
      DROP TABLE IF EXISTS bunker_prices;
    `);
  },
};

export default migration003;
