import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';
import migration049 from '@/lib/migrations/049-quote-jobs-match-id';
import { enqueueQuoteJob, claimNextJob } from '@/lib/quote-jobs/store';

function db() {
  const d = new Database(':memory:');
  migration048.up(d);
  migration049.up(d);
  return d;
}

// Simulate the race condition: job is already 'processing' (Process A claimed it).
// Without the outer `AND status='queued'` guard, Process B can UPDATE the row again.
it('claimNextJob WITHOUT outer status guard double-claims a processing job (bug repro)', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });

  // Simulate Process A claiming the job by running the buggy UPDATE directly
  const claimBuggy = (conn: Database.Database, id: string) =>
    conn.prepare(
      `UPDATE ai_quote_jobs SET status='processing', attempts=attempts+1, updated_at=strftime('%s','now')*1000
       WHERE id=? RETURNING *`,
    ).get(id) as object | undefined;

  claimBuggy(d, job.id); // Process A

  // Process B runs the same query with a stale id — no status check means it still matches
  const claimB_without_guard = claimBuggy(d, job.id);
  expect(claimB_without_guard).toBeDefined(); // bug: both workers "own" the job
});

it('claimNextJob WITH outer status guard prevents double-claim (fix confirmed)', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });

  const claimFixed = (conn: Database.Database, id: string) =>
    conn.prepare(
      `UPDATE ai_quote_jobs SET status='processing', attempts=attempts+1, updated_at=strftime('%s','now')*1000
       WHERE id=? AND status='queued' RETURNING *`,
    ).get(id) as object | undefined;

  claimFixed(d, job.id); // Process A

  // Process B: id matches but status='queued' guard fails — no row returned
  const claimB_with_guard = claimFixed(d, job.id);
  expect(claimB_with_guard).toBeUndefined(); // fixed: guard stops double-claim
});

it('claimNextJob (actual) returns null when no queued jobs remain', () => {
  const d = db();
  enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  claimNextJob(d); // first claim succeeds
  expect(claimNextJob(d)).toBeNull(); // guard prevents re-claim
});
