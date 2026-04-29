/**
 * Regression tests for the staleness-on-dashboard bug (2026-04-29):
 * The /api/ai/classify route runs BEFORE /api/ai/parse-cargo and /api/ai/parse-vessel,
 * so at classify-time the session has no parsedCargos / parsedVessels. As a result
 * `calculateExpiry()` falls back to `emailDate + 5 days`, marking every cargo
 * inquiry stale within a week — even when the laycan is months in the future.
 *
 * Fix: parse-cargo and parse-vessel routes must recompute processedEmails using
 * the now-available parsed payloads. This file pins that contract via
 * `buildProcessedEmails`.
 */
import { buildProcessedEmails } from '@/lib/classification-service';
import type { Email, Classification, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'e1',
    threadId: 't1',
    from: 'broker@example.com',
    fromName: 'Broker',
    fromEmail: 'broker@example.com',
    to: 'me@example.com',
    subject: 'Cargo offer',
    date: '2026-04-05T00:00:00.000Z',
    body: 'Laycan: 01-10 Oct 2026',
    snippet: 'cargo',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

function makeClassification(overrides: Partial<Classification> = {}): Classification {
  return {
    emailId: 'e1',
    category: 'CARGO_INQUIRY',
    isUnanswered: true,
    urgency: 'high',
    daysWithoutReply: 1,
    confidence: 0.9,
    originalSender: 'broker@example.com',
    originalSenderCompany: null,
    ...overrides,
  };
}

describe('buildProcessedEmails — laycan-aware staleness', () => {
  beforeEach(() => {
    // Freeze "today" at 2026-04-29 (24 days after email, well past the 5-day fallback)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-29T12:00:00.000Z').getTime());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks cargo with future laycan as ACTIVE when parsedCargos is supplied (laycan Oct 2026, today Apr 29)', () => {
    const email = makeEmail({ id: 'e1', date: '2026-04-05T00:00:00.000Z' });
    const cls = makeClassification({ emailId: 'e1', category: 'CARGO_INQUIRY' });
    const parsedCargos: ParsedCargo[] = [
      // Minimal shape — only fields used by calculateExpiry
      { emailId: 'e1', laycan: '01-10 Oct 2026' } as unknown as ParsedCargo,
    ];

    const result = buildProcessedEmails([email], [cls], parsedCargos, []);

    expect(result).toHaveLength(1);
    const pe = result[0];
    expect(pe.expirySource).toBe('laycan');
    expect(pe.expiryDate).toBe(new Date(Date.UTC(2026, 9, 10)).toISOString());
    expect(pe.freshness).toBe('active');
  });

  it('regression: stale fallback (+5d) is overridden once parsedCargo is available', () => {
    const email = makeEmail({ id: 'e1', date: '2026-04-05T00:00:00.000Z' });
    const cls = makeClassification({ emailId: 'e1', category: 'CARGO_INQUIRY' });

    // Initial pass — no parsedCargos yet (mirrors classify-route behavior)
    const initial = buildProcessedEmails([email], [cls], [], []);
    expect(initial[0].expirySource).toBe('default');
    expect(initial[0].freshness).toBe('stale'); // Apr 10 < Apr 29

    // Second pass — parsedCargos arrived from /api/ai/parse-cargo
    const parsedCargos: ParsedCargo[] = [
      { emailId: 'e1', laycan: '01-10 Oct 2026' } as unknown as ParsedCargo,
    ];
    const updated = buildProcessedEmails([email], [cls], parsedCargos, []);
    expect(updated[0].expirySource).toBe('laycan');
    expect(updated[0].freshness).toBe('active');
  });

  it('marks vessel with future openDate as ACTIVE when parsedVessels is supplied', () => {
    const email = makeEmail({ id: 'v1', date: '2026-04-07T00:00:00.000Z' });
    const cls = makeClassification({ emailId: 'v1', category: 'VESSEL_POSITION' });
    const parsedVessels: ParsedVessel[] = [
      { emailId: 'v1', openDate: { value: 'Sep 6-8', confidence: 'confirmed' } } as unknown as ParsedVessel,
    ];

    const result = buildProcessedEmails([email], [cls], [], parsedVessels);
    const pe = result[0];
    expect(pe.expirySource).toBe('openDate');
    expect(pe.freshness).toBe('active');
  });

  it('preserves daysWithoutReply / status semantics across recompute', () => {
    const email = makeEmail({ id: 'e1', date: '2026-04-05T00:00:00.000Z' });
    const cls = makeClassification({
      emailId: 'e1',
      category: 'CARGO_INQUIRY',
      isUnanswered: true,
      daysWithoutReply: 7,
    });
    const parsedCargos: ParsedCargo[] = [
      { emailId: 'e1', laycan: '01-10 Oct 2026' } as unknown as ParsedCargo,
    ];

    const result = buildProcessedEmails([email], [cls], parsedCargos, []);
    expect(result[0].isUnanswered).toBe(true);
    expect(result[0].daysWithoutReply).toBe(7);
    expect(result[0].status).toBe('NEEDS_ACTION'); // hoursWithout = 168 > 2
  });
});
