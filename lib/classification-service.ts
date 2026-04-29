import {
  Email,
  EmailCategory,
  EmailStatus,
  Urgency,
  Classification,
  ProcessedEmail,
  ParsedCargo,
  ParsedVessel,
} from '@/lib/types';
import { UNANSWERED_THRESHOLD_HOURS } from '@/lib/constants';
import { calculateExpiry, isStale } from '@/lib/freshness';

export interface AiClassification {
  id?: string;
  emailId?: string;
  category?: string;
  urgency?: string;
  confidence?: number;
  original_sender?: string | null;
  original_sender_company?: string | null;
}

export function buildThreadMap(emails: Email[]): Map<string, Email[]> {
  const threadMap = new Map<string, Email[]>();
  for (const email of emails) {
    const list = threadMap.get(email.threadId) || [];
    list.push(email);
    threadMap.set(email.threadId, list);
  }
  return threadMap;
}

export function detectReplyStatus(
  email: Email,
  threadEmails: Email[],
): {
  isIncoming: boolean;
  hasReply: boolean;
  isUnanswered: boolean;
  daysWithoutReply: number | null;
} {
  const isIncoming = email.labelIds.includes('INBOX') && !email.labelIds.includes('SENT');
  const emailDate = new Date(email.date).getTime();
  const hasReply = threadEmails.some(
    te => te.labelIds.includes('SENT') && new Date(te.date).getTime() > emailDate,
  );
  const isUnanswered = isIncoming && !hasReply;
  const daysWithoutReply = isUnanswered
    ? Math.floor((Date.now() - emailDate) / (1000 * 60 * 60 * 24))
    : null;

  return { isIncoming, hasReply, isUnanswered, daysWithoutReply };
}

export function deriveEmailStatus(params: {
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

const REQUIRES_REPLY: EmailCategory[] = ['CARGO_INQUIRY', 'CLIENT_REPLY'];

/**
 * Build ProcessedEmail records from existing Classification[] using whichever
 * parsedCargos / parsedVessels are currently available.
 *
 * Called twice per pipeline run:
 *   1. From classifyEmails() with empty parsed arrays — produces an initial
 *      pass where CARGO_INQUIRY / VESSEL_POSITION fall back to emailDate+5d.
 *   2. From parse-cargo and parse-vessel routes once those payloads exist —
 *      recomputes expiryDate/expirySource/freshness using the real laycan /
 *      openDate, so dashboard staleness reflects the actual broker dates.
 */
export function buildProcessedEmails(
  emails: Email[],
  classifications: Classification[],
  parsedCargos: ParsedCargo[] = [],
  parsedVessels: ParsedVessel[] = [],
): ProcessedEmail[] {
  return classifications.map(cls => {
    const email = emails.find(e => e.id === cls.emailId);
    const hoursWithout = cls.daysWithoutReply != null ? cls.daysWithoutReply * 24 : 0;
    const requiresReply = REQUIRES_REPLY.includes(cls.category);
    const status = deriveEmailStatus({ requiresReply, isUnanswered: cls.isUnanswered, hoursWithout });

    const parsedCargo = parsedCargos.find(c => c.emailId === cls.emailId) ?? null;
    const parsedVessel = parsedVessels.find(v => v.emailId === cls.emailId) ?? null;
    const { expiryDate, expirySource } = calculateExpiry(
      email?.date || '',
      cls.category,
      parsedCargo,
      parsedVessel,
    );
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
      freshness: stale ? ('stale' as const) : ('active' as const),
      expiryDate,
      expirySource,
    };
  });
}

export function classifyEmails(
  emails: Email[],
  aiClassifications: AiClassification[],
  parsedCargos: ParsedCargo[] = [],
  parsedVessels: ParsedVessel[] = [],
): { classifications: Classification[]; processedEmails: ProcessedEmail[] } {
  const threadMap = buildThreadMap(emails);

  const classifications: Classification[] = aiClassifications.map((c: AiClassification) => {
    const email = emails.find(e => e.id === (c.id || c.emailId));
    const threadEmails = email ? (threadMap.get(email.threadId) || []) : [];
    const { isUnanswered, daysWithoutReply } = email
      ? detectReplyStatus(email, threadEmails)
      : { isUnanswered: false, daysWithoutReply: null };

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

  const processedEmails = buildProcessedEmails(emails, classifications, parsedCargos, parsedVessels);

  return { classifications, processedEmails };
}
