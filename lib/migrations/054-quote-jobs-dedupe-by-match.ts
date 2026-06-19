import type { Migration } from './types';

/**
 * Dedupe active quote jobs by (session_id, email_id, match_id), not just
 * (session_id, email_id). One email can match several vessels — same
 * session_id + email_id, different match_id, different economics. The old
 * UNIQUE index from 048 collapsed them, so enqueuing for match B while match A
 * was in-flight returned match A's job and the UI rendered the wrong draft.
 * COALESCE(match_id,'') keeps null-match_id rows (legacy / no-match enqueues)
 * deduping as before.
 */
const migration054: Migration = {
  version: 54,
  name: 'quote-jobs-dedupe-by-match',
  up(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_quote_jobs_active_dedupe;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_jobs_active_dedupe
        ON ai_quote_jobs(session_id, email_id, COALESCE(match_id,''))
        WHERE status IN ('queued','processing');
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_quote_jobs_active_dedupe;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_jobs_active_dedupe
        ON ai_quote_jobs(session_id, email_id)
        WHERE status IN ('queued','processing');
    `);
  },
};

export default migration054;
