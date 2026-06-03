import { NextRequest, NextResponse } from 'next/server';
import { checkCsrfRequest } from '@/lib/csrf';
import { aiRateLimiter, loginRateLimiter, adminRateLimiter } from '@/lib/rate-limit';
import { getAuthConfig } from '@/lib/auth/config';
import { verifyAuthCookie, AUTH_COOKIE_NAME } from '@/lib/auth/cookie';
import { getRequestBaseUrl } from '@/lib/auth/redirect-url';

// Paths that bypass the auth guard entirely
const AUTH_BYPASS_PATHS = new Set([
  // Public landing — anonymous users see PublicLanding; logged-in redirect handled by app/page.tsx
  '/',
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
  // Public marketing pages — accessible without login for prospects
  '/about',
  '/pricing',
  // Market KPI endpoints — public index data (BDI/BHSI/bunker prices), safe for anonymous
  '/api/market/baltic-kpi',
  '/api/market/bunker-kpi',
  // benchmark endpoint is "Intentionally public" per route comment (no PII, commodity data only)
  '/api/market/benchmark',
  // Demo session re-hydration: has its own demo_auth verification; must not loop back to auth guard
  '/api/demo/rehydrate',
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

// Fail-closed bucket: a SINGLE shared key so that, when no trusted client IP can
// be derived, everyone is throttled together rather than each attacker getting
// their own fresh bucket. Over-throttling is acceptable; a bypass is not.
const SHARED_BUCKET = '__shared__';

/**
 * Client key for the brute-force throttles (M-1 / L-3), derived from a TRUSTED
 * source so an attacker cannot rotate it per request to defeat the limiter.
 *
 * The left-most X-Forwarded-For entry is CLIENT-CONTROLLED (Caddy only appends,
 * never rewrites) and must never be used as the key again. The trust model is
 * selected by RATE_LIMIT_CLIENT_IP_SOURCE and is FAIL-CLOSED:
 *
 *  - 'cf'          → CF-Connecting-IP. Safe in prod because Cloudflare OVERWRITES
 *                    any client-supplied value with the true client IP. If the
 *                    header is absent (request didn't transit CF) → fail-closed.
 *  - 'xff-trusted' → the IP observed by the OUTERMOST trusted hop. Reads
 *                    TRUSTED_PROXY_COUNT (N = number of trusted appending hops,
 *                    e.g. Caddy = 1) and takes the X-Forwarded-For token at index
 *                    (len - N): the last N tokens were appended by trusted hops,
 *                    so tokens[len - N] is the first trusted-appended value and
 *                    everything to its LEFT is attacker-controlled and ignored.
 *                    If the list is shorter than N (or N is misconfigured) →
 *                    fail-closed.
 *  - 'xrealip'     → X-Real-IP, ONLY when the front proxy OVERWRITES it from a
 *                    trusted value (a bare reverse_proxy does NOT). Explicit opt-in.
 *  - unset / 'none' / anything else → NO trusted source. We trust NO client-settable
 *                    header here (x-real-ip and the left-most X-Forwarded-For are both
 *                    spoofable behind a bare proxy) → fail-closed to SHARED_BUCKET.
 *
 * In every misconfigured/missing/short case we return SHARED_BUCKET rather than an
 * attacker-chosen value — a missing config must never grant unlimited attempts.
 */
function rateLimitKey(request: NextRequest): string {
  const source = process.env.RATE_LIMIT_CLIENT_IP_SOURCE;

  if (source === 'cf') {
    const cf = request.headers.get('cf-connecting-ip')?.trim();
    return cf || SHARED_BUCKET; // absent CF header → fail-closed
  }

  if (source === 'xff-trusted') {
    const n = Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? '', 10);
    if (!Number.isInteger(n) || n < 1) return SHARED_BUCKET; // misconfigured → fail-closed
    const forwarded = request.headers.get('x-forwarded-for');
    if (!forwarded) return SHARED_BUCKET;
    const tokens = forwarded.split(',').map((t) => t.trim()).filter(Boolean);
    if (tokens.length < n) return SHARED_BUCKET; // list shorter than N trusted hops → fail-closed
    return tokens[tokens.length - n] || SHARED_BUCKET;
  }

  if (source === 'xrealip') {
    // Explicit opt-in: ONLY safe when the front proxy OVERWRITES X-Real-IP from a
    // trusted value. A bare `reverse_proxy` (e.g. the demo Caddyfile) does NOT, so
    // this must never be the default.
    return request.headers.get('x-real-ip')?.trim() || SHARED_BUCKET;
  }

  // No trusted source configured → fail-closed. We must NOT trust any
  // client-settable header here: both x-real-ip and the left-most X-Forwarded-For
  // pass through a bare proxy unchanged, so honouring either reopens the
  // rotate-header bypass (cold-QA R2-BUG-1).
  return SHARED_BUCKET;
}

function tooManyRequests(retryAfterMs: number): NextResponse {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Brute-force throttles (M-1 / L-3) ─────────────────────────────────────
  // Applied before the auth guard because /api/auth/login is in AUTH_BYPASS_PATHS
  // and /api/admin/* endpoints carry their own shared-secret auth — neither path
  // would otherwise be rate-limited by the /api/ai/* block below.
  if (request.method === 'POST' && pathname === '/api/auth/login') {
    const { allowed, retryAfterMs } = loginRateLimiter.check(rateLimitKey(request));
    if (!allowed) return tooManyRequests(retryAfterMs);
  }

  if (pathname.startsWith('/api/admin/')) {
    const { allowed, retryAfterMs } = adminRateLimiter.check(rateLimitKey(request));
    if (!allowed) return tooManyRequests(retryAfterMs);
  }

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
      // API clients don't follow redirects — return 401 JSON for /api/* routes
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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

    // Demo session re-hydration (#790): after SESSION_TTL_MS (1h default) the session_id
    // cookie expires — same Max-Age as the session row. The demo_auth cookie lives
    // cookieDays (default 30d), so the user is still authenticated but has no session_id.
    // Server Component pages call getSession() → null → render 'No emails yet'. Redirect to
    // /api/demo/rehydrate (a Node.js route handler) which creates a fresh session, sets the
    // session_id cookie, and bounces the user back to this page. Skip for /api/* routes —
    // those return JSON and must not be interrupted with a browser redirect.
    if (
      process.env.DEMO_MODE === 'true' &&
      !request.cookies.get('session_id')?.value &&
      !pathname.startsWith('/api/')
    ) {
      const rehydrateUrl = new URL('/api/demo/rehydrate', getRequestBaseUrl(request));
      rehydrateUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(rehydrateUrl, { status: 302 });
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
    response.headers.set('x-pathname', pathname);
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

  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  matcher: [
    // Match everything except static assets (Next.js docs recommended pattern)
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
