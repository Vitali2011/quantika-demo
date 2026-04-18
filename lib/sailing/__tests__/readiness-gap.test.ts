import { calculateReadinessGap, parseSpeedKnots, classifyVesselByDwt, detectSpot } from '../readiness-gap';

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

describe('calculateReadinessGap — expired laycan', () => {
  // TODAY is 2025-09-05; laycan "15-25 Jan" parsed with refYear=2025 → already expired.
  it('expired laycan → verdict late, explanation contains "expired"', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Jan', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.verdict).toBe('late');
    expect(r.explanation).toMatch(/expired/i);
    expect(r.gapDays).not.toBeNull();
    expect(r.gapDays!).toBeLessThan(0);
  });

  it('expired laycan → gapDays is negative (days-after-end)', () => {
    // laycan.end = 2025-01-25, today = 2025-09-05 → gap ≈ -222 days
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Jan', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.gapDays!).toBeLessThan(-100);
  });

  it('future laycan → existing verdict unchanged (regression guard)', () => {
    // This is the "Mustafa case" baseline — must stay 'idle'
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.verdict).toBe('idle');
    expect(r.explanation).not.toMatch(/expired/i);
  });
});

describe('detectSpot', () => {
  it('detects "spot"', () => expect(detectSpot('spot')).toBe(true));
  it('detects "SPOT" (case-insensitive)', () => expect(detectSpot('Open: Karasu, SPOT')).toBe(true));
  it('detects "prompt"', () => expect(detectSpot('prompt')).toBe(true));
  it('detects "promt" (common typo)', () => expect(detectSpot('promt')).toBe(true));
  it('does not match "5 Sep"', () => expect(detectSpot('5 Sep')).toBe(false));
  it('does not match null', () => expect(detectSpot(null)).toBe(false));
});

// Reference: today = 2025-09-05, laycans Aug-Oct 2026 simulate the real-world bug:
// spot vessels were returning gap_days ~120–170 → verdict='idle'.
const TODAY_SPOT = new Date('2026-04-17T00:00:00Z');
const REFYEAR_SPOT = 2026;

describe('calculateReadinessGap — spot vessel fix', () => {
  it('spot + laycan 100d in future → verdict ideal (not idle)', () => {
    // Gap ~100 days — a non-spot vessel would be 'idle', but spot is 'ideal'.
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '1-20 Aug', originPort: 'Mykolaiv' },
      { refYear: REFYEAR_SPOT, today: TODAY_SPOT },
    );
    // gapDays should be large positive (laycan is ~107d away, sailing ~1d) → huge positive
    expect(r.gapDays).toBeGreaterThan(5);         // confirms it would have been 'idle' before fix
    expect(r.verdict).toBe('ideal');               // fix: spot overrides idle → ideal
    expect(r.isSpot).toBe(true);
    expect(r.explanation).toMatch(/spot|immediately/i);
  });

  it('spot + laycan already passed → verdict late', () => {
    // Laycan was Jan 2026, today is Apr 2026 — vessel can't time-travel.
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '1-20 Jan', originPort: 'Mykolaiv' },
      { refYear: REFYEAR_SPOT, today: TODAY_SPOT },
    );
    expect(r.gapDays).toBeLessThan(-1);
    expect(r.verdict).toBe('late');
    expect(r.isSpot).toBe(true);
  });

  it('non-spot vessel + 100-day gap → verdict idle (unchanged behaviour)', () => {
    // Sanity check: non-spot vessel with large positive gap stays idle.
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.gapDays).toBeGreaterThan(5);
    expect(r.verdict).toBe('idle');
    expect(r.isSpot).toBeFalsy();
  });

  it('spot with explicit isSpot flag → overrides verdict correctly', () => {
    // Caller sets isSpot=true even if openDate looks like a normal date.
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200, isSpot: true },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.verdict).toBe('ideal');   // gapDays ~9 → would be idle for non-spot, ideal for spot
    expect(r.isSpot).toBe(true);
  });
});
