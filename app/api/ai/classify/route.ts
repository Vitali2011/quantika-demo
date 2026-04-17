/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY, MAX_EMAIL_BODY_CHARS, UNANSWERED_THRESHOLD_HOURS } from '@/lib/constants';
import { truncateText } from '@/lib/utils';
import { Classification, Email, EmailCategory, EmailStatus, Urgency, ProcessedEmail } from '@/lib/types';
import { calculateExpiry, isStale } from '@/lib/freshness';

export const maxDuration = 120;

/** Group emails by threadId into a Map. Pure function, no session/HTTP dependencies. */
function buildThreadMap(emails: Email[]): Map<string, Email[]> {
  const threadMap = new Map<string, Email[]>();
  for (const email of emails) {
    const list = threadMap.get(email.threadId) || [];
    list.push(email);
    threadMap.set(email.threadId, list);
  }
  return threadMap;
}

/** Derive EmailStatus from classification parameters. Pure function, no session/HTTP dependencies. */
function deriveStatus(params: {
  requiresReply: boolean;
  isUnanswered: boolean;
  hoursWithout: number;
}): EmailStatus {
  const { requiresReply, isUnanswered, hoursWithout } = params;
  if (!requiresReply) return 'INFO_ONLY';
  if (!isUnanswered) return 'RESPONDED';
  if (hoursWithout >= UNANSWERED_THRESHOLD_HOURS / 24) return 'NEEDS_ACTION';
  return 'PENDING';
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;
  if (session.emails.length === 0) return NextResponse.json({ error: 'No emails to classify' }, { status: 400 });

  const emailInput = session.emails.map(email => ({
    id: email.id,
    subject: email.subject,
    from: email.from,
    date: email.date,
    body_preview: truncateText(email.body || email.snippet, MAX_EMAIL_BODY_CHARS),
  }));

  const result = await callAiJson<{ classifications: any[] }>(
    JSON.stringify(emailInput),
    CLASSIFICATION_SYSTEM_PROMPT,
    AI_MODEL_HEAVY,
    { classifications: [] }
  );

  const threadMap = buildThreadMap(session.emails);

  const classifications: Classification[] = (result.classifications || []).map((c: any) => {
    const email = session.emails.find(e => e.id === (c.id || c.emailId));
    const threadEmails = email ? (threadMap.get(email.threadId) || []) : [];
    const isIncoming = email ? (email.labelIds.includes('INBOX') && !email.labelIds.includes('SENT')) : false;
    const emailDate = email ? new Date(email.date).getTime() : 0;
    const hasReply = threadEmails.some(te => te.labelIds.includes('SENT') && new Date(te.date).getTime() > emailDate);
    const isUnanswered = isIncoming && !hasReply;
    const daysWithoutReply = isUnanswered && email ? Math.floor((Date.now() - emailDate) / (1000 * 60 * 60 * 24)) : null;

    return {
      emailId: c.id || c.emailId || '',
      category: (c.category as EmailCategory) || 'OTHER',
      isUnanswered,
      urgency: (c.urgency as Urgency) || 'low',
      daysWithoutReply,
      confidence: c.confidence ?? 0.8,
      originalSender: c.original_sender || null,
      originalSenderCompany: c.original_sender_company || null,
    };
  });

  // Build ProcessedEmail[] with status
  const REQUIRES_REPLY: EmailCategory[] = ['CARGO_INQUIRY', 'CLIENT_REPLY'];
  const processedEmails: ProcessedEmail[] = classifications.map(cls => {
    const email = session.emails.find(e => e.id === cls.emailId);
    const emailDate = email ? new Date(email.date).getTime() : 0;
    const hoursWithout = cls.daysWithoutReply != null ? cls.daysWithoutReply * 24 : 0;
    const requiresReply = REQUIRES_REPLY.includes(cls.category);

    const status = deriveStatus({ requiresReply, isUnanswered: cls.isUnanswered, hoursWithout });

    const { expiryDate, expirySource } = calculateExpiry(email?.date || '', cls.category);
    const stale = isStale(expiryDate);

    return {
      emailId: cls.emailId,
      type: cls.category,
      status,
      isUnanswered: cls.isUnanswered,
      urgency: cls.urgency,
      daysWithoutReply: cls.daysWithoutReply,
      confidence: cls.confidence,
      originalSender: cls.originalSender || email?.from || '',
      originalSenderCompany: cls.originalSenderCompany,
      freshness: stale ? 'stale' as const : 'active' as const,
      expiryDate,
      expirySource,
    };
  });

  updateSession(sessionId, { classifications, processedEmails });
  return NextResponse.json({ count: classifications.length });
}
