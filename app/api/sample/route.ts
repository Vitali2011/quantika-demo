import { NextResponse } from 'next/server';
import { createSession, updateSession } from '@/lib/session';
import { generateCsrfToken } from '@/lib/csrf';
import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';
import vesselPositions from '@/lib/sample-data/vessel-positions.json';
import fixtureRecaps from '@/lib/sample-data/fixture-recaps.json';
import clientReplies from '@/lib/sample-data/client-replies.json';

export const dynamic = 'force-dynamic';

const SAMPLE_EMAILS = [
  ...cargoInquiries,
  ...vesselPositions,
  ...fixtureRecaps,
  ...clientReplies,
];

export async function POST() {
  const sessionId = createSession('sample-data-token');
  updateSession(sessionId, { emails: SAMPLE_EMAILS, isSampleData: true });

  const csrfToken = generateCsrfToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://demo.quantika.org';
  const response = NextResponse.redirect(baseUrl + '/processing');
  response.cookies.set('session_id', sessionId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 3600, path: '/' });
  response.cookies.set('csrf_token', csrfToken, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 3600, path: '/' });
  response.headers.set('X-CSRF-Token', csrfToken);

  return response;
}
