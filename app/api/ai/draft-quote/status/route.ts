import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getQuoteJob } from '@/lib/quote-jobs/store';

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (auth instanceof NextResponse) return auth;
  const { sessionId } = auth;
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const job = getQuoteJob(getStore().getDb(), jobId);
  if (!job || job.session_id !== sessionId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ id: job.id, status: job.status, result: job.result, error: job.error });
}
