import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { groupByCounterparty } from '@/lib/counterparty';

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const counterparties = groupByCounterparty(session.emails, session.classifications);
  updateSession(sessionId, { counterparties });

  return NextResponse.json({ count: counterparties.length });
}
