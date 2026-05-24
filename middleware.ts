import { NextRequest, NextResponse } from 'next/server';
import { checkCsrfRequest } from '@/lib/csrf';
import { aiRateLimiter } from '@/lib/rate-limit';
import { getAuthConfig } from '@/lib/auth/config';
import { verifyAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';

// Paths that bypass the auth guard entirely
const AUTH_BYPASS_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/favicon.ico',
  '/api/health',
  // Cron heartbeat has its own X-Cron-Secret auth — must not be redirected to /login
  '/api/admin/cron-heartbeat',
  // Market CSV upload has its own X-Admin-Token auth (requireAdmin) — must not be redirected to /login
  '/api/admin/market/upload-csv',
  // Meta webhook has its own HMAC-SHA256 signature verification
  '/api/whatsapp/webhook',
  // Pipedrive webhook has its own HMAC-SHA256 signature verification
  '/api/integrations/pipedrive/webhook',
  // WhatsApp internal ingest has its own x-quantika-internal token
  '/api/whatsapp/ingest',
  // Admin knowledge endpoints have their own X-Admin-Token check (requireAdmin)
  '/api/admin/knowledge/refresh',
  '/api/admin/knowledge-status',
  // Public SEO files
  '/sitemap.xml',
  '/robots.txt',
  // Design preview page — internal gallery, no sensitive data
  '/design',
]);

const AUTH_BYPASS_PREFIXES = ['/_next/static', '/_next/image', '/_next/webpack'];

function isAuthBypassed(pathname: string): boolean {
  if (AUTH_BYPASS_PATHS.has(pathname)) return true;
  if (AUTH_BYPASS_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

// Paths that require CSRF check (in addition to auth)
const CSRF_PATHS = ['/api/ai/', '/api/emails/'];

function isCsrfPath(pathname: string): boolean {
  return CSRF_PATHS.some(p => pathname.startsWith(p));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Auth guard ────────────────────────────────────────────────────────────
  const authConfig = getAuthConfig();

  if (authConfig.enabled && !isAuthBypassed(pathname)) {
    // Fail-loud if secret is missing
    if (!authConfig.secret) {
      console.error(
        '[auth] DEMO_AUTH_ENABLED=true but DEMO_AUTH_SECRET is not set. ' +
          'This is a misconfiguration — refusing all requests.',
      );
      return NextResponse.json(
        { error: 'Server misconfiguration: auth secret missing' },
        { status: 500 },
      );
    }

    const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const payload = cookieValue
      ? await verifyAuthCookie(cookieValue, authConfig.secret)
      : null;

    if (!payload) {
      // Redirect to /login preserving the original URL as `next` param is intentionally omitted
      // (simple demo — no deep-link restoration needed)
      const loginUrl = new URL('/login', getRequestBaseUrl(request));
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    // /processing requires a csrf_token cookie (set by Google OAuth or /api/sample).
    // Demo-auth-only users navigating here directly have no session or CSRF token,
    // so the pipeline would immediately 403 on all API calls. Redirect to upload CTA instead.
    if (pathname === '/processing' && !request.cookies.get('csrf_token')?.value) {
      return NextResponse.redirect(new URL('/', getRequestBaseUrl(request)), { status: 302 });
    }
  }

  // ── CSRF + Rate-limit guard (existing logic, untouched) ───────────────────
  const isAiRoute = pathname.startsWith('/api/ai/');

  if (isAiRoute) {
    const sessionId = request.cookies.get('session_id')?.value;
    const forwarded = request.headers.get('x-forwarded-for');
    const key = sessionId ?? forwarded ?? 'anonymous';

    const { allowed, remaining, retryAfterMs } = aiRateLimiter.check(key);

    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        },
      );
    }

    if (!checkCsrfRequest(request)) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 },
      );
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Limit', '20');
    return response;
  }

  if (isCsrfPath(pathname)) {
    if (!checkCsrfRequest(request)) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except static assets (Next.js docs recommended pattern)
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
