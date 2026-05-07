import type { Migration } from './types';

const migration014: Migration = {
  version: 14,
  name: 'sanctions-entities',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ofac_entities (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        uid             TEXT NOT NULL,
        type            TEXT NOT NULL,
        name            TEXT NOT NULL,
        name_normalized TEXT NOT NULL,
        aliases         TEXT,
        country         TEXT,
        address         TEXT,
        programs        TEXT,
        publish_date    TEXT,
        raw             TEXT,
        fetched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(uid)
      );
      CREATE INDEX IF NOT EXISTS idx_ofac_name_norm ON ofac_entities(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_ofac_country ON ofac_entities(country);

      CREATE TABLE IF NOT EXISTS eu_sanctions_entities (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        uid             TEXT NOT NULL,
        type            TEXT NOT NULL,
        name            TEXT NOT NULL,
        name_normalized TEXT NOT NULL,
        aliases         TEXT,
        country         TEXT,
        address         TEXT,
        programs        TEXT,
        publish_date    TEXT,
        raw             TEXT,
        fetched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(uid)
      );
      CREATE INDEX IF NOT EXISTS idx_eu_name_norm ON eu_sanctions_entities(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_eu_country ON eu_sanctions_entities(country);

      CREATE VIEW IF NOT EXISTS sanction_corpus_view AS
      SELECT 'ofac' AS source, uid, type, name, name_normalized, aliases, country, programs FROM ofac_entities
      UNION ALL
      SELECT 'eu' AS source, uid, type, name, name_normalized, aliases, country, programs FROM eu_sanctions_entities;
    `);
  },
  down(db) {
    db.exec(`
      DROP VIEW IF EXISTS sanction_corpus_view;
      DROP INDEX IF EXISTS idx_eu_country;
      DROP INDEX IF EXISTS idx_eu_name_norm;
      DROP TABLE IF EXISTS eu_sanctions_entities;
      DROP INDEX IF EXISTS idx_ofac_country;
      DROP INDEX IF EXISTS idx_ofac_name_norm;
      DROP TABLE IF EXISTS ofac_entities;
    `);
  },
};

export default migration014;
