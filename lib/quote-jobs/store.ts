import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type QuoteJobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface QuoteJob {
  id: string;
  session_id: string;
  email_id: string;
  status: QuoteJobStatus;
  result: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

export class QueueFullError extends Error {
  constructor(depth: number) { super(`quote queue full (depth=${depth})`); this.name = 'QueueFullError'; }
}

const DEFAULT_MAX_DEPTH = Number(process.env.QUOTE_QUEUE_MAX_DEPTH) || 20;

export function countQueued(db: Database.Database): number {
  return (db.prepare(`SELECT COUNT(*) n FROM ai_quote_jobs WHERE status='queued'`).get() as { n: number }).n;
}

export function getQuoteJob(db: Database.Database, id: string): QuoteJob | undefined {
  return db.prepare(`SELECT * FROM ai_quote_jobs WHERE id = ?`).get(id) as QuoteJob | undefined;
}

export function enqueueQuoteJob(
  db: Database.Database,
  input: { sessionId: string; emailId: string },
  opts: { maxDepth?: number } = {},
): QuoteJob {
  const existing = db.prepare(
    `SELECT * FROM ai_quote_jobs WHERE session_id=? AND email_id=? AND status IN ('queued','processing')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(input.sessionId, input.emailId) as QuoteJob | undefined;
  if (existing) return existing;

  const depth = countQueued(db);
  const max = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (depth >= max) throw new QueueFullError(depth);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ai_quote_jobs (id, session_id, email_id, status) VALUES (?,?,?,'queued')`,
  ).run(id, input.sessionId, input.emailId);
  return getQuoteJob(db, id)!;
}

export function claimNextJob(db: Database.Database): QuoteJob | null {
  const row = db.prepare(
    `UPDATE ai_quote_jobs
       SET status='processing', attempts = attempts + 1, updated_at = strftime('%s','now') * 1000
     WHERE id = (SELECT id FROM ai_quote_jobs WHERE status='queued' ORDER BY created_at LIMIT 1)
     RETURNING *`,
  ).get() as QuoteJob | undefined;
  return row ?? null;
}

export function completeJob(db: Database.Database, id: string, result: string): void {
  db.prepare(
    `UPDATE ai_quote_jobs SET status='done', result=?, updated_at = strftime('%s','now') * 1000 WHERE id=?`,
  ).run(result, id);
}

export function failJob(db: Database.Database, id: string, error: string): void {
  db.prepare(
    `UPDATE ai_quote_jobs SET status='error', error=?, updated_at = strftime('%s','now') * 1000 WHERE id=?`,
  ).run(error.slice(0, 500), id);
}

export function reapStaleJobs(db: Database.Database, ttlMs = 120_000): number {
  const cutoff = `strftime('%s','now') * 1000 - ${Number(ttlMs)}`;
  const r = db.prepare(
    `UPDATE ai_quote_jobs SET status='error', error='stale: worker did not finish in time',
       updated_at = strftime('%s','now') * 1000
     WHERE status='processing' AND updated_at < (${cutoff})`,
  ).run();
  return r.changes;
}
