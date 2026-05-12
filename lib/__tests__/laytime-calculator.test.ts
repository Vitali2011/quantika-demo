import { calculateLaytime, isSunday, isHoliday, isExcluded } from '../laytime/calculator';
import type { LaytimeInput } from '../types';

// ── Helper function tests ──

describe('isSunday', () => {
  // Input Contract: Empty / falsy
  test('throws TypeError on empty string', () => {
    expect(() => isSunday('')).toThrow(TypeError);
  });

  test('throws TypeError on null', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isSunday(null)).toThrow(TypeError);
  });

  test('throws TypeError on undefined', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isSunday(undefined)).toThrow(TypeError);
  });

  // Input Contract: Invalid date string
  test('throws TypeError on invalid date string', () => {
    expect(() => isSunday('not-a-date')).toThrow(TypeError);
  });

  // Valid cases
  test('returns true for Sunday 2026-05-10', () => {
    expect(isSunday('2026-05-10')).toBe(true);
  });

  test('returns false for Monday 2026-05-11', () => {
    expect(isSunday('2026-05-11')).toBe(false);
  });

  test('returns false for Saturday 2026-05-09', () => {
    expect(isSunday('2026-05-09')).toBe(false);
  });
});

describe('isHoliday', () => {
  // Input Contract: Empty dateStr
  test('throws TypeError on empty dateStr', () => {
    expect(() => isHoliday('', [])).toThrow(TypeError);
  });

  test('throws TypeError on null dateStr', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isHoliday(null, [])).toThrow(TypeError);
  });

  // Input Contract: Null holidays
  test('throws TypeError on null holidays', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isHoliday('2026-05-12', null)).toThrow(TypeError);
  });

  // Input Contract: Empty holidays array
  test('returns false for empty holidays array', () => {
    expect(isHoliday('2026-05-12', [])).toBe(false);
  });

  // Input Contract: Invalid date in dateStr
  test('throws TypeError on invalid dateStr', () => {
    expect(() => isHoliday('garbage', ['2026-05-12'])).toThrow(TypeError);
  });

  // Input Contract: Invalid dates in holidays array
  test('returns false when holidays contain invalid dates and no match', () => {
    expect(isHoliday('2026-05-12', ['2026-13-99', 'garbage'])).toBe(false);
  });

  test('returns true when dateStr matches valid holiday despite invalid entries', () => {
    expect(isHoliday('2026-05-12', ['2026-13-99', '2026-05-12', 'garbage'])).toBe(true);
  });

  // Valid cases
  test('returns true when dateStr is in holidays', () => {
    expect(isHoliday('2026-05-12', ['2026-05-12', '2026-05-13'])).toBe(true);
  });

  test('returns false when dateStr is not in holidays', () => {
    expect(isHoliday('2026-05-14', ['2026-05-12', '2026-05-13'])).toBe(false);
  });
});

describe('isExcluded', () => {
  // Input Contract: Empty dateStr
  test('throws TypeError on empty dateStr', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isExcluded('', 'SHEX', [])).toThrow(TypeError);
  });

  // Input Contract: Invalid mode
  test('throws TypeError on invalid mode', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isExcluded('2026-05-12', 'INVALID', [])).toThrow(TypeError);
  });

  // Input Contract: Null holidays
  test('throws TypeError on null holidays', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => isExcluded('2026-05-12', 'SHEX', null)).toThrow(TypeError);
  });

  // Input Contract: Empty holidays array is valid
  test('SHEX excludes Sunday with empty holidays', () => {
    expect(isExcluded('2026-05-10', 'SHEX', [])).toBe(true); // Sunday
  });

  test('SHEX does not exclude Monday with empty holidays', () => {
    expect(isExcluded('2026-05-11', 'SHEX', [])).toBe(false); // Monday
  });

  // Mode-specific behavior
  test('SHINC does not exclude Sunday', () => {
    expect(isExcluded('2026-05-10', 'SHINC', [])).toBe(false); // Sunday
  });

  test('SHINC does not exclude holiday', () => {
    expect(isExcluded('2026-05-12', 'SHINC', ['2026-05-12'])).toBe(false);
  });

  test('SHEX excludes holiday', () => {
    expect(isExcluded('2026-05-12', 'SHEX', ['2026-05-12'])).toBe(true);
  });

  test('FHEX excludes Sunday', () => {
    expect(isExcluded('2026-05-10', 'FHEX', [])).toBe(true); // Sunday
  });

  test('FHINC does not exclude Sunday', () => {
    expect(isExcluded('2026-05-10', 'FHINC', [])).toBe(false); // Sunday
  });
});

// ── calculateLaytime boundary tests ──

describe('calculateLaytime boundary cases', () => {
  // Input Contract: Empty / null input
  test('throws TypeError on null input', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => calculateLaytime(null)).toThrow(TypeError);
  });

  test('throws TypeError on undefined input', () => {
    // @ts-expect-error testing runtime behavior
    expect(() => calculateLaytime(undefined)).toThrow(TypeError);
  });

  // Input Contract: Special floats
  test('throws RangeError on allowedLaytimeDays=NaN', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: NaN,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
  });

  test('throws RangeError on allowedLaytimeDays=Infinity', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: Infinity,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
  });

  test('throws RangeError on weatherDelayHours=NaN', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      weatherDelayHours: NaN,
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
  });

  // Input Contract: Negative in positive domain
  test('throws RangeError on negative allowedLaytimeDays', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: -1,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
  });

  test('accepts negative weatherDelayHours without throwing', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      weatherDelayHours: -10,
    };
    expect(() => calculateLaytime(input)).not.toThrow();
  });

  // Input Contract: Invalid date strings
  test('throws TypeError on invalid commencedAt', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: 'invalid-date',
      completedAt: '2026-05-17T00:00:00Z',
    };
    expect(() => calculateLaytime(input)).toThrow(TypeError);
  });

  test('throws TypeError on invalid completedAt', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: 'garbage',
    };
    expect(() => calculateLaytime(input)).toThrow(TypeError);
  });

  // Input Contract: Time ordering violation
  test('throws RangeError when commencedAt > completedAt', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-17T00:00:00Z',
      completedAt: '2026-05-12T00:00:00Z',
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
  });

  // Input Contract: commencedAt === completedAt
  test('zero hours used when commencedAt === completedAt', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-12T00:00:00Z',
    };
    const result = calculateLaytime(input);
    expect(result.usedLaytimeHours).toBe(0);
    expect(result.demurrageOrDespatch).toBe('despatch');
    expect(result.netHours).toBeLessThan(0);
  });

  // Input Contract: portHolidays empty array
  test('empty portHolidays array is valid, no holidays excluded', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      portHolidays: [],
    };
    const result = calculateLaytime(input);
    expect(result).toBeDefined();
    expect(result.breakdown.every(e => e.reason !== 'holiday')).toBe(true);
  });

  // Input Contract: portHolidays with invalid dates
  test('invalid dates in portHolidays are filtered gracefully', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      portHolidays: ['2026-13-45', 'garbage', '2026-05-13'],
    };
    const result = calculateLaytime(input);
    expect(result).toBeDefined();
    // Should only exclude 2026-05-13 if it falls in the range
    const holidayEntries = result.breakdown.filter(e => e.reason === 'holiday');
    expect(holidayEntries.every(e => e.date === '2026-05-13')).toBe(true);
  });

  // Input Contract: allowedLaytimeDays=0
  test('allowedLaytimeDays=0 throws RangeError', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 0,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
  });
});

// ── SHINC mode tests ──

describe('calculateLaytime SHINC mode', () => {
  test('SHINC: 5 days used, 5 allowed → balanced', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z', // exactly 5 days
    };
    const result = calculateLaytime(input);
    expect(result.allowedLaytimeHours).toBe(5 * 24);
    expect(result.usedLaytimeHours).toBeCloseTo(5 * 24, 1);
    expect(result.demurrageOrDespatch).toBe('balanced');
    expect(result.netHours).toBeCloseTo(0, 1);
  });

  test('SHINC: 6 days used, 5 allowed → 24h demurrage', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-18T00:00:00Z', // 6 days
    };
    const result = calculateLaytime(input);
    expect(result.allowedLaytimeHours).toBe(5 * 24);
    expect(result.usedLaytimeHours).toBeCloseTo(6 * 24, 1);
    expect(result.demurrageOrDespatch).toBe('demurrage');
    expect(result.netHours).toBeCloseTo(24, 1);
  });

  test('SHINC: 4 days used, 5 allowed → 24h despatch', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-16T00:00:00Z', // 4 days
    };
    const result = calculateLaytime(input);
    expect(result.allowedLaytimeHours).toBe(5 * 24);
    expect(result.usedLaytimeHours).toBeCloseTo(4 * 24, 1);
    expect(result.demurrageOrDespatch).toBe('despatch');
    expect(result.netHours).toBeCloseTo(-24, 1);
  });

  test('SHINC: weatherDelayHours reduces used time', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z', // 5 days = 120h
      weatherDelayHours: 12,
    };
    const result = calculateLaytime(input);
    expect(result.allowedLaytimeHours).toBe(5 * 24);
    expect(result.usedLaytimeHours).toBeCloseTo(5 * 24 - 12, 1); // 108h
    expect(result.demurrageOrDespatch).toBe('despatch');
    expect(result.netHours).toBeCloseTo(-12, 1);
  });

  // Expected Output Range: usedLaytimeHours must be >= 0
  test('SHINC: usedLaytimeHours is non-negative', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const result = calculateLaytime(input);
    expect(result.usedLaytimeHours).toBeGreaterThanOrEqual(0);
  });

  // Expected Output Range: allowedLaytimeHours must be > 0
  test('SHINC: allowedLaytimeHours is positive', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const result = calculateLaytime(input);
    expect(result.allowedLaytimeHours).toBeGreaterThan(0);
  });
});

// ── SHEX mode tests ──

describe('calculateLaytime SHEX mode', () => {
  test('SHEX: Sunday excluded when in range Mon-Sat next week', () => {
    // May 12 2026 = Monday, May 17 = Saturday, May 17 = Sunday (excluded)
    // Actually: May 12 = Monday, May 13 = Tue, May 14 = Wed, May 15 = Thu, May 16 = Fri, May 17 = Sat
    // May 17 2026 is Saturday, May 18 is Sunday
    const input: LaytimeInput = {
      allowedLaytimeDays: 7,
      mode: 'SHEX',
      commencedAt: '2026-05-11T00:00:00Z', // Monday
      completedAt: '2026-05-18T00:00:00Z', // next Monday, includes Sunday May 17
    };
    const result = calculateLaytime(input);
    // 7 days = 168 hours, but Sunday (May 17) is excluded = 24h excluded
    // Wait, May 11 = Monday, May 17 = Sunday, May 18 = Monday
    // Let me recalculate: May 11 2026 is Monday
    // May 11 Mon, 12 Tue, 13 Wed, 14 Thu, 15 Fri, 16 Sat, 17 Sun, 18 Mon
    // That's 7 days, with Sunday May 17 excluded
    expect(result.usedLaytimeHours).toBeCloseTo(6 * 24, 1); // 6 days counted
    const sundayEntry = result.breakdown.find(e => e.date === '2026-05-17');
    expect(sundayEntry?.excluded).toBe(true);
    expect(sundayEntry?.reason).toBe('sunday');
  });

  test('SHEX: holiday excluded when in portHolidays list', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      portHolidays: ['2026-05-13'],
    };
    const result = calculateLaytime(input);
    // 5 days = 120h, minus 1 holiday = 96h
    expect(result.usedLaytimeHours).toBeCloseTo(4 * 24, 1);
    const holidayEntry = result.breakdown.find(e => e.date === '2026-05-13');
    expect(holidayEntry?.excluded).toBe(true);
    expect(holidayEntry?.reason).toBe('holiday');
  });

  test('SHEX: multiple holidays excluded correctly', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 7,
      mode: 'SHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-19T00:00:00Z', // 7 days
      portHolidays: ['2026-05-13', '2026-05-15'],
    };
    const result = calculateLaytime(input);
    // 7 days = 168h, minus 2 holidays and Sunday = expect less
    const excludedDates = result.breakdown.filter(e => e.excluded).map(e => e.date);
    expect(excludedDates).toContain('2026-05-13');
    expect(excludedDates).toContain('2026-05-15');
    expect(result.usedLaytimeHours).toBeLessThan(7 * 24);
  });

  // Expected Output Range: breakdown length matches days in range
  test('SHEX: breakdown has entry for each day in range', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
    };
    const result = calculateLaytime(input);
    expect(result.breakdown.length).toBeGreaterThan(0);
    expect(result.breakdown.length).toBeLessThanOrEqual(6); // 5 full days + possible partial
  });
});

// ── Additional mode coverage ──

describe('calculateLaytime FHEX and FHINC modes', () => {
  test('FHEX: behaves like SHEX (simplified)', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'FHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      portHolidays: ['2026-05-13'],
    };
    const result = calculateLaytime(input);
    // Should exclude holiday like SHEX
    expect(result.usedLaytimeHours).toBeCloseTo(4 * 24, 1);
  });

  test('FHINC: behaves like SHINC (simplified)', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'FHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      portHolidays: ['2026-05-13'],
    };
    const result = calculateLaytime(input);
    // Should NOT exclude holiday like SHINC
    expect(result.usedLaytimeHours).toBeCloseTo(5 * 24, 1);
  });
});
