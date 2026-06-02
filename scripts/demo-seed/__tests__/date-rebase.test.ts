import { shiftBodyDates, shiftMonthYear } from '../date-utils';

describe('shiftBodyDates — range preservation', () => {
  it('shifts a year-qualified range "22/26 August 2026" by 10 days and keeps the 4-day span', () => {
    const shifted = shiftBodyDates('22/26 August 2026', 10);
    // 22 Aug + 10d = 1 Sep; 26 Aug + 10d = 5 Sep → same-month → "1-5 September 2026"
    expect(shifted).toMatch(/1.?5\s*September\s*2026/i);
    // span must be preserved: no collapse to a single date
    const dayMatch = shifted.match(/(\d+)[^\d]+(\d+)/);
    if (dayMatch) {
      const span = parseInt(dayMatch[2]) - parseInt(dayMatch[1]);
      expect(span).toBe(4); // 22→26 = 4-day span
    }
  });

  it('shifts "15-20 April 2026" by 45d — cross-month range, span stays 5 days', () => {
    const shifted = shiftBodyDates('15-20 April 2026', 45);
    // 15 Apr + 45d = 30 May; 20 Apr + 45d = 4 Jun → cross-month
    expect(shifted).toMatch(/30\s*May/i);
    expect(shifted).toMatch(/4\s*June?\s*2026/i);
  });

  it('ISO date "2026-06-01" shifts correctly', () => {
    expect(shiftBodyDates('2026-06-01', 30)).toBe('2026-07-01');
  });

  it('unchanged text passes through when no date pattern matches', () => {
    expect(shiftBodyDates('dwt 12000 mt geared', 10)).toBe('dwt 12000 mt geared');
  });
});

describe('shiftMonthYear — survey/drydock date shifting', () => {
  it('shifts "dd 06/2025" by 365 days → "06/2026"', () => {
    const result = shiftMonthYear('dd 06/2025', 365);
    expect(result).toBe('dd 06/2026');
  });

  it('shifts "ss 12/2025" by 90 days → "03/2026"', () => {
    const result = shiftMonthYear('ss 12/2025', 90);
    expect(result).toBe('ss 03/2026');
  });

  it('shifts "DRYDOCK: 06/2025" correctly', () => {
    const result = shiftMonthYear('DRYDOCK: 06/2025', 365);
    expect(result).toBe('DRYDOCK: 06/2026');
  });

  it('passes through text with no MM/YYYY pattern', () => {
    expect(shiftMonthYear('open Rotterdam', 30)).toBe('open Rotterdam');
  });

  it('shifts month boundary correctly: "01/2026" + 31 days → "02/2026"', () => {
    expect(shiftMonthYear('01/2026', 31)).toBe('02/2026');
  });
});
