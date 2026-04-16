import { isLaycanValid, isOpenDateStale, validateDates } from '../date-sanity';

const TODAY = new Date('2025-09-05T00:00:00Z');

describe('isLaycanValid', () => {
  it('normal range → valid', () => {
    const r = isLaycanValid({ start: new Date('2025-09-15'), end: new Date('2025-09-25') });
    expect(r.valid).toBe(true);
  });

  it('single-day (start==end) → valid', () => {
    const r = isLaycanValid({ start: new Date('2025-09-15'), end: new Date('2025-09-15') });
    expect(r.valid).toBe(true);
  });

  it('inverted (end < start) → invalid', () => {
    const r = isLaycanValid({ start: new Date('2025-09-25'), end: new Date('2025-09-15') });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/end.*before.*start|inverted/i);
  });

  it('absurdly long window (> 60 days) → warn but valid', () => {
    const r = isLaycanValid({ start: new Date('2025-09-01'), end: new Date('2025-12-31') });
    expect(r.valid).toBe(true);
    expect(r.warning).toMatch(/long|unusual/i);
  });

  it('null → invalid', () => {
    const r = isLaycanValid(null);
    expect(r.valid).toBe(false);
  });
});

describe('isOpenDateStale', () => {
  it('open date 2 days ago → not stale', () => {
    const r = isOpenDateStale(new Date('2025-09-03'), TODAY, 5);
    expect(r.stale).toBe(false);
  });

  it('open date 10 days ago → stale', () => {
    const r = isOpenDateStale(new Date('2025-08-26'), TODAY, 5);
    expect(r.stale).toBe(true);
    expect(r.daysOld).toBeGreaterThanOrEqual(10);
  });

  it('open date in future → not stale', () => {
    const r = isOpenDateStale(new Date('2025-09-10'), TODAY, 5);
    expect(r.stale).toBe(false);
  });

  it('open date > 30 days old → "very stale" flag', () => {
    const r = isOpenDateStale(new Date('2025-07-01'), TODAY, 5);
    expect(r.stale).toBe(true);
    expect(r.veryStale).toBe(true);
  });

  it('null open date → not stale', () => {
    const r = isOpenDateStale(null, TODAY, 5);
    expect(r.stale).toBe(false);
  });
});

describe('validateDates (combined)', () => {
  it('fresh vessel + valid laycan → all green', () => {
    const r = validateDates({
      openDate: new Date('2025-09-04'),
      laycan: { start: new Date('2025-09-15'), end: new Date('2025-09-25') },
      today: TODAY,
    });
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('stale vessel → warning in issues but still valid', () => {
    const r = validateDates({
      openDate: new Date('2025-08-10'),
      laycan: { start: new Date('2025-09-15'), end: new Date('2025-09-25') },
      today: TODAY,
    });
    expect(r.issues.some(i => /stale|old/i.test(i))).toBe(true);
  });

  it('inverted laycan → invalid', () => {
    const r = validateDates({
      openDate: new Date('2025-09-04'),
      laycan: { start: new Date('2025-09-25'), end: new Date('2025-09-15') },
      today: TODAY,
    });
    expect(r.valid).toBe(false);
  });
});
