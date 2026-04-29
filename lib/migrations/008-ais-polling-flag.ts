import type { Migration } from './types';

const migration008: Migration = {
  version: 8,
  name: 'ais-polling-flag',
  up(db) {
    db.exec(`
      ALTER TABLE deals ADD COLUMN polling_enabled INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_deals_polling ON deals(polling_enabled) WHERE polling_enabled = 1;
    `);
  },
  down(db) {
    // SQLite does not support DROP COLUMN in older versions; index removal only
    db.exec(`DROP INDEX IF EXISTS idx_deals_polling;`);
  },
};

export default migration008;
