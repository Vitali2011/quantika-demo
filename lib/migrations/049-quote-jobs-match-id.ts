import type { Migration } from './types';

const migration049: Migration = {
  version: 49,
  name: '049-quote-jobs-match-id',
  up(db)  { db.exec(`ALTER TABLE ai_quote_jobs ADD COLUMN match_id TEXT`); },
  down(db){ db.exec(`ALTER TABLE ai_quote_jobs DROP COLUMN match_id`); },
};

export default migration049;
