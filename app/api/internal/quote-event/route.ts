import { NextRequest, NextResponse } from 'next/server';
import { emitQuoteUpdate } from '@/lib/jobs/event-emitter';

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token');
  if (!process.env.INTERNAL_EVENT_TOKEN || token !== process.env.INTERNAL_EVENT_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { sessionId?: string; job?: { id: string; status: string; email_id: string; result?: string; error?: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!body.sessionId || !body.job) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  emitQuoteUpdate(body.sessionId, body.job as Parameters<typeof emitQuoteUpdate>[1]);
  return NextResponse.json({ ok: true }, { status: 202 });
}
