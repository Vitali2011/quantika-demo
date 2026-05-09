import { NextRequest, NextResponse } from 'next/server';

import { generateCsrfToken, validateCsrf } from '@/lib/csrf';
import { createSession, updateSession } from '@/lib/session';
import type { Email } from '@/lib/types';

import etmsEmailsRaw from '@/lib/sample-data/etms-emails.json';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sessionId = createSession('etms-demo-token');

  const emails: Email[] = (etmsEmailsRaw as Email[]);

  updateSession(sessionId, { emails });

  const csrfToken = generateCsrfToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://demo.quantika.org';
  const response = NextResponse.redirect(baseUrl + '/processing', 303);
  response.cookies.set('session_id', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
  });
  response.cookies.set('csrf_token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600,
    path: '/',
  });
  response.headers.set('X-CSRF-Token', csrfToken);

  return response;
}
