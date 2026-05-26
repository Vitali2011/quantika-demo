import { fmtLaycan } from '../fmt-laycan';

describe('fmtLaycan — #498 laycan date range formatter', () => {
  const MAY_10 = new Date('2026-05-10T12:00:00Z').getTime() / 1000;
  const MAY_25 = new Date('2026-05-25T12:00:00Z').getTime() / 1000;

  it('returns "—" when both start and end are null', () => {
    expect(fmtLaycan(null, null)).toBe('—');
  });

  it('returns full range string when both timestamps provided', () => {
    const result = fmtLaycan(MAY_10, MAY_25);
    expect(result).toMatch(/May/);
    expect(result).toContain('–');
    expect(result).toMatch(/10/);
    expect(result).toMatch(/25/);
  });

  it('returns start-only string when end is null', () => {
    const result = fmtLaycan(MAY_10, null);
    expect(result).toMatch(/May/);
    expect(result).toMatch(/10/);
    expect(result).not.toContain('–');
  });

  it('returns end-only string when start is null', () => {
    const result = fmtLaycan(null, MAY_25);
    expect(result).toMatch(/May/);
    expect(result).toMatch(/25/);
    expect(result).not.toContain('–');
  });
});
