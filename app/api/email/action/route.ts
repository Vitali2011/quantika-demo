import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import type { ProcessedEmail } from '@/lib/types';

type EmailAction = 'accept' | 'reject';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  let body: { emailId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { emailId, action } = body;
  if (!emailId || typeof emailId !== 'string') {
    return NextResponse.json({ error: 'emailId required' }, { status: 400 });
  }
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "accept" or "reject"' }, { status: 400 });
  }

  const typedAction = action as EmailAction;
  const newStatus = typedAction === 'accept' ? 'RESPONDED' : 'INFO_ONLY';
  const processedEmails: ProcessedEmail[] = session.processedEmails.map((p) =>
    p.emailId === emailId ? { ...p, status: newStatus } : p
  );
  updateSession(sessionId, { processedEmails });

  return NextResponse.json({ ok: true, emailId, status: newStatus });
}
