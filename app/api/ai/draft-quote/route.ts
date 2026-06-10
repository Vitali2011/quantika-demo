import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { DraftQuoteBodySchema } from '@/lib/api-schemas';
import { getStore } from '@/lib/session-store';
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
  const { emailId } = parsed.data;

  const parsedCargo = session.parsedCargos.find(r => r.emailId === emailId);
  if (!parsedCargo) return NextResponse.json({ error: 'Parsed request not found' }, { status: 404 });

  try {
    const job = enqueueQuoteJob(getStore().getDb(), { sessionId, emailId });
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
