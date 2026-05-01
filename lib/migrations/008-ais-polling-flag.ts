import type { Migration } from './types';

const migration008: Migration = {
  version: 8,
  name: 'ais-polling-flag',
  up(db) {
    // Guard: deals table may not exist yet in test/CI in-memory DBs
    const tableRow = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='deals'"
      )
      .get();
    if (!tableRow) return;

    // Idempotent: skip if column already exists (SQLite < 3.37 has no ADD COLUMN IF NOT EXISTS)
    const cols = db.prepare('PRAGMA table_info(deals)').all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'polling_enabled')) return;

    db.exec(`ALTER TABLE deals ADD COLUMN polling_enabled INTEGER NOT NULL DEFAULT 0;`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_deals_polling ON deals(polling_enabled) WHERE polling_enabled = 1;`
    );
  },
  down(db) {
    // SQLite does not support DROP COLUMN in older versions; index removal only
    db.exec(`DROP INDEX IF EXISTS idx_deals_polling;`);
  },
};

export default migration008;
