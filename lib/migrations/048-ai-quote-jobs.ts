import type { Migration } from './types';

const migration048: Migration = {
  version: 48,
  name: '048-ai-quote-jobs',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_quote_jobs (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        email_id    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'queued'
                    CHECK(status IN ('queued','processing','done','error')),
        result      TEXT,
        error       TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_quote_jobs_status ON ai_quote_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_quote_jobs_session_email ON ai_quote_jobs(session_id, email_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_jobs_active_dedupe ON ai_quote_jobs(session_id, email_id) WHERE status IN ('queued','processing');
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_quote_jobs_active_dedupe;
      DROP INDEX IF EXISTS idx_quote_jobs_session_email;
      DROP INDEX IF EXISTS idx_quote_jobs_status;
      DROP TABLE IF EXISTS ai_quote_jobs;
    `);
  },
};

export default migration048;
