import { calculateReadinessGap, parseSpeedKnots, classifyVesselByDwt } from '../readiness-gap';

const TODAY = new Date('2025-09-05T00:00:00Z');

describe('parseSpeedKnots', () => {
  it('parses "12.5 knots"', () => {
    expect(parseSpeedKnots('12.5 knots')).toBeCloseTo(12.5);
  });
  it('parses "13 kn"', () => {
    expect(parseSpeedKnots('13 kn')).toBe(13);
  });
  it('parses "abt 12 knts"', () => {
    expect(parseSpeedKnots('abt 12 knts')).toBe(12);
  });
  it('returns null on garbage', () => {
    expect(parseSpeedKnots('fast')).toBeNull();
    expect(parseSpeedKnots(null)).toBeNull();
    expect(parseSpeedKnots('')).toBeNull();
  });
});

describe('classifyVesselByDwt', () => {
  it('5200 DWT → handysize', () => {
    expect(classifyVesselByDwt(5200)).toBe('handysize');
  });
  it('55000 DWT → supramax', () => {
    expect(classifyVesselByDwt(55000)).toBe('supramax');
  });
  it('null → handysize fallback', () => {
    expect(classifyVesselByDwt(null)).toBe('handysize');
  });
});

describe('calculateReadinessGap — Mustafa case', () => {
  it('Open Karasu 5 Sep → Mykolaiv 15-25 Sep laycan → verdict idle', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.distanceNm).toBe(315);
    expect(r.sailingDays).toBeCloseTo(1.05, 1);  // 315 / (12.5 * 24)
    expect(r.gapDays).toBeGreaterThan(7);
    expect(r.gapDays).toBeLessThan(10);
    expect(r.verdict).toBe('idle');
    expect(r.explanation).toContain('Karasu');
    expect(r.explanation).toContain('Mykolaiv');
    expect(r.explanation).toMatch(/idle|before.*laycan/i);
  });

  it('Open Karasu 14 Sep → Mykolaiv 15-25 Sep → verdict tight', () => {
    const r = calculateReadinessGap(
      { openDate: '14 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    // arrives ~15 Sep (14 + 1.05d sail), laycan starts 15 → gap ≈ 0
    expect(r.verdict).toBe('tight');
  });

  it('Open Karasu 13 Sep → Mykolaiv 15-25 Sep → verdict ideal', () => {
    const r = calculateReadinessGap(
      { openDate: '13 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    // arrives ~14 Sep, laycan starts 15 → gap ≈ 1
    expect(r.verdict).toBe('ideal');
    expect(r.gapDays).toBeGreaterThanOrEqual(0);
  });

  it('Open Karasu 25 Sep → Mykolaiv 15-25 Sep → verdict late', () => {
    const r = calculateReadinessGap(
      { openDate: '25 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    // arrives ~26 Sep, laycan ends 25 → arrives after start by 11d → late
    expect(r.verdict).toBe('late');
    expect(r.gapDays).toBeLessThan(-1);
  });

  it('Unknown port → verdict unknown, nothing filtered', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Atlantis', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.distanceNm).toBeNull();
    expect(r.gapDays).toBeNull();
    expect(r.verdict).toBe('unknown');
  });

  it('Unparseable laycan → verdict unknown', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: null, originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.verdict).toBe('unknown');
  });

  it('Explicit vessel speed overrides default', () => {
    const slow = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: '8 knots', dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    const fast = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: '16 knots', dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(slow.sailingDays).toBeGreaterThan(fast.sailingDays!);
  });

  it('Same port → 0 NM, sailing 0 days', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '10-15 Sep', originPort: 'Karasu' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.distanceNm).toBe(0);
    expect(r.sailingDays).toBe(0);
    expect(r.verdict).toBe('ideal');
  });
});
