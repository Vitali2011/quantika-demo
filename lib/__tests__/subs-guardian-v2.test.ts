/**
 * Tests for Subs Guardian v2 — Timezone-aware banking days (γ-08).
 *
 * Uses fixed dates to avoid flakiness.
 */

import {
  addBankingDays,
  isBankingDay,
  getChartererGraceDays,
} from '../deadlines/subs-guardian';

describe('addBankingDays', () => {
  // Happy path: skips Saturday and Sunday
  test('skips Saturday and Sunday', () => {
    // Friday 2026-05-08 12:00 UTC + 1 banking day → Monday 2026-05-11 12:00 UTC
    const start = new Date('2026-05-08T12:00:00Z');
    const result = addBankingDays(start, 1, 'UTC');
    expect(result.toISOString()).toBe('2026-05-11T12:00:00.000Z');
  });

  test('skips weekend when adding multiple days', () => {
    // Thursday 2026-05-07 10:00 UTC + 3 banking days
    // → Friday, skip Sat/Sun, Monday, Tuesday = 2026-05-12 10:00 UTC
    const start = new Date('2026-05-07T10:00:00Z');
    const result = addBankingDays(start, 3, 'UTC');
    expect(result.toISOString()).toBe('2026-05-12T10:00:00.000Z');
  });

  // Timezone awareness
  test('handles America/New_York timezone', () => {
    // 2026-05-08 (Friday) 09:00 ET (14:00 UTC) + 1 banking day
    // → 2026-05-11 (Monday) 09:00 ET (14:00 UTC)
    const start = new Date('2026-05-08T14:00:00Z'); // 09:00 ET
    const result = addBankingDays(start, 1, 'America/New_York');
    expect(result.toISOString()).toBe('2026-05-11T14:00:00.000Z');
  });

  test('handles Europe/London timezone', () => {
    // 2026-05-08 (Friday) 10:00 BST (09:00 UTC) + 1 banking day
    // → 2026-05-11 (Monday) 10:00 BST (09:00 UTC)
    const start = new Date('2026-05-08T09:00:00Z'); // 10:00 BST
    const result = addBankingDays(start, 1, 'Europe/London');
    expect(result.toISOString()).toBe('2026-05-11T09:00:00.000Z');
  });

  // Holiday handling
  test('skips holiday date', () => {
    // Monday 2026-05-25 (US Memorial Day) + 1 banking day
    // → Tuesday 2026-05-26
    const start = new Date('2026-05-25T12:00:00Z');
    const holidays = ['2026-05-25']; // YYYY-MM-DD in local time
    const result = addBankingDays(start, 1, 'America/New_York', holidays);
    expect(result.toISOString()).toBe('2026-05-26T12:00:00.000Z');
  });

  test('skips multiple holidays', () => {
    // Friday 2026-12-25 (Christmas) + 2 banking days
    // → skip Sat, Sun, skip Mon 28 (Boxing Day), Tue 29, Wed 30
    const start = new Date('2026-12-25T10:00:00Z');
    const holidays = ['2026-12-25', '2026-12-28'];
    const result = addBankingDays(start, 2, 'UTC', holidays);
    expect(result.toISOString()).toBe('2026-12-30T10:00:00.000Z');
  });

  // Boundary: 0 days
  test('returns startDate when adding 0 days', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    const result = addBankingDays(start, 0, 'UTC');
    expect(result.toISOString()).toBe(start.toISOString());
  });

  // Boundary: negative days
  test('subtracts banking days when days is negative', () => {
    // Monday 2026-05-11 - 1 banking day → Friday 2026-05-08
    const start = new Date('2026-05-11T12:00:00Z');
    const result = addBankingDays(start, -1, 'UTC');
    expect(result.toISOString()).toBe('2026-05-08T12:00:00.000Z');
  });

  test('subtracts multiple banking days skipping weekend', () => {
    // Monday 2026-05-11 - 3 banking days
    // → Friday 2026-05-08, skip Sat/Sun, Thursday 2026-05-07, Wednesday 2026-05-06
    const start = new Date('2026-05-11T12:00:00Z');
    const result = addBankingDays(start, -3, 'UTC');
    expect(result.toISOString()).toBe('2026-05-06T12:00:00.000Z');
  });

  // Boundary: empty holidays
  test('handles empty holidays array', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    const result = addBankingDays(start, 1, 'UTC', []);
    expect(result.toISOString()).toBe('2026-05-11T12:00:00.000Z');
  });

  test('handles undefined holidays', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    const result = addBankingDays(start, 1, 'UTC', undefined);
    expect(result.toISOString()).toBe('2026-05-11T12:00:00.000Z');
  });

  // Boundary: Invalid Date
  test('throws TypeError for invalid startDate', () => {
    const invalid = new Date('invalid');
    expect(() => addBankingDays(invalid, 1, 'UTC')).toThrow(TypeError);
  });

  test('throws TypeError for null startDate', () => {
    // @ts-expect-error — testing runtime validation
    expect(() => addBankingDays(null, 1, 'UTC')).toThrow(TypeError);
  });

  test('throws TypeError for undefined startDate', () => {
    // @ts-expect-error — testing runtime validation
    expect(() => addBankingDays(undefined, 1, 'UTC')).toThrow(TypeError);
  });

  // Boundary: empty/invalid timezone
  test('throws TypeError for empty timezone', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    expect(() => addBankingDays(start, 1, '')).toThrow(TypeError);
  });

  test('throws TypeError for null timezone', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    // @ts-expect-error — testing runtime validation
    expect(() => addBankingDays(start, 1, null)).toThrow(TypeError);
  });

  test('throws TypeError for undefined timezone', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    // @ts-expect-error — testing runtime validation
    expect(() => addBankingDays(start, 1, undefined)).toThrow(TypeError);
  });

  test('throws RangeError for invalid timezone', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    expect(() => addBankingDays(start, 1, 'Invalid/Timezone')).toThrow(
      RangeError
    );
  });

  // Boundary: special float days
  test('throws RangeError for NaN days', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    expect(() => addBankingDays(start, NaN, 'UTC')).toThrow(RangeError);
  });

  test('throws RangeError for Infinity days', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    expect(() => addBankingDays(start, Infinity, 'UTC')).toThrow(RangeError);
  });

  test('throws RangeError for -Infinity days', () => {
    const start = new Date('2026-05-08T12:00:00Z');
    expect(() => addBankingDays(start, -Infinity, 'UTC')).toThrow(RangeError);
  });

  // Boundary: non-integer days
  test('floors non-integer days', () => {
    // 2.5 days → 2 days
    const start = new Date('2026-05-08T12:00:00Z'); // Friday
    const result = addBankingDays(start, 2.5, 'UTC');
    // Friday + 2 banking days → Tuesday 2026-05-12
    expect(result.toISOString()).toBe('2026-05-12T12:00:00.000Z');
  });
});

describe('isBankingDay', () => {
  // Saturday
  test('returns false for Saturday', () => {
    const saturday = new Date('2026-05-09T12:00:00Z'); // Saturday
    expect(isBankingDay(saturday, 'UTC')).toBe(false);
  });

  // Sunday
  test('returns false for Sunday', () => {
    const sunday = new Date('2026-05-10T12:00:00Z'); // Sunday
    expect(isBankingDay(sunday, 'UTC')).toBe(false);
  });

  // Monday
  test('returns true for Monday', () => {
    const monday = new Date('2026-05-11T12:00:00Z'); // Monday
    expect(isBankingDay(monday, 'UTC')).toBe(true);
  });

  // Weekday
  test('returns true for Tuesday', () => {
    const tuesday = new Date('2026-05-12T12:00:00Z');
    expect(isBankingDay(tuesday, 'UTC')).toBe(true);
  });

  test('returns true for Friday', () => {
    const friday = new Date('2026-05-08T12:00:00Z');
    expect(isBankingDay(friday, 'UTC')).toBe(true);
  });

  // Holiday
  test('returns false for holiday', () => {
    const holiday = new Date('2026-05-25T12:00:00Z'); // Memorial Day
    const holidays = ['2026-05-25'];
    expect(isBankingDay(holiday, 'America/New_York', holidays)).toBe(false);
  });

  // Timezone-aware weekend detection
  test('detects weekend in different timezone', () => {
    // 2026-05-09 23:00 UTC = 2026-05-10 00:00 (Sunday) in Asia/Tokyo
    const date = new Date('2026-05-09T23:00:00Z');
    expect(isBankingDay(date, 'Asia/Tokyo')).toBe(false);
  });

  // Boundary: empty holidays
  test('handles empty holidays array', () => {
    const monday = new Date('2026-05-11T12:00:00Z');
    expect(isBankingDay(monday, 'UTC', [])).toBe(true);
  });

  test('handles undefined holidays', () => {
    const monday = new Date('2026-05-11T12:00:00Z');
    expect(isBankingDay(monday, 'UTC', undefined)).toBe(true);
  });

  // Boundary: invalid date
  test('throws TypeError for invalid date', () => {
    const invalid = new Date('invalid');
    expect(() => isBankingDay(invalid, 'UTC')).toThrow(TypeError);
  });

  test('throws TypeError for null date', () => {
    // @ts-expect-error — testing runtime validation
    expect(() => isBankingDay(null, 'UTC')).toThrow(TypeError);
  });

  test('throws TypeError for undefined date', () => {
    // @ts-expect-error — testing runtime validation
    expect(() => isBankingDay(undefined, 'UTC')).toThrow(TypeError);
  });

  // Boundary: empty/invalid timezone
  test('throws TypeError for empty timezone', () => {
    const date = new Date('2026-05-11T12:00:00Z');
    expect(() => isBankingDay(date, '')).toThrow(TypeError);
  });

  test('throws TypeError for null timezone', () => {
    const date = new Date('2026-05-11T12:00:00Z');
    // @ts-expect-error — testing runtime validation
    expect(() => isBankingDay(date, null)).toThrow(TypeError);
  });

  test('throws TypeError for undefined timezone', () => {
    const date = new Date('2026-05-11T12:00:00Z');
    // @ts-expect-error — testing runtime validation
    expect(() => isBankingDay(date, undefined)).toThrow(TypeError);
  });

  test('throws RangeError for invalid timezone', () => {
    const date = new Date('2026-05-11T12:00:00Z');
    expect(() => isBankingDay(date, 'Invalid/Zone')).toThrow(RangeError);
  });
});

describe('getChartererGraceDays', () => {
  // Valid tiers
  test('returns 1 for blue-chip', () => {
    expect(getChartererGraceDays('blue-chip')).toBe(1);
  });

  test('returns 0 for second', () => {
    expect(getChartererGraceDays('second')).toBe(0);
  });

  test('returns 0 for weak', () => {
    expect(getChartererGraceDays('weak')).toBe(0);
  });

  // Boundary: empty/falsy tier → graceful 0 (no grace period)
  test('returns 0 for empty string tier (graceful fallback)', () => {
    // @ts-expect-error — testing runtime behavior with empty string
    expect(getChartererGraceDays('')).toBe(0);
  });

  test('returns 0 for null tier (graceful fallback)', () => {
    // @ts-expect-error — testing runtime behavior with null
    expect(getChartererGraceDays(null)).toBe(0);
  });

  test('returns 0 for undefined tier (graceful fallback)', () => {
    expect(getChartererGraceDays(undefined)).toBe(0);
  });

  // Boundary: invalid tier (exhaustive check)
  test('throws TypeError for invalid tier', () => {
    // @ts-expect-error — testing runtime validation
    expect(() => getChartererGraceDays('platinum')).toThrow(TypeError);
  });

  test('throws TypeError for unknown tier', () => {
    // @ts-expect-error — testing runtime validation
    expect(() => getChartererGraceDays('unknown')).toThrow(TypeError);
  });
});
