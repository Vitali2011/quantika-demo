import { estimateCiiByBuildYear } from '../cii-estimate';

describe('estimateCiiByBuildYear — conservative deterministic rule', () => {
  it('built >= 2008 → C (ceiling, never A/B)', () => {
    expect(estimateCiiByBuildYear(2008)).toBe('C');
    expect(estimateCiiByBuildYear(2015)).toBe('C');
    expect(estimateCiiByBuildYear(2020)).toBe('C');
  });

  it('1995..2007 → D', () => {
    expect(estimateCiiByBuildYear(1995)).toBe('D');
    expect(estimateCiiByBuildYear(2001)).toBe('D');
    expect(estimateCiiByBuildYear(2007)).toBe('D');
  });

  it('< 1995 → E', () => {
    expect(estimateCiiByBuildYear(1994)).toBe('E');
    expect(estimateCiiByBuildYear(1986)).toBe('E');
  });

  it('boundaries are deterministic at the exact cut years', () => {
    expect(estimateCiiByBuildYear(2007)).toBe('D');
    expect(estimateCiiByBuildYear(2008)).toBe('C');
    expect(estimateCiiByBuildYear(1994)).toBe('E');
    expect(estimateCiiByBuildYear(1995)).toBe('D');
  });

  it('never returns an optimistic A or B for any plausible year', () => {
    for (let y = 1900; y <= 2100; y++) {
      const r = estimateCiiByBuildYear(y);
      expect(r === 'A' || r === 'B').toBe(false);
      expect(['C', 'D', 'E']).toContain(r);
    }
  });

  it('missing / implausible build year → unknown (neutral, never penalty)', () => {
    expect(estimateCiiByBuildYear(null)).toBe('unknown');
    expect(estimateCiiByBuildYear(undefined)).toBe('unknown');
    expect(estimateCiiByBuildYear(NaN)).toBe('unknown');
    expect(estimateCiiByBuildYear(1850)).toBe('unknown');
    expect(estimateCiiByBuildYear(3000)).toBe('unknown');
  });

  it('is a pure function — same input, same output', () => {
    expect(estimateCiiByBuildYear(1999)).toBe(estimateCiiByBuildYear(1999));
  });
});
