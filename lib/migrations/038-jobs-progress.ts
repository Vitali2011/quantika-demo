import type { Migration } from './types';

const migration038: Migration = {
  version: 38,
  name: '038-jobs-progress',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'queue'
                         CHECK(status IN ('queue','processing','done','error')),
        progress_percent INTEGER NOT NULL DEFAULT 0,
        current_step     TEXT,
        email_subject    TEXT,
        email_from       TEXT,
        created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_jobs_user_status;
      DROP TABLE IF EXISTS jobs;
    `);
  },
};

export default migration038;
