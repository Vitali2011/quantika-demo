import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/cookie';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/login', _request.url), { status: 303 });

  // Clear the auth cookie by setting Max-Age=0
  response.headers.set(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );

  return response;
}
