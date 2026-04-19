import { NextRequest, NextResponse } from 'next/server';

import { exchangeCodeForToken, getAuthUrl } from '@/lib/google';
import { withSentryApiHandler } from '@/lib/sentry-api';
import { logger } from '@/lib/logger';
import { createSession } from '@/lib/session';
import { generateCsrfToken } from '@/lib/csrf';

async function _GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
    return NextResponse.redirect(new URL('/?error=access_denied', baseUrl));
  }

  if (!code) {
    const authUrl = getAuthUrl();
    return NextResponse.redirect(authUrl);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const sessionId = createSession(accessToken);
    const csrfToken = generateCsrfToken();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;
    return NextResponse.redirect(new URL('/?error=auth_failed', baseUrl));
  }
}

export const GET = withSentryApiHandler(_GET, { method: 'GET', path: '/api/auth/google' });
