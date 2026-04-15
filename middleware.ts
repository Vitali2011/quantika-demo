import { NextRequest, NextResponse } from 'next/server';
import { checkCsrfRequest } from '@/lib/csrf';

export function middleware(request: NextRequest): NextResponse {
  if (!checkCsrfRequest(request)) {
    return NextResponse.json(
      { error: 'Invalid or missing CSRF token' },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/ai/:path*', '/api/emails/:path*'],
};
