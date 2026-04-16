import {
  filterByCategory,
  groupEmailsByStatus,
  getEmailCounts,
  STATUS_GROUPS_ORDER,
} from '../dashboard-queries';
import type { Email, ProcessedEmail } from '../types';

function makeEmail(id: string, overrides: Partial<Email> = {}): Email {
  return {
    id,
    threadId: `thread-${id}`,
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'me@example.com',
    subject: `Subject ${id}`,
    date: '2024-01-10T12:00:00.000Z',
    body: 'body',
    snippet: 'snippet',
    labelIds: [],
    ...overrides,
  };
}

function makeProcessed(emailId: string, overrides: Partial<ProcessedEmail> = {}): ProcessedEmail {
  return {
    emailId,
    type: 'CARGO_INQUIRY',
    status: 'NEEDS_ACTION',
    isUnanswered: true,
    urgency: 'high',
    daysWithoutReply: 3,
    confidence: 0.9,
    originalSender: 'sender@example.com',
    originalSenderCompany: null,
    freshness: 'active',
    expiryDate: null,
    expirySource: null,
    ...overrides,
  };
}

// ── filterByCategory ──

describe('filterByCategory', () => {
  it('returns rows for matching category', () => {
    const emails = [makeEmail('1'), makeEmail('2')];
    const processed = [
      makeProcessed('1', { type: 'CARGO_INQUIRY' }),
      makeProcessed('2', { type: 'VESSEL_POSITION' }),
    ];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result).toHaveLength(1);
    expect(result[0].email.id).toBe('1');
  });

  it('excludes rows from other categories', () => {
    const emails = [makeEmail('1')];
    const processed = [makeProcessed('1', { type: 'VESSEL_POSITION' })];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result).toHaveLength(0);
  });

  it('sets statusGroup to STALE for stale emails', () => {
    const emails = [makeEmail('1')];
    const processed = [makeProcessed('1', { freshness: 'stale', status: 'PENDING' })];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result[0].statusGroup).toBe('STALE');
  });

  it('sets statusGroup from pe.status for active emails', () => {
    const emails = [makeEmail('1')];
    const processed = [makeProcessed('1', { freshness: 'active', status: 'RESPONDED' })];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result[0].statusGroup).toBe('RESPONDED');
  });

  it('returns empty array for empty input', () => {
    const result = filterByCategory([], [], 'CARGO_INQUIRY');
    expect(result).toHaveLength(0);
  });

  it('skips processed emails with no matching email', () => {
    const emails = [makeEmail('1')];
    const processed = [
      makeProcessed('1', { type: 'CARGO_INQUIRY' }),
      makeProcessed('missing-id', { type: 'CARGO_INQUIRY' }),
    ];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result).toHaveLength(1);
  });

  it('sorts NEEDS_ACTION before PENDING', () => {
    const emails = [makeEmail('1'), makeEmail('2')];
    const processed = [
      makeProcessed('1', { status: 'PENDING' }),
      makeProcessed('2', { status: 'NEEDS_ACTION', daysWithoutReply: 5 }),
    ];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result[0].statusGroup).toBe('NEEDS_ACTION');
    expect(result[1].statusGroup).toBe('PENDING');
  });

  it('sorts NEEDS_ACTION by daysWithoutReply descending', () => {
    const emails = [makeEmail('1'), makeEmail('2'), makeEmail('3')];
    const processed = [
      makeProcessed('1', { status: 'NEEDS_ACTION', daysWithoutReply: 1 }),
      makeProcessed('2', { status: 'NEEDS_ACTION', daysWithoutReply: 5 }),
      makeProcessed('3', { status: 'NEEDS_ACTION', daysWithoutReply: null }),
    ];
    const result = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    expect(result[0].email.id).toBe('2'); // 5 days
    expect(result[1].email.id).toBe('1'); // 1 day
    expect(result[2].email.id).toBe('3'); // null → 0
  });
});

// ── groupEmailsByStatus ──

describe('groupEmailsByStatus', () => {
  it('groups rows by statusGroup', () => {
    const emails = [makeEmail('1'), makeEmail('2')];
    const processed = [
      makeProcessed('1', { status: 'NEEDS_ACTION' }),
      makeProcessed('2', { status: 'PENDING' }),
    ];
    const rows = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    const grouped = groupEmailsByStatus(rows);
    expect(grouped['NEEDS_ACTION']).toHaveLength(1);
    expect(grouped['PENDING']).toHaveLength(1);
  });

  it('returns empty object for empty input', () => {
    const grouped = groupEmailsByStatus([]);
    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('puts stale emails under STALE key', () => {
    const emails = [makeEmail('1')];
    const processed = [makeProcessed('1', { freshness: 'stale' })];
    const rows = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    const grouped = groupEmailsByStatus(rows);
    expect(grouped['STALE']).toHaveLength(1);
  });
});

// ── getEmailCounts ──

describe('getEmailCounts', () => {
  it('returns correct counts per status group', () => {
    const emails = [makeEmail('1'), makeEmail('2'), makeEmail('3')];
    const processed = [
      makeProcessed('1', { status: 'NEEDS_ACTION' }),
      makeProcessed('2', { status: 'NEEDS_ACTION' }),
      makeProcessed('3', { status: 'PENDING' }),
    ];
    const rows = filterByCategory(emails, processed, 'CARGO_INQUIRY');
    const grouped = groupEmailsByStatus(rows);
    const counts = getEmailCounts(grouped);
    expect(counts['NEEDS_ACTION']).toBe(2);
    expect(counts['PENDING']).toBe(1);
  });

  it('returns empty object for empty groups', () => {
    const counts = getEmailCounts({});
    expect(counts).toEqual({});
  });
});

// ── STATUS_GROUPS_ORDER ──

describe('STATUS_GROUPS_ORDER', () => {
  it('contains all 5 status groups in priority order', () => {
    expect(STATUS_GROUPS_ORDER).toEqual(['NEEDS_ACTION', 'PENDING', 'RESPONDED', 'INFO_ONLY', 'STALE']);
  });
});
