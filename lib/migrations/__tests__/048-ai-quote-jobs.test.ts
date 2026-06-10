import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';

it('creates ai_quote_jobs with the expected columns and index', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  const cols = (db.prepare(`PRAGMA table_info(ai_quote_jobs)`).all() as { name: string }[]).map(c => c.name);
  expect(cols).toEqual(expect.arrayContaining([
    'id', 'session_id', 'email_id', 'status', 'result', 'error', 'attempts', 'created_at', 'updated_at',
  ]));
  // status CHECK constraint rejects unknown states
  expect(() => db.prepare(
    `INSERT INTO ai_quote_jobs (id, session_id, email_id, status) VALUES ('j1','s1','e1','bogus')`,
  ).run()).toThrow();
});

it('down() drops the table', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  migration048.down(db);
  const t = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ai_quote_jobs'`).get();
  expect(t).toBeUndefined();
});
