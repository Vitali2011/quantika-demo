/**
 * Regression lock: laytime full day must be exactly 1440 minutes (24h).
 * Before fix: dayEnd=23:59:59.999 → 86399999ms/day → 1439.9998... minutes.
 * After fix: Math.round applied → 1440 exactly.
 */

import { calculateLaytime } from '@/lib/laytime/calculator';

describe('calculateLaytime — full-day minute rounding', () => {
  it('counts exactly 1440 minutes for a full calendar day (SHINC, no exclusions)', () => {
    // commencedAt midnight → completedAt next midnight = exactly 1 day
    const result = calculateLaytime({
      allowedLaytimeDays: 2,
      mode: 'SHINC',
      commencedAt: '2026-05-01T00:00:00.000Z',
      completedAt: '2026-05-02T00:00:00.000Z',
    });

    const day1 = result.breakdown.find(e => e.date === '2026-05-01');
    expect(day1).toBeDefined();
    // hours must be exactly 24, not 23.9999...
    expect(day1!.hours).toBe(24);
  });

  it('usedLaytimeHours is exactly 24 for one full SHINC day', () => {
    const result = calculateLaytime({
      allowedLaytimeDays: 2,
      mode: 'SHINC',
      commencedAt: '2026-05-01T00:00:00.000Z',
      completedAt: '2026-05-02T00:00:00.000Z',
    });

    expect(result.usedLaytimeHours).toBe(24);
  });
});
