import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';
import migration049 from '@/lib/migrations/049-quote-jobs-match-id';
import {
  enqueueQuoteJob, getQuoteJob, claimNextJob, completeJob, failJob, reapStaleJobs,
  heartbeatJob, QueueFullError, countQueued,
} from '@/lib/quote-jobs/store';

function db() {
  const d = new Database(':memory:');
  migration048.up(d);
  migration049.up(d);
  return d;
}

it('enqueues a queued job and finds it by id', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  expect(job.status).toBe('queued');
  expect(getQuoteJob(d, job.id)?.email_id).toBe('e1');
});

it('dedupes a second enqueue for the same session+email in flight', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  const b = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  expect(b.id).toBe(a.id);
  expect(countQueued(d)).toBe(1);
});

it('claims the oldest queued job exactly once', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  const claimed = claimNextJob(d);
  expect(claimed?.id).toBe(a.id);
  expect(claimed?.status).toBe('processing');
  expect(claimNextJob(d)).toBeNull(); // nothing left to claim
});

it('completes and fails jobs terminally', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  claimNextJob(d);
  completeJob(d, a.id, 'Dear Sirs, ...');
  expect(getQuoteJob(d, a.id)?.status).toBe('done');
  expect(getQuoteJob(d, a.id)?.result).toContain('Dear Sirs');

  const b = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e2' });
  claimNextJob(d);
  failJob(d, b.id, 'claude CLI exited with status 1');
  expect(getQuoteJob(d, b.id)?.status).toBe('error');
});

it('throws QueueFullError past max depth', () => {
  const d = db();
  for (let i = 0; i < 20; i++) enqueueQuoteJob(d, { sessionId: 's1', emailId: `e${i}` });
  expect(() => enqueueQuoteJob(d, { sessionId: 's1', emailId: 'overflow' }, { maxDepth: 20 }))
    .toThrow(QueueFullError);
});

it('reaps stale processing jobs to error', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  claimNextJob(d);
  d.prepare(`UPDATE ai_quote_jobs SET updated_at = updated_at - 999999 WHERE id = ?`).run(a.id);
  const reaped = reapStaleJobs(d, 300_000);
  expect(reaped).toBe(1);
  expect(getQuoteJob(d, a.id)?.status).toBe('error');
});

it('concurrent-enqueue: ON CONFLICT returns existing in-flight row, no duplicate', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  // Simulate TOCTOU: after the SELECT check passes, force a unique-constraint conflict
  // by inserting directly (mimics a concurrent worker that won the race)
  expect(() =>
    d.prepare(`INSERT INTO ai_quote_jobs (id, session_id, email_id, status) VALUES ('x','s1','e1','queued')`).run(),
  ).toThrow(); // unique partial index prevents duplicate active job
  expect(countQueued(d)).toBe(1);
  // enqueueQuoteJob on same session+email returns the existing row
  const b = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  expect(b.id).toBe(a.id);
});

it('heartbeatJob keeps a processing job safe from the reaper', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  claimNextJob(d);
  // Age the job so it would normally be reaped
  d.prepare(`UPDATE ai_quote_jobs SET updated_at = updated_at - 999999 WHERE id = ?`).run(a.id);
  // Heartbeat refreshes updated_at
  heartbeatJob(d, a.id);
  // Reaper with a short TTL should NOT reap (updated_at just refreshed)
  expect(reapStaleJobs(d, 300_000)).toBe(0);
  expect(getQuoteJob(d, a.id)?.status).toBe('processing');
});

it('persists match_id when enqueued from a match', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1', matchId: '54332' });
  expect(getQuoteJob(d, job.id)?.match_id).toBe('54332');
});

it('match_id defaults to null when not provided', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e2' });
  expect(getQuoteJob(d, job.id)?.match_id).toBeNull();
});
