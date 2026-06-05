import { NextRequest, NextResponse } from 'next/server';

import { generateCsrfToken, validateCsrf } from '@/lib/csrf';
import { CorpusNotFoundError, loadCorpus } from '@/lib/corpus/loader';
import { createSession, updateSession } from '@/lib/session';
import { SESSION_TTL_MS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let emails: Awaited<ReturnType<typeof loadCorpus>>;
  try {
    emails = await loadCorpus();
  } catch (e) {
    if (e instanceof CorpusNotFoundError) {
      return NextResponse.json(
        { error: 'Corpus not loaded. Run npm run build:corpus.' },
        { status: 503 },
      );
    }
    console.error('etms-demo corpus load failed', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const sessionId = createSession('etms-demo-token');

  updateSession(sessionId, { emails });

  const csrfToken = generateCsrfToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://demo.quantika.org';
  const response = NextResponse.redirect(baseUrl + '/processing', 303);
  response.cookies.set('session_id', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
  response.cookies.set('csrf_token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
  response.headers.set('X-CSRF-Token', csrfToken);

  return response;
}
