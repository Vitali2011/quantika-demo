import { NextRequest, NextResponse } from 'next/server';

import { EMAIL_FETCH_COUNT, MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { upsertEmails } from '@/lib/email-cache';
import { fetchGmailEmails } from '@/lib/google';
import { logger } from '@/lib/logger';
import { getSession, updateSession } from '@/lib/session';
import { truncateText } from '@/lib/utils';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Skip fetch for sample data sessions — emails already loaded
  if (session.isSampleData) {
    return NextResponse.json({
      count: session.emails.length,
      message: `Sample data: ${session.emails.length} emails`,
    });
  }

  try {
    const emails = await fetchGmailEmails(session.accessToken, EMAIL_FETCH_COUNT);

    const truncatedEmails = emails.map((email) => ({
      ...email,
      body: truncateText(email.body, MAX_EMAIL_BODY_CHARS * 2),
    }));

    updateSession(sessionId, { emails: truncatedEmails });

    // Persist raw emails for the cache layer. accountId may be absent on legacy
    // sessions — in that case we keep today's ephemeral behavior (no persistence).
    if (session.accountId) {
      try {
        upsertEmails(session.accountId, truncatedEmails);
      } catch (err) {
        // Persistence failure must not break the fetch response.
        logger.error({ err }, "Email persistence (upsertEmails) failed");
      }
    }

    return NextResponse.json({
      count: truncatedEmails.length,
      message: `Loaded ${truncatedEmails.length} emails`,
    });
  } catch (err) {
    logger.error({ err }, 'Email fetch error');
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}
