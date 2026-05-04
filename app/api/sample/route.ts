import { NextRequest, NextResponse } from 'next/server';
import { createSession, updateSession } from '@/lib/session';
import { generateCsrfToken, validateCsrf } from '@/lib/csrf';
import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';
import vesselPositions from '@/lib/sample-data/vessel-positions.json';
import fixtureRecaps from '@/lib/sample-data/fixture-recaps.json';
import clientReplies from '@/lib/sample-data/client-replies.json';
import documents from '@/lib/sample-data/documents.json';
import vesselCerts from '@/lib/sample-data/vessel-certs.json';
import { rebaseDates } from '@/lib/sample-data/rebase';
import {
  resolveDemoParsedCargoes,
  resolveDemoClassifications,
  resolveDemoParsedVessels,
  resolveDemoProcessedEmails,
} from '@/lib/sample-data/demo-parsed-cargoes';
import type { SampleEmailRaw } from '@/lib/sample-data/types';

export const dynamic = 'force-dynamic';

const SAMPLE_EMAILS_RAW: SampleEmailRaw[] = [
  ...(cargoInquiries as unknown as SampleEmailRaw[]),
  ...(vesselPositions as unknown as SampleEmailRaw[]),
  ...(fixtureRecaps as unknown as SampleEmailRaw[]),
  ...(clientReplies as unknown as SampleEmailRaw[]),
  ...(documents as unknown as SampleEmailRaw[]),
  ...(vesselCerts as unknown as SampleEmailRaw[]),
];

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const sessionId = createSession('sample-data-token');
  const today = new Date();
  const SAMPLE_EMAILS = rebaseDates(SAMPLE_EMAILS_RAW, today);
  const parsedCargos = resolveDemoParsedCargoes(today);
  const classifications = resolveDemoClassifications();
  const parsedVessels = resolveDemoParsedVessels(today);
  const processedEmails = resolveDemoProcessedEmails(today, SAMPLE_EMAILS);
  updateSession(sessionId, {
    emails: SAMPLE_EMAILS,
    isSampleData: true,
    parsedCargos,
    classifications,
    parsedVessels,
    processedEmails,
  });

  const csrfToken = generateCsrfToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://demo.quantika.org';
  const response = NextResponse.redirect(baseUrl + '/processing', 303);
  response.cookies.set('session_id', sessionId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 3600, path: '/' });
  response.cookies.set('csrf_token', csrfToken, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 3600, path: '/' });
  response.headers.set('X-CSRF-Token', csrfToken);

  return response;
}
