import { NextRequest, NextResponse } from 'next/server';

import { exchangeCodeForToken as libExchangeCodeForToken, getAuthUrl } from '@/lib/google';
import { logger } from '@/lib/logger';
import { createSession } from '@/lib/session';
import { generateCsrfToken } from '@/lib/csrf';
import type { SessionData } from '@/lib/types';

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const { google } = await import('googleapis');
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.access_token) throw new Error('No access token received');
  return tokens.access_token;
}

export function buildSessionData(accessToken: string): Pick<SessionData, 'accessToken'> {
  return { accessToken };
}

export async function GET(request: NextRequest) {
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
    const accessToken = await libExchangeCodeForToken(code);
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
