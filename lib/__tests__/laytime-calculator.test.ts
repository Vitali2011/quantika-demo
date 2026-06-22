import { calculateLaytime, isSunday, isFriday, isHoliday, isExcluded } from '../laytime/calculator';
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

describe('isFriday', () => {
  test('throws TypeError on empty string', () => {
    expect(() => isFriday('')).toThrow(TypeError);
  });

  test('throws TypeError on invalid date string', () => {
    expect(() => isFriday('not-a-date')).toThrow(TypeError);
  });

  // 2026-05-15 is a Friday (Sun 05-10 + 5 days)
  test('returns true for Friday 2026-05-15', () => {
    expect(isFriday('2026-05-15')).toBe(true);
  });

  test('returns false for Sunday 2026-05-10', () => {
    expect(isFriday('2026-05-10')).toBe(false);
  });

  test('returns false for Saturday 2026-05-16', () => {
    expect(isFriday('2026-05-16')).toBe(false);
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

  // FHEX = Fridays and Holidays Excluded (glossary.ts). FH = Fridays, NOT Sundays.
  test('FHEX excludes Friday', () => {
    expect(isExcluded('2026-05-15', 'FHEX', [])).toBe(true); // Friday
  });

  test('FHEX does NOT exclude Sunday', () => {
    expect(isExcluded('2026-05-10', 'FHEX', [])).toBe(false); // Sunday counts in FHEX
  });

  test('FHEX excludes holiday', () => {
    expect(isExcluded('2026-05-12', 'FHEX', ['2026-05-12'])).toBe(true);
  });

  test('FHINC does not exclude Friday', () => {
    expect(isExcluded('2026-05-15', 'FHINC', [])).toBe(false); // Friday
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

  test('throws RangeError on negative weatherDelayHours', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-17T00:00:00Z',
      weatherDelayHours: -10,
    };
    expect(() => calculateLaytime(input)).toThrow(RangeError);
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
  // FHEX = Fridays and Holidays Excluded. Friday is the weekend day, NOT Sunday.
  test('FHEX: excludes Friday and holiday, counts Sunday', () => {
    // Range Tue 2026-05-12 → Mon 2026-05-18 (full week). Friday = 05-15.
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'FHEX',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-18T00:00:00Z',
      portHolidays: ['2026-05-13'],
    };
    const result = calculateLaytime(input);

    // Friday 05-15 excluded with reason 'friday'
    const fri = result.breakdown.find((e) => e.date === '2026-05-15');
    expect(fri?.excluded).toBe(true);
    expect(fri?.reason).toBe('friday');

    // Sunday 05-17 must be COUNTED under FHEX (not excluded)
    const sun = result.breakdown.find((e) => e.date === '2026-05-17');
    expect(sun?.excluded).toBe(false);

    // Holiday 05-13 excluded with reason 'holiday'
    const hol = result.breakdown.find((e) => e.date === '2026-05-13');
    expect(hol?.excluded).toBe(true);
    expect(hol?.reason).toBe('holiday');

    // Full days 12,14,16,17 counted (13 holiday, 15 Friday excluded; 18 ~0min) = 4*24
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

// ── breakdown vs usedLaytimeHours reconciliation (W1-6) ──
// Contract: the daily breakdown carries GROSS counted hours, while
// usedLaytimeHours is NET (gross − weatherDelayHours). The exact gap
// between the two must equal weatherDelayHours so the UI can render a
// single "weather delay deducted" reconciliation line and have the days
// add up to the header value.
describe('calculateLaytime breakdown vs usedLaytimeHours reconciliation', () => {
  test('SHINC 6-day range with weatherDelayHours=36: gross days − applied = used', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-18T00:00:00Z', // 6 days = 144h gross
      weatherDelayHours: 36,
    };
    const result = calculateLaytime(input);

    const grossSum = result.breakdown
      .filter((e) => !e.excluded)
      .reduce((sum, e) => sum + e.hours, 0);

    // (1) header value is net of the weather deduction
    expect(result.usedLaytimeHours).toBeCloseTo(144 - 36, 1); // 108h
    // (2) the breakdown stays gross (unchanged contract)
    expect(grossSum).toBeCloseTo(144, 1);
    // (3) appliedWeatherDeduction is the amount actually subtracted (full 36 here)
    expect(result.appliedWeatherDeduction).toBeCloseTo(36, 1);
    // (4) the gap between days and header equals the APPLIED deduction (snapshot, not live form)
    expect(grossSum - result.appliedWeatherDeduction).toBeCloseTo(result.usedLaytimeHours, 1);
  });

  test('clamp case: weatherDelayHours (60) > gross (48) → applied caps at gross, used=0, reconciles', () => {
    const input: LaytimeInput = {
      allowedLaytimeDays: 5,
      mode: 'SHINC',
      commencedAt: '2026-05-12T00:00:00Z',
      completedAt: '2026-05-14T00:00:00Z', // 2 days = 48h gross
      weatherDelayHours: 60,
    };
    const result = calculateLaytime(input);

    const grossSum = result.breakdown
      .filter((e) => !e.excluded)
      .reduce((sum, e) => sum + e.hours, 0);

    // gross is 48h
    expect(grossSum).toBeCloseTo(48, 1);
    // used clamps at 0 (can't go negative)
    expect(result.usedLaytimeHours).toBeCloseTo(0, 1);
    // applied deduction is the ACTUAL amount removed: min(weather, gross) = 48, not 60
    expect(result.appliedWeatherDeduction).toBeCloseTo(48, 1);
    // reconciliation must hold even at the clamp boundary: 48 − 48 === 0
    expect(grossSum - result.appliedWeatherDeduction).toBeCloseTo(result.usedLaytimeHours, 1);
  });
});
