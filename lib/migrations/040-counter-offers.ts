import type { Migration } from './types';

const migration040: Migration = {
  version: 40,
  name: '040-counter-offers',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS counter_offers (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id        INTEGER NOT NULL REFERENCES matches(id),
        user_id         TEXT    NOT NULL,
        counter_rate    REAL    NOT NULL,
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_counter_offers_match
        ON counter_offers(match_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_counter_offers_match;
      DROP TABLE IF EXISTS counter_offers;
    `);
  },
};

export default migration040;
