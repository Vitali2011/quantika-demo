/**
 * TZ-boundary regression test for fmtLaycan (#676 hydration fix).
 *
 * The bug: toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
 * without timeZone: 'UTC' lets the JS runtime apply the local server TZ.
 * On a VPS set to UTC+3 (or any TZ offset != UTC), timestamps within the
 * last few hours of a UTC day are shifted into the NEXT calendar day —
 * causing SSR output to differ from client hydration output, producing a
 * React hydration mismatch.
 *
 * Fix: add timeZone: 'UTC' to the toLocaleDateString options.
 * The test exercises the midnight boundary: a Unix timestamp that sits
 * exactly at midnight UTC (day boundary) and verifies the expected UTC day
 * is rendered, not the day from whatever local TZ the CI/VPS runs in.
 */

import { fmtLaycan } from '@/lib/utils/fmt-laycan';

/**
 * Returns a Unix-ms timestamp for midnight UTC of a given ISO date.
 * E.g. '2025-03-01' → Unix ms for 2025-03-01T00:00:00Z
 */
function midnightUtc(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getTime();
}

describe('fmtLaycan — UTC timezone pinning (#676)', () => {
  it('renders the expected UTC calendar day at midnight UTC (not drifted by server TZ)', () => {
    // 2025-03-01T00:00:00Z — midnight UTC boundary
    // Without timeZone:'UTC', on a UTC+3 server this would show Feb 28 (previous day).
    const ts = midnightUtc('2025-03-01');
    const result = fmtLaycan(ts, null);
    expect(result).toBe('Mar 1');
  });

  it('renders the expected UTC calendar day at 23:59 UTC (last minute of day)', () => {
    // 2025-03-31T23:59:00Z — one minute before end of March
    // On UTC+1 this would already be Apr 1.
    const ts = midnightUtc('2025-04-01') - 60000; // 23:59:00Z of Mar 31
    const result = fmtLaycan(ts, null);
    expect(result).toBe('Mar 31');
  });

  it('formats a range with both dates consistently in UTC', () => {
    const start = midnightUtc('2025-06-01'); // midnight UTC Jun 1
    const end   = midnightUtc('2025-06-15'); // midnight UTC Jun 15
    const result = fmtLaycan(start, end);
    expect(result).toContain('Jun 1');
    expect(result).toContain('Jun 15');
  });
});
