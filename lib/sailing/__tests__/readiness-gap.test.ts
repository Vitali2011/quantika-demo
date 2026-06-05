import { calculateReadinessGap, parseSpeedKnots, classifyVesselByDwt, detectSpot, SPOT_IDEAL_MAX_GAP_DAYS } from '../readiness-gap';

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

describe('calculateReadinessGap — past-laycan vs recent vessel open (date-independent)', () => {
  // Broker-loop 2026-05-31: verdict is computed from open-vs-laycan arithmetic only.
  // A past laycan paired with a recent vessel-open yields arrival ≫ laycanStart → 'late'.
  // The wall-clock today is NOT consulted — only the dates on the pair.
  it('open 5 Sep + laycan 15-25 Jan (same year) → verdict late by arithmetic', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Jan', originPort: 'Mykolaiv' },
      { refYear: 2025, today: TODAY },
    );
    expect(r.verdict).toBe('late');
    expect(r.explanation).toMatch(/after laycan|misses laycan/i);
    expect(r.gapDays).not.toBeNull();
    expect(r.gapDays!).toBeLessThan(0);
  });

  it('open 5 Sep + laycan 15-25 Jan → gapDays ≈ -(sailingDays + days from laycanStart to openDate)', () => {
    // laycan.start = Jan 15, arrival = Sep 5 + ~3d sailing ≈ Sep 8 → gap ≈ -236 days.
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
  // Keyword-only → spot
  it('detects "spot"', () => expect(detectSpot('spot')).toBe(true));
  it('detects "SPOT" (case-insensitive)', () => expect(detectSpot('Open: Karasu, SPOT')).toBe(true));
  it('detects "prompt"', () => expect(detectSpot('prompt')).toBe(true));
  it('detects "promt" (common typo)', () => expect(detectSpot('promt')).toBe(true));
  // No keyword → not spot
  it('does not match "5 Sep"', () => expect(detectSpot('5 Sep')).toBe(false));
  it('does not match null', () => expect(detectSpot(null)).toBe(false));
  it('does not match ""', () => expect(detectSpot('')).toBe(false));
  it('does not match ISO date without keyword', () => expect(detectSpot('2026-06-03')).toBe(false));
  // Keyword + concrete date → dated vessel, NOT spot (regression for false-positive fix)
  it('keyword + ISO date → false ("spot 2026-06-03")', () => expect(detectSpot('spot 2026-06-03')).toBe(false));
  it('ISO date + keyword → false ("2026-07-04 prompt")', () => expect(detectSpot('2026-07-04 prompt')).toBe(false));
  it('keyword + day+month → false ("spot 5 Sep")', () => expect(detectSpot('spot 5 Sep')).toBe(false));
});

// Reference: today = 2025-09-05, laycans Aug-Oct 2026 simulate the real-world bug:
// spot vessels were returning gap_days ~120–170 → verdict='idle'.
const TODAY_SPOT = new Date('2026-04-17T00:00:00Z');
const REFYEAR_SPOT = 2026;

describe('calculateReadinessGap — spot vessel fix', () => {
  it('spot + laycan 100d in future → verdict idle (upper threshold: >30d → idle)', () => {
    // Gap ~107 days — exceeds SPOT_IDEAL_MAX_GAP_DAYS (30), so even spot vessel gets 'idle'.
    const r = calculateReadinessGap(
      { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '1-20 Aug', originPort: 'Mykolaiv' },
      { refYear: REFYEAR_SPOT, today: TODAY_SPOT },
    );
    // gapDays should be large positive (laycan is ~107d away, sailing ~1d) → huge positive
    expect(r.gapDays).toBeGreaterThan(30);        // confirms upper threshold applies
    expect(r.verdict).toBe('idle');                // >30d: spot vessel won't hold unpaid that long
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

  it('keyword + ISO date in raw open → NOT spot (SEAGULL-12 regression)', () => {
    // Vessel raw open "spot 2026-06-03": detectSpot must return false (dated vessel).
    // Old behavior: detectSpot("spot 2026-06-03")=true → spot branch: 28d < 30d → 'ideal' (WRONG).
    // New behavior: detectSpot strips keyword → parseVesselOpenDate("2026-06-03") succeeds → false.
    // isSpot=false → classifyVerdict(28) → 'idle' (>5d).
    const TODAY_SEAGULL = new Date('2026-06-03T00:00:00Z');
    const r = calculateReadinessGap(
      { openDate: 'spot 2026-06-03', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '01-05 Jul', originPort: 'Karasu' },
      { refYear: 2026, today: TODAY_SEAGULL },
    );
    expect(r.isSpot).toBe(false);
    expect(r.gapDays).toBeGreaterThan(5);
    expect(r.verdict).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Spec-03: spot vessel upper-threshold boundary tests (SPOT_IDEAL_MAX_GAP_DAYS = 30)
// Bug: gapDays=121 → 'ideal' (incorrect). Fix: gapDays > 30 → 'idle'.
// Reference: .specs/spec-03-fix-bug-121d-gap-ideal-spot-readiness-upper-threshold.md
// ---------------------------------------------------------------------------

/** Build a spot vessel result with a synthetic gapDays by choosing an open port
 *  at 0 NM distance (same port) so sailingDays=0 and gapDays = laycan_start - today. */
function spotResultWithGap(gapDays: number, today: Date, refYear: number) {
  // Use Karasu→Karasu (0 NM) so arrival = today and gapDays = laycan_start - today
  const laycanStart = new Date(today.getTime() + gapDays * 86_400_000);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = MONTHS[laycanStart.getUTCMonth()];
  const dd = String(laycanStart.getUTCDate()).padStart(2, '0');
  const laycan = `${dd} ${mon}-${String(laycanStart.getUTCDate() + 1).padStart(2, '0')} ${mon}`;
  return calculateReadinessGap(
    { openDate: 'spot', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
    { laycan: laycan, originPort: 'Karasu' },
    { refYear, today },
  );
}

const TODAY_THRESH = new Date('2026-04-17T00:00:00Z');
const REFYEAR_THRESH = 2026;

describe('calculateReadinessGap — spot upper-threshold (spec-03)', () => {
  it('SPOT_IDEAL_MAX_GAP_DAYS constant equals 30', () => {
    expect(SPOT_IDEAL_MAX_GAP_DAYS).toBe(30);
  });

  it('spot vessel with gap=121d → verdict idle (the bug scenario)', () => {
    const r = spotResultWithGap(121, TODAY_THRESH, REFYEAR_THRESH);
    expect(r.isSpot).toBe(true);
    expect(r.gapDays).toBeGreaterThan(30);
    expect(r.verdict).toBe('idle');
    expect(r.explanation).toMatch(/spot|immediately/i);
  });

  it('spot vessel with gap exactly 30d → verdict ideal (boundary: still ideal)', () => {
    const r = spotResultWithGap(30, TODAY_THRESH, REFYEAR_THRESH);
    expect(r.isSpot).toBe(true);
    expect(r.gapDays).toBeCloseTo(30, 0);
    expect(r.verdict).toBe('ideal');
  });

  it('spot vessel with gap=31d → verdict idle (boundary: capped)', () => {
    const r = spotResultWithGap(31, TODAY_THRESH, REFYEAR_THRESH);
    expect(r.isSpot).toBe(true);
    expect(r.gapDays).toBeCloseTo(31, 0);
    expect(r.verdict).toBe('idle');
  });

  it('spot vessel with gap=5d → verdict ideal (regression: mid-range unchanged)', () => {
    const r = spotResultWithGap(5, TODAY_THRESH, REFYEAR_THRESH);
    expect(r.isSpot).toBe(true);
    expect(r.gapDays).toBeCloseTo(5, 0);
    expect(r.verdict).toBe('ideal');
  });

  it('spot vessel with gap in [-1, 0.5) → verdict tight (regression)', () => {
    const r = spotResultWithGap(0.2, TODAY_THRESH, REFYEAR_THRESH);
    expect(r.isSpot).toBe(true);
    expect(r.verdict).toBe('tight');
  });

  it('spot vessel with gap < -1 → verdict late (regression)', () => {
    const r = spotResultWithGap(-2, TODAY_THRESH, REFYEAR_THRESH);
    expect(r.isSpot).toBe(true);
    expect(r.verdict).toBe('late');
  });

  it('non-spot vessel classifyVerdict() logic unchanged (regression)', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: 2025, today: new Date('2025-09-05T00:00:00Z') },
    );
    expect(r.isSpot).toBeFalsy();
    expect(r.gapDays).toBeGreaterThan(5);
    expect(r.verdict).toBe('idle');
  });
});

describe('calculateReadinessGap — vague-region UX (Phase C2)', () => {
  const T = new Date('2025-09-05T00:00:00Z');
  const RY = 2025;

  it('vague vessel position "East Coast Greece" → specific explanation', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'East Coast Greece', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: RY, today: T },
    );
    expect(r.verdict).toBe('unknown');
    expect(r.distanceNm).toBeNull();
    expect(r.explanation).toMatch(/East Coast Greece/);
    expect(r.explanation).toMatch(/coastal range|specific|anchorage|load port/i);
    expect(r.explanation).not.toBe('Insufficient data to compute readiness (unparseable date or unknown port).');
  });

  it('vague cargo origin "Red Sea" → specific explanation', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Red Sea' },
      { refYear: RY, today: T },
    );
    expect(r.verdict).toBe('unknown');
    expect(r.explanation).toMatch(/Red Sea/);
    expect(r.explanation).toMatch(/sea\/basin|specific load/i);
  });

  it('vague vessel position "Aegean Sea" → specific explanation', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Aegean Sea', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: RY, today: T },
    );
    expect(r.verdict).toBe('unknown');
    expect(r.explanation).toMatch(/Aegean Sea/);
  });

  it('country-only vague cargo "Tunisia" → specific explanation', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Tunisia' },
      { refYear: RY, today: T },
    );
    expect(r.verdict).toBe('unknown');
    expect(r.explanation).toMatch(/Tunisia/);
    expect(r.explanation).toMatch(/country/i);
  });

  it('BOTH sides vague → combined explanation', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'East Coast Greece', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Red Sea' },
      { refYear: RY, today: T },
    );
    expect(r.verdict).toBe('unknown');
    expect(r.explanation).toMatch(/Vessel position/i);
    expect(r.explanation).toMatch(/Cargo origin/i);
  });

  it('regression: "Marmara" still resolves and does NOT trigger vague hint', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Marmara', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: RY, today: T },
    );
    // Either a numeric verdict (resolved → distance computed) or unknown — but
    // if unknown, the explanation must NOT contain the vague-region template.
    if (r.verdict === 'unknown') {
      expect(r.explanation).not.toMatch(/coastal range|sea\/basin|country/i);
    } else {
      expect(r.distanceNm).not.toBeNull();
    }
  });

  it('regression: truly unknown port "Atlantis" → generic insufficient-data fallback (not vague)', () => {
    const r = calculateReadinessGap(
      { openDate: '5 Sep', openPosition: 'Atlantis', speedLaden: null, dwtSummer: 5200 },
      { laycan: '15-25 Sep', originPort: 'Mykolaiv' },
      { refYear: RY, today: T },
    );
    expect(r.verdict).toBe('unknown');
    // "Atlantis" is not a sea/coast/country pattern → falls back to generic.
    expect(r.explanation).toBe('Insufficient data to compute readiness (unparseable date or unknown port).');
  });
});

describe('calculateReadinessGap — date-independence (broker-loop 2026-05-31)', () => {
  // Scoring/отсев must NOT depend on wall-clock today. Two runs with very different
  // `today` values, holding refYear and inputs constant, must yield identical
  // verdict + gapDays for non-spot vessels (spot vessels intentionally pin their
  // open date to today and are excluded from this invariant).
  const vessel = { openDate: '13 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 };
  const cargo = { laycan: '15-25 Sep', originPort: 'Mykolaiv' };

  it('same refYear, today=2026-05-01 vs 2030-01-01 → identical verdict + gapDays', () => {
    const r1 = calculateReadinessGap(vessel, cargo, { refYear: 2025, today: new Date('2026-05-01T00:00:00Z') });
    const r2 = calculateReadinessGap(vessel, cargo, { refYear: 2025, today: new Date('2030-01-01T00:00:00Z') });
    expect(r2.verdict).toBe(r1.verdict);
    expect(r2.gapDays).toBe(r1.gapDays);
    expect(r2.arrivalDate).toBe(r1.arrivalDate);
    expect(r2.sailingDays).toBe(r1.sailingDays);
  });

  it('past laycan + recent open → late on both today values, identical gap', () => {
    const v = { openDate: '5 Sep', openPosition: 'Karasu', speedLaden: null, dwtSummer: 5200 };
    const c = { laycan: '15-25 Jan', originPort: 'Mykolaiv' };
    const r1 = calculateReadinessGap(v, c, { refYear: 2025, today: new Date('2025-09-05T00:00:00Z') });
    const r2 = calculateReadinessGap(v, c, { refYear: 2025, today: new Date('2030-12-31T00:00:00Z') });
    expect(r1.verdict).toBe('late');
    expect(r2.verdict).toBe('late');
    expect(r2.gapDays).toBe(r1.gapDays);
  });
});
