import { NextRequest, NextResponse } from 'next/server';
import { checkCsrfRequest } from '@/lib/csrf';
import { aiRateLimiter } from '@/lib/rate-limit';

export function middleware(request: NextRequest): NextResponse {
  const isAiRoute = request.nextUrl.pathname.startsWith('/api/ai/');

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

  if (!checkCsrfRequest(request)) {
    return NextResponse.json(
      { error: 'Invalid or missing CSRF token' },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  // /api/health is intentionally excluded — public endpoint for uptime monitors.
  matcher: ['/api/ai/:path*', '/api/emails/:path*'],
};
