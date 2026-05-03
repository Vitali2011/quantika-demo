import type { Migration } from './types';

const migration011: Migration = {
  version: 11,
  name: 'notified-dispatches',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notified_dispatches (
        deal_id      TEXT    NOT NULL,
        deadline_id  TEXT    NOT NULL,
        stage        TEXT    NOT NULL,
        channel      TEXT    NOT NULL,
        notified_at  INTEGER NOT NULL,
        PRIMARY KEY (deal_id, deadline_id, stage, channel)
      );
      CREATE INDEX IF NOT EXISTS idx_notified_dispatches_lookup
        ON notified_dispatches(deal_id, deadline_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_notified_dispatches_lookup;
      DROP TABLE IF EXISTS notified_dispatches;
    `);
  },
};

export default migration011;
