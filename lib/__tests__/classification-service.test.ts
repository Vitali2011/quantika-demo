import { buildThreadMap, detectReplyStatus, deriveEmailStatus, classifyEmails, AiClassification } from '@/lib/classification-service';
import { Email } from '@/lib/types';

jest.mock('@/lib/freshness', () => ({
  calculateExpiry: jest.fn().mockReturnValue({ expiryDate: '2026-05-01', expirySource: 'mock' }),
  isStale: jest.fn().mockReturnValue(false),
}));

jest.mock('@/lib/constants', () => ({
  UNANSWERED_THRESHOLD_HOURS: 48,
  AI_MODEL_HEAVY: 'gpt-4',
  MAX_EMAIL_BODY_CHARS: 2000,
}));

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'e1',
    threadId: 't1',
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'me@example.com',
    subject: 'Test Subject',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    body: 'Hello',
    snippet: 'Hello',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

// ─── buildThreadMap ────────────────────────────────────────────────────────────

describe('buildThreadMap', () => {
  it('returns an empty Map for an empty array', () => {
    const result = buildThreadMap([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('groups emails by threadId across multiple threads', () => {
    const e1 = makeEmail({ id: 'e1', threadId: 'tA' });
    const e2 = makeEmail({ id: 'e2', threadId: 'tB' });
    const e3 = makeEmail({ id: 'e3', threadId: 'tA' });
    const result = buildThreadMap([e1, e2, e3]);
    expect(result.get('tA')).toHaveLength(2);
    expect(result.get('tB')).toHaveLength(1);
    expect(result.get('tA')).toEqual(expect.arrayContaining([e1, e3]));
  });
});

// ─── detectReplyStatus ────────────────────────────────────────────────────────

describe('detectReplyStatus', () => {
  it('marks an INBOX email with no sent reply as unanswered', () => {
    const email = makeEmail({ labelIds: ['INBOX'] });
    const threadEmails = [email];
    const result = detectReplyStatus(email, threadEmails);
    expect(result.isIncoming).toBe(true);
    expect(result.hasReply).toBe(false);
    expect(result.isUnanswered).toBe(true);
    expect(result.daysWithoutReply).not.toBeNull();
    expect(result.daysWithoutReply).toBeGreaterThanOrEqual(0);
  });

  it('marks a SENT email as not incoming and not unanswered', () => {
    const email = makeEmail({ labelIds: ['SENT'] });
    const threadEmails = [email];
    const result = detectReplyStatus(email, threadEmails);
    expect(result.isIncoming).toBe(false);
    expect(result.isUnanswered).toBe(false);
    expect(result.daysWithoutReply).toBeNull();
  });

  it('marks an INBOX email with a later SENT reply as answered', () => {
    const emailDate = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    const replyDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const email = makeEmail({ id: 'e1', date: emailDate, labelIds: ['INBOX'] });
    const reply = makeEmail({ id: 'e2', date: replyDate, labelIds: ['SENT'] });
    const result = detectReplyStatus(email, [email, reply]);
    expect(result.isIncoming).toBe(true);
    expect(result.hasReply).toBe(true);
    expect(result.isUnanswered).toBe(false);
    expect(result.daysWithoutReply).toBeNull();
  });
});

// ─── deriveEmailStatus ────────────────────────────────────────────────────────

describe('deriveEmailStatus', () => {
  it('returns INFO_ONLY when requiresReply is false', () => {
    expect(deriveEmailStatus({ requiresReply: false, isUnanswered: true, hoursWithout: 100 })).toBe('INFO_ONLY');
  });

  it('returns RESPONDED when requiresReply is true but isUnanswered is false', () => {
    expect(deriveEmailStatus({ requiresReply: true, isUnanswered: false, hoursWithout: 0 })).toBe('RESPONDED');
  });

  it('returns NEEDS_ACTION when hoursWithout >= UNANSWERED_THRESHOLD_HOURS (48h SLA)', () => {
    // UNANSWERED_THRESHOLD_HOURS = 48 — comparison is in hours, not days.
    // A deal unanswered >= 48h breaches SLA → NEEDS_ACTION.
    expect(deriveEmailStatus({ requiresReply: true, isUnanswered: true, hoursWithout: 48 })).toBe('NEEDS_ACTION');
    expect(deriveEmailStatus({ requiresReply: true, isUnanswered: true, hoursWithout: 72 })).toBe('NEEDS_ACTION');
  });

  it('returns PENDING for a 1-day-unanswered deal (24h, below 48h SLA)', () => {
    // 1 day unanswered = 24h = below the 48h threshold → still PENDING, not NEEDS_ACTION.
    expect(deriveEmailStatus({ requiresReply: true, isUnanswered: true, hoursWithout: 24 })).toBe('PENDING');
    expect(deriveEmailStatus({ requiresReply: true, isUnanswered: true, hoursWithout: 47 })).toBe('PENDING');
  });
});

// ─── classifyEmails ───────────────────────────────────────────────────────────

describe('classifyEmails', () => {
  it('returns empty arrays when both inputs are empty', () => {
    const { classifications, processedEmails } = classifyEmails([], []);
    expect(classifications).toEqual([]);
    expect(processedEmails).toEqual([]);
  });

  it('produces correct Classification and ProcessedEmail shapes', () => {
    const email = makeEmail({ id: 'e1', threadId: 't1', labelIds: ['INBOX'] });
    const aiResult: AiClassification[] = [
      {
        id: 'e1',
        category: 'CARGO_INQUIRY',
        urgency: 'high',
        confidence: 0.9,
        original_sender: 'shipper@example.com',
        original_sender_company: 'Shipper Co',
      },
    ];

    const { classifications, processedEmails } = classifyEmails([email], aiResult);

    expect(classifications).toHaveLength(1);
    const cls = classifications[0];
    expect(cls.emailId).toBe('e1');
    expect(cls.category).toBe('CARGO_INQUIRY');
    expect(cls.urgency).toBe('high');
    expect(cls.confidence).toBe(0.9);
    expect(cls.originalSender).toBe('shipper@example.com');
    expect(cls.originalSenderCompany).toBe('Shipper Co');

    expect(processedEmails).toHaveLength(1);
    const pe = processedEmails[0];
    expect(pe.emailId).toBe('e1');
    expect(pe.type).toBe('CARGO_INQUIRY');
    expect(typeof pe.status).toBe('string');
    expect(['NEEDS_ACTION', 'PENDING', 'RESPONDED', 'INFO_ONLY']).toContain(pe.status);
    expect(pe.freshness).toBe('active'); // mocked isStale returns false
    expect(pe.expiryDate).toBe('2026-05-01');
    expect(pe.expirySource).toBe('mock');
  });
});
