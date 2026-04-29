/**
 * Regression test for the React #418 hydration mismatch on /cargo/[id], /vessel/[id],
 * /fixture/[id], /email/[id] (2026-04-29).
 *
 * Without an explicit timeZone, `toLocaleDateString` formats relative to the
 * runtime's local zone — server (UTC on the VPS) and client (user-local)
 * disagree for any user east/west of UTC, causing React to flag a hydration
 * warning every time a date is rendered in a server component.
 *
 * Pin formatDate to UTC so SSR and CSR always emit the same string.
 */
import { formatDate } from '@/lib/utils';

describe('formatDate — timezone determinism', () => {
  it('formats an ISO date identically regardless of process timezone', () => {
    // 2026-10-10T00:00:00 UTC. In en-US/UTC this is "Oct 10, 2026".
    // In Asia/Tokyo (UTC+9) the same instant is Oct 10 09:00 — same date.
    // In America/Los_Angeles (UTC-8) the same instant is Oct 9 16:00 — different
    // date if we don't pin timeZone.
    const iso = '2026-10-10T00:00:00.000Z';

    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const utc = formatDate(iso);

      process.env.TZ = 'Asia/Tokyo';
      const tokyo = formatDate(iso);

      process.env.TZ = 'America/Los_Angeles';
      const la = formatDate(iso);

      // All three must match — that's the hydration contract.
      expect(utc).toBe(tokyo);
      expect(utc).toBe(la);

      // Sanity: it produces a recognizable Oct 10 2026 string.
      expect(utc).toMatch(/Oct\s+10,?\s+2026/);
    } finally {
      process.env.TZ = original;
    }
  });

  it('returns the input string when given an unparseable date', () => {
    expect(formatDate('not-a-date')).toMatch(/Invalid|not-a-date/);
  });
});
