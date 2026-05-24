import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';
import { deleteSession } from '@/lib/session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Delete the OAuth session so re-login always starts with a fresh access token.
  // Without this, a stale session_id cookie survives logout and the expired token
  // causes /api/emails/fetch to 500 on the next pipeline run.
  const sessionId = request.cookies?.get?.('session_id')?.value;
  if (sessionId) {
    deleteSession(sessionId);
  }

  const response = NextResponse.redirect(new URL('/login', getRequestBaseUrl(request)), { status: 303 });

  // Clear the auth cookie by setting Max-Age=0
  response.headers.set(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
  // Clear OAuth session cookies so the browser cannot reuse the deleted session.
  response.headers.append('Set-Cookie', 'session_id=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  response.headers.append('Set-Cookie', 'csrf_token=; Path=/; Max-Age=0; SameSite=Strict');

  return response;
}
