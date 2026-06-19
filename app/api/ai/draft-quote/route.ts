import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { DraftQuoteBodySchema } from '@/lib/api-schemas';
import { getStore } from '@/lib/session-store';
import { getMatch } from '@/lib/matching/matches-repository';
import { enqueueQuoteJob, QueueFullError } from '@/lib/quote-jobs/store';
import { ensureWorker } from '@/lib/quote-jobs/ensure-worker';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const parsed = DraftQuoteBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body', details: parsed.error.format() }, { status: 400 });
  const { emailId, matchId } = parsed.data;

  const parsedCargo = session.parsedCargos.find(r => r.emailId === emailId);
  if (!parsedCargo) return NextResponse.json({ error: 'Parsed request not found' }, { status: 404 });

  const db = getStore().getDb();

  // IDOR guard: a matchId is opaque to the worker (getMatch has no user_id
  // filter), so verify ownership here before enqueue. Mirror matches/[id] —
  // return 404 for both missing matches and matches owned by another session,
  // so we never leak the existence of another session's match.
  if (matchId !== undefined) {
    const numId = Number(matchId);
    const m = Number.isInteger(numId) && numId >= 1 ? getMatch(db, numId) : null;
    if (!m || m.user_id !== sessionId) {
      return NextResponse.json({ error: `Match not found: ${matchId}` }, { status: 404 });
    }
  }

  try {
    const job = enqueueQuoteJob(db, { sessionId, emailId, matchId });
    ensureWorker();
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (err) {
    if (err instanceof QueueFullError) {
      return NextResponse.json({ error: 'queue_full', message: 'Too many quotes in progress — please retry shortly.', retryable: true }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Failed to enqueue quote job';
    return NextResponse.json({ error: 'enqueue_error', message }, { status: 500 });
  }
}
