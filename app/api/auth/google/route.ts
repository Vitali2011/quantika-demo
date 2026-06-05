import { NextRequest, NextResponse } from 'next/server';

import { exchangeCodeForToken, fetchGmailProfile, getAuthUrl } from '@/lib/google';
import { logger } from '@/lib/logger';
import { createSession, updateSession } from '@/lib/session';
import { generateCsrfToken } from '@/lib/csrf';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    const baseUrl = getRequestBaseUrl(request);
    return NextResponse.redirect(new URL('/?error=access_denied', baseUrl));
  }

  if (!code) {
    const authUrl = getAuthUrl();
    return NextResponse.redirect(authUrl);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const sessionId = createSession(accessToken);
    try {
      const accountId = await fetchGmailProfile(accessToken);
      if (accountId) updateSession(sessionId, { accountId });
    } catch (err) {
      // Profile lookup is non-fatal — without accountId the app falls back to
      // the legacy ephemeral path (parse, don't cache). Never block login.
      logger.error({ err }, "Gmail profile fetch failed");
    }
    const csrfToken = generateCsrfToken();

    const baseUrl = getRequestBaseUrl(request);
    const response = NextResponse.redirect(new URL('/processing', baseUrl));
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60,
      path: '/',
    });
    response.headers.set('X-CSRF-Token', csrfToken);

    return response;
  } catch (err) {
    logger.error({ err }, 'OAuth error');
    const baseUrl = getRequestBaseUrl(request);
    return NextResponse.redirect(new URL('/?error=auth_failed', baseUrl));
  }
}
