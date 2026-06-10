import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';
import migration049 from '@/lib/migrations/049-quote-jobs-match-id';

it('adds a nullable match_id column to ai_quote_jobs', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  migration049.up(db);
  const cols = (db.prepare(`PRAGMA table_info(ai_quote_jobs)`).all() as { name: string }[]).map(c => c.name);
  expect(cols).toContain('match_id');
  // existing inserts without match_id still work (nullable)
  expect(() =>
    db.prepare(`INSERT INTO ai_quote_jobs (id,session_id,email_id,status) VALUES ('j','s','e','queued')`).run(),
  ).not.toThrow();
});

it('match_id accepts a string value', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  migration049.up(db);
  expect(() =>
    db.prepare(`INSERT INTO ai_quote_jobs (id,session_id,email_id,status,match_id) VALUES ('j2','s','e','queued','54332')`).run(),
  ).not.toThrow();
  const row = db.prepare(`SELECT match_id FROM ai_quote_jobs WHERE id='j2'`).get() as { match_id: string };
  expect(row.match_id).toBe('54332');
});

it('down() drops the match_id column', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  migration049.up(db);
  migration049.down(db);
  const cols = (db.prepare(`PRAGMA table_info(ai_quote_jobs)`).all() as { name: string }[]).map(c => c.name);
  expect(cols).not.toContain('match_id');
});
