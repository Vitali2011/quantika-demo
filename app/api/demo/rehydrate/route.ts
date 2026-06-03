import { NextRequest, NextResponse } from 'next/server';
import { getAuthConfig } from '@/lib/auth/config';
import { verifyAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';

/**
 * GET /api/demo/rehydrate?next=<path>
 *
 * Re-creates the demo session when session_id has expired while demo_auth is still valid.
 * Root cause of #790: SESSION_TTL_MS (1h) < DEMO_AUTH_COOKIE_DAYS (30d); after 1h the
 * session_id cookie expires but the user is still authenticated — page.tsx renders empty state.
 *
 * Flow: middleware detects session_id absent → redirects here → creates fresh session →
 * sets session_id cookie → redirects back to the original page.
 *
 * This is a Node.js route handler (not edge middleware) so it can use better-sqlite3
 * via createSession / hydrateDemoSession.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authConfig = getAuthConfig();

  // Only active in DEMO_MODE
  if (process.env.DEMO_MODE !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify demo_auth cookie — same check as middleware auth guard
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = cookieValue && authConfig.secret
    ? await verifyAuthCookie(cookieValue, authConfig.secret)
    : null;

  if (!payload) {
    const loginUrl = new URL('/login', getRequestBaseUrl(request));
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // Sanitise the `next` redirect target — must be a relative path to prevent open redirect.
  const rawNext = request.nextUrl.searchParams.get('next') ?? '/dashboard';
  const safePath =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  const { createSession } = await import('@/lib/session');
  const { hydrateDemoSession } = await import('@/lib/demo-mode/hydrate-demo-session');
  const { generateCsrfToken } = await import('@/lib/csrf');

  // Session TTL aligned with auth cookie lifetime
  const sessionTtlMs = authConfig.cookieDays * 86_400 * 1000;
  const sessionId = createSession('demo-seed', sessionTtlMs);
  hydrateDemoSession(sessionId);

  const sessionMaxAge = authConfig.cookieDays * 86_400;
  const isProduction = process.env.NODE_ENV === 'production';
  const csrfToken = generateCsrfToken();

  const response = NextResponse.redirect(new URL(safePath, getRequestBaseUrl(request)), {
    status: 302,
  });

  response.headers.append(
    'Set-Cookie',
    [
      `session_id=${sessionId}`,
      'Path=/',
      `Max-Age=${sessionMaxAge}`,
      'HttpOnly',
      isProduction ? 'Secure' : '',
      'SameSite=Lax',
    ]
      .filter(Boolean)
      .join('; '),
  );

  response.headers.append(
    'Set-Cookie',
    [
      `csrf_token=${csrfToken}`,
      'Path=/',
      `Max-Age=${sessionMaxAge}`,
      isProduction ? 'Secure' : '',
      'SameSite=Strict',
    ]
      .filter(Boolean)
      .join('; '),
  );

  return response;
}
