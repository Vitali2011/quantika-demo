import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken, validateCsrf } from '@/lib/csrf';
import { createDemoSession } from '@/lib/sample-data/create-demo-session';
import { sampleRateLimiter } from '@/lib/rate-limit';
import { SESSION_TTL_MS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const { allowed, retryAfterMs } = sampleRateLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  const sessionId = createDemoSession();

  const csrfToken = generateCsrfToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://demo.quantika.org';
  const response = NextResponse.redirect(baseUrl + '/processing', 303);
  response.cookies.set('session_id', sessionId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: SESSION_TTL_MS / 1000, path: '/' });
  response.cookies.set('csrf_token', csrfToken, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: SESSION_TTL_MS / 1000, path: '/' });
  response.headers.set('X-CSRF-Token', csrfToken);

  return response;
}
