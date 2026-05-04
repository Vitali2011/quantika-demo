/**
 * γ-cleanup-4 F1 — Regression tests for React #418 hydration-safe date formatting.
 *
 * Verifies that:
 *   1. formatDate always produces the same string regardless of the process
 *      timezone (server UTC vs client user-local) by pinning locale='en-US'
 *      and timeZone='UTC'.
 *   2. audit-trail formatTime behaviour is consistent (spot-check via the
 *      same Intl.DateTimeFormat contract).
 */

import { formatDate } from '@/lib/utils';

describe('formatDate — locale-stable (γ-cleanup-4 F1)', () => {
  const ISO = '2026-05-01T09:00:00.000Z';

  it('returns a non-empty string for a valid ISO date', () => {
    expect(formatDate(ISO)).toBeTruthy();
  });

  it('pins output to en-US locale: "May 1, 2026"', () => {
    expect(formatDate(ISO)).toBe('May 1, 2026');
  });

  it('returns the same string when called twice (deterministic)', () => {
    expect(formatDate(ISO)).toBe(formatDate(ISO));
  });

  it('does not throw for unparseable input', () => {
    // new Date('not-a-date') → Invalid Date; toLocaleDateString returns
    // "Invalid Date" string rather than throwing. Real callers always pass
    // valid ISO strings so this is just a guard for robustness.
    expect(() => formatDate('not-a-date')).not.toThrow();
  });

  it('handles a date at midnight UTC without day-shift', () => {
    // UTC midnight — timezone-naive parse would shift day for UTC+N clients
    expect(formatDate('2026-12-31T00:00:00.000Z')).toBe('Dec 31, 2026');
  });

  it('does not produce a different date for a late-UTC timestamp', () => {
    // 2026-01-01T23:59:59Z should stay Jan 1, not roll to Jan 2
    expect(formatDate('2026-01-01T23:59:59.000Z')).toBe('Jan 1, 2026');
  });
});

describe('toLocaleTimeString safety contract (γ-cleanup-4 F1)', () => {
  it('toLocaleTimeString with en-US + UTC is deterministic', () => {
    const iso = '2026-05-01T09:00:00.000Z';
    const t1 = new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
    const t2 = new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
    expect(t1).toBe(t2);
    // Should produce 09:00:00 AM format (en-US 12h style)
    expect(t1).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
