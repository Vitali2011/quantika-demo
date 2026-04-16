import { parseVesselOpenDate, parseLaycan } from '../date-parsing';

const REF = 2025; // all sample data uses 2025 dates

describe('parseVesselOpenDate', () => {
  it('parses "5 Sep" with reference year', () => {
    const d = parseVesselOpenDate('5 Sep', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-05');
  });

  it('parses "Sep 5" (month first)', () => {
    const d = parseVesselOpenDate('Sep 5', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-05');
  });

  it('parses range "Sep 6-8" as window start', () => {
    const d = parseVesselOpenDate('Sep 6-8', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-06');
  });

  it('parses range "6-8 Sep" same way', () => {
    const d = parseVesselOpenDate('6-8 Sep', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-06');
  });

  it('parses "TODAY" using reference date', () => {
    const d = parseVesselOpenDate('TODAY', REF, new Date('2025-09-05T00:00:00Z'));
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-05');
  });

  it('parses "spot" as reference date', () => {
    const d = parseVesselOpenDate('spot', REF, new Date('2025-09-05T00:00:00Z'));
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-05');
  });

  it('parses "beg October" as first third (~ Oct 3)', () => {
    const d = parseVesselOpenDate('beg October', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-10-03');
  });

  it('parses "mid September" as ~ Sep 15', () => {
    const d = parseVesselOpenDate('mid September', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-15');
  });

  it('parses "end August" as ~ Aug 27', () => {
    const d = parseVesselOpenDate('end August', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-08-27');
  });

  it('parses ISO date 2025-09-05 natively', () => {
    const d = parseVesselOpenDate('2025-09-05', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-09-05');
  });

  it('parses "18.08.25" DMY format', () => {
    const d = parseVesselOpenDate('18.08.25', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-08-18');
  });

  it('parses "eta 9 Aug"', () => {
    const d = parseVesselOpenDate('eta 9 Aug', REF);
    expect(d?.toISOString().slice(0, 10)).toBe('2025-08-09');
  });

  it('returns null for empty or garbage', () => {
    expect(parseVesselOpenDate('', REF)).toBeNull();
    expect(parseVesselOpenDate(null as unknown as string, REF)).toBeNull();
    expect(parseVesselOpenDate('jiberish without numbers', REF)).toBeNull();
  });
});

describe('parseLaycan', () => {
  it('parses "15-25 Sep"', () => {
    const r = parseLaycan('15-25 Sep', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-15');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-09-25');
  });

  it('parses "Sep 15-25"', () => {
    const r = parseLaycan('Sep 15-25', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-15');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-09-25');
  });

  it('parses "15/09 - 25/09"', () => {
    const r = parseLaycan('15/09 - 25/09', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-15');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-09-25');
  });

  it('parses "15-25/09/2025" dotted', () => {
    const r = parseLaycan('15-25/09/2025', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-15');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-09-25');
  });

  it('parses "end Sep - beg Oct" (cross-month phrase)', () => {
    const r = parseLaycan('end Sep - beg Oct', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-27');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-10-03');
  });

  it('parses single date "20 Sep" as {start == end}', () => {
    const r = parseLaycan('20 Sep', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-20');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-09-20');
  });

  it('parses "2025-09-15 to 2025-09-25" ISO range', () => {
    const r = parseLaycan('2025-09-15 to 2025-09-25', REF);
    expect(r?.start.toISOString().slice(0, 10)).toBe('2025-09-15');
    expect(r?.end.toISOString().slice(0, 10)).toBe('2025-09-25');
  });

  it('returns null for empty or garbage', () => {
    expect(parseLaycan('', REF)).toBeNull();
    expect(parseLaycan(null, REF)).toBeNull();
    expect(parseLaycan('xxx', REF)).toBeNull();
  });
});
