import { NextRequest, NextResponse } from 'next/server';
import { getAuthConfig } from '@/lib/auth/config';
import { signAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';
import { DEMO_SESSION_TTL_MS } from '@/lib/constants';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to keep timing consistent, but we know it's false
    let _dummy = 0;
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      _dummy |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getAuthConfig();

  let user = '';
  let password = '';

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      user = params.get('user') ?? '';
      password = params.get('password') ?? '';
    } else {
      // JSON fallback
      const body = await request.json() as Record<string, unknown>;
      user = String(body.user ?? '');
      password = String(body.password ?? '');
    }
  } catch {
    // Parse failure → treat as invalid creds
  }

  const validUser = timingSafeStringEqual(user, config.user);
  const validPassword = timingSafeStringEqual(password, config.password ?? '');

  const baseUrl = getRequestBaseUrl(request);

  if (!validUser || !validPassword || !password) {
    return NextResponse.redirect(new URL('/login?error=1', baseUrl), { status: 303 });
  }

  // Credentials valid — sign and set auth cookie
  const secret = config.secret ?? '';
  const cookieValue = await signAuthCookie(config.user, secret, config.cookieDays);
  const maxAge = config.cookieDays * 86_400;
  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.redirect(new URL('/dashboard', baseUrl), { status: 303 });
  response.headers.set(
    'Set-Cookie',
    [
      `${AUTH_COOKIE_NAME}=${cookieValue}`,
      'Path=/',
      `Max-Age=${maxAge}`,
      'HttpOnly',
      isProduction ? 'Secure' : '',
      'SameSite=Lax',
    ]
      .filter(Boolean)
      .join('; '),
  );

  // In DEMO_MODE, auto-seed a session from the frozen snapshot (demo-seed.db) so
  // /matches shows the audited demo data immediately. The legacy "Try sample data"
  // button still uses createDemoSession via /api/sample — left unchanged.
  if (process.env.DEMO_MODE === 'true') {
    const { createSession } = await import('@/lib/session');
    const { hydrateDemoSession } = await import('@/lib/demo-mode/hydrate-demo-session');
    const { generateCsrfToken } = await import('@/lib/csrf');
    // Session TTL matches the auth cookie lifetime so both expire together.
    const sessionTtlMs = config.cookieDays * 86_400 * 1000;
    const sessionId = createSession('demo-seed', sessionTtlMs);
    hydrateDemoSession(sessionId);
    const sessionMaxAge = config.cookieDays * 86_400;
    // Append (do NOT use response.cookies.set — it would clobber the auth cookie
    // already set above via headers.set('Set-Cookie', ...)). Separate Set-Cookie
    // headers coexist, so demo_auth + session_id + csrf_token all survive.
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
    // csrf_token (double-submit, JS-readable) so demo /api/ai/* calls pass the middleware CSRF check.
    const csrfToken = generateCsrfToken();
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
    response.headers.set('X-CSRF-Token', csrfToken);
  }

  return response;
}
