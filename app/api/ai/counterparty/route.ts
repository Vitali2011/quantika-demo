import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { withSentryApiHandler } from '@/lib/sentry-api';
import { requireSession, updateSession } from '@/lib/session';
import { groupByCounterparty } from '@/lib/counterparty';

export const maxDuration = 10;

async function _POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  const counterparties = groupByCounterparty(session.emails, session.classifications);
  updateSession(sessionId, { counterparties });

  return NextResponse.json({ count: counterparties.length });
}

export const POST = withSentryApiHandler(_POST, { method: 'POST', path: '/api/ai/counterparty' });
