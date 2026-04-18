import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { groupByCounterparty } from '@/lib/counterparty';

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  const counterparties = groupByCounterparty(session.emails, session.classifications);
  updateSession(sessionId, { counterparties });

  return NextResponse.json({ count: counterparties.length });
}
