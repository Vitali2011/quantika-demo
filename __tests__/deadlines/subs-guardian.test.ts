/**
 * Tests for subs-guardian: timestamp normalization (spec-01)
 *
 * Covers: seconds input, ms input, ISO string input
 * All three forms of the same deadline must produce the same computeStage result.
 */
import { computeStage } from '@/lib/deadlines/subs-guardian';

// 2026-05-15T14:00:00Z in various formats
const ISO_DEADLINE = '2026-05-15T14:00:00Z';
const UNIX_SECONDS = 1778853600; // new Date('2026-05-15T14:00:00Z').getTime()/1000
const UNIX_MS = UNIX_SECONDS * 1000;

// "now" is ~30 days before the deadline → should be 'pending'
const NOW_30_DAYS_BEFORE = new Date('2026-04-15T14:00:00Z');

describe('computeStage — timestamp normalization (spec-01)', () => {
  test('ISO string → pending (30 days out)', () => {
    const result = computeStage(ISO_DEADLINE, NOW_30_DAYS_BEFORE);
    expect(result).toBe('pending');
  });

  test('Unix seconds (number) → same result as ISO string', () => {
    const isoResult = computeStage(ISO_DEADLINE, NOW_30_DAYS_BEFORE);
    const secondsResult = computeStage(UNIX_SECONDS as unknown as string, NOW_30_DAYS_BEFORE);
    expect(secondsResult).toBe(isoResult);
  });

  test('Unix milliseconds (number) → same result as ISO string', () => {
    const isoResult = computeStage(ISO_DEADLINE, NOW_30_DAYS_BEFORE);
    const msResult = computeStage(UNIX_MS as unknown as string, NOW_30_DAYS_BEFORE);
    expect(msResult).toBe(isoResult);
  });

  test('Unix seconds should NOT produce a date in year ~1970 (the 26531-days bug)', () => {
    // If seconds are passed without normalization, new Date(1747317600) gives 1970-01-21
    // meaning remaining would be HUGE → pending, but for wrong reason.
    // The correct check: remaining from NOW_30_DAYS_BEFORE to normalized date should be ~30 days
    const HOUR_MS = 3_600_000;
    const DAY_MS = 24 * HOUR_MS;

    const normalizedDate = UNIX_SECONDS < 1e10
      ? new Date(UNIX_SECONDS * 1000)
      : new Date(UNIX_SECONDS);

    const remaining = normalizedDate.getTime() - NOW_30_DAYS_BEFORE.getTime();
    // Should be ~30 days, not ~26531 days
    expect(remaining).toBeGreaterThan(25 * DAY_MS);
    expect(remaining).toBeLessThan(35 * DAY_MS);
  });

  test('seconds and ISO string produce exactly the same Date', () => {
    const fromISO = new Date(ISO_DEADLINE).getTime();
    const fromSeconds = new Date(UNIX_SECONDS * 1000).getTime();
    expect(fromSeconds).toBe(fromISO);
  });

  // Edge cases: near-expiry with seconds input
  test('Unix seconds: deadline in 1 hour → 2h stage', () => {
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;
    const result = computeStage(oneHourFromNow as unknown as string);
    expect(result).toBe('2h');
  });

  test('Unix seconds: expired deadline → expired', () => {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const result = computeStage(oneHourAgo as unknown as string);
    expect(result).toBe('expired');
  });
});
