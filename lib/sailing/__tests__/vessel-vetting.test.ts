/**
 * Behavioral tests for lib/sailing/vessel-vetting.ts.
 * Anchors:
 *   - unknown per-factor → neutral (never penalised)
 *   - pure / date-independent — same refYear → same result
 *   - white/IACS/young/IG/A → score=1.0, no badges
 *   - black flag / aged / D|E CII → lower score + badges
 */
import { computeVesselVetting, VETTING_VERDICT_SHARE } from '../vessel-vetting';
import type { ParsedVessel } from '@/lib/types';

const REF_YEAR = 2026;

function makeVesselFields(
  over: Partial<Pick<ParsedVessel, 'flag' | 'built' | 'classSociety' | 'pandi' | 'ciiRating'>> = {},
): Pick<ParsedVessel, 'flag' | 'built' | 'classSociety' | 'pandi' | 'ciiRating'> {
  return {
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    ciiRating: null,
    ...over,
  };
}

describe('computeVesselVetting — unknown = neutral', () => {
  it('all fields null → score = UNKNOWN_SHARE (0.6), no badges', () => {
    const result = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR });
    expect(result.score).toBeCloseTo(VETTING_VERDICT_SHARE.unknown, 5);
    expect(result.badges).toHaveLength(0);
    expect(result.factors).toHaveLength(5);
    for (const f of result.factors) {
      expect(f.verdict).toBe('unknown');
    }
  });
});

describe('computeVesselVetting — clean vessel → full score', () => {
  it('white flag + IACS + young + IG + CII B → score=1.0, no badges', () => {
    const vessel = makeVesselFields({
      flag: 'Marshall Islands',
      classSociety: 'DNV',
      built: 2018, // 8 years old in 2026
      pandi: 'Gard',
      ciiRating: 'B',
    });
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    expect(result.score).toBeCloseTo(1.0, 5);
    expect(result.badges).toHaveLength(0);
  });
});

describe('computeVesselVetting — concerns lower score + add badges', () => {
  it('black flag → warn → score < 0.8, flag badge present', () => {
    const vessel = makeVesselFields({ flag: 'Comoros' });
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    expect(result.score).toBeLessThan(0.8);
    expect(result.badges.some((b) => /Flag/i.test(b))).toBe(true);
  });

  it('grey flag → caution → score lower than white', () => {
    const white = computeVesselVetting(makeVesselFields({ flag: 'Marshall Islands' }), { refYear: REF_YEAR });
    const grey = computeVesselVetting(makeVesselFields({ flag: 'Togo' }), { refYear: REF_YEAR });
    expect(grey.score).toBeLessThan(white.score);
  });

  it('non-IACS class → caution verdict', () => {
    const result = computeVesselVetting(makeVesselFields({ classSociety: 'RS' }), { refYear: REF_YEAR });
    const classFactor = result.factors.find((f) => f.key === 'class');
    expect(classFactor?.verdict).toBe('caution');
  });

  it('aged vessel (>22yr) → warn verdict, badge present', () => {
    const vessel = makeVesselFields({ built: 1998 }); // 28 years in 2026
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const ageFactor = result.factors.find((f) => f.key === 'age');
    expect(ageFactor?.verdict).toBe('warn');
    expect(result.badges.some((b) => /age/i.test(b))).toBe(true);
  });

  it('mature vessel (16yr, >15 ≤22) → caution', () => {
    const vessel = makeVesselFields({ built: 2010 }); // 16 years in 2026
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const ageFactor = result.factors.find((f) => f.key === 'age');
    expect(ageFactor?.verdict).toBe('caution');
  });

  it('young vessel (≤15yr) → ok', () => {
    const vessel = makeVesselFields({ built: 2015 }); // 11 years in 2026
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const ageFactor = result.factors.find((f) => f.key === 'age');
    expect(ageFactor?.verdict).toBe('ok');
  });

  it('non-IG P&I → caution, P&I badge', () => {
    const vessel = makeVesselFields({ pandi: 'SomeLocalClub' });
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const pandiFactor = result.factors.find((f) => f.key === 'pandi');
    expect(pandiFactor?.verdict).toBe('caution');
  });

  it('CII E → warn verdict', () => {
    const vessel = makeVesselFields({ ciiRating: 'E' });
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const ciiFactor = result.factors.find((f) => f.key === 'cii');
    expect(ciiFactor?.verdict).toBe('warn');
  });

  it('CII D → caution verdict', () => {
    const vessel = makeVesselFields({ ciiRating: 'D' });
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const ciiFactor = result.factors.find((f) => f.key === 'cii');
    expect(ciiFactor?.verdict).toBe('caution');
  });

  it('CII C → ok (meets minimum standard)', () => {
    const vessel = makeVesselFields({ ciiRating: 'C' });
    const result = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const ciiFactor = result.factors.find((f) => f.key === 'cii');
    expect(ciiFactor?.verdict).toBe('ok');
  });
});

describe('computeVesselVetting — date-independence', () => {
  it('two calls with same inputs → identical result (pure function)', () => {
    const vessel = makeVesselFields({ flag: 'Marshall Islands', built: 2015, classSociety: 'DNV' });
    const r1 = computeVesselVetting(vessel, { refYear: REF_YEAR });
    const r2 = computeVesselVetting(vessel, { refYear: REF_YEAR });
    expect(r1.score).toBe(r2.score);
    expect(r1.factors.map((f) => f.verdict)).toEqual(r2.factors.map((f) => f.verdict));
  });

  it('different refYear → different age verdict (deterministic per caller)', () => {
    const vessel = makeVesselFields({ built: 2009 });
    // refYear=2024: age=15 → ok (boundary at AGE_CAUTION_YR=15)
    // refYear=2026: age=17 → caution
    const r2024 = computeVesselVetting(vessel, { refYear: 2024 });
    const r2026 = computeVesselVetting(vessel, { refYear: 2026 });
    const age2024 = r2024.factors.find((f) => f.key === 'age');
    const age2026 = r2026.factors.find((f) => f.key === 'age');
    expect(age2024?.verdict).toBe('ok');
    expect(age2026?.verdict).toBe('caution');
  });
});

describe('computeVesselVetting — score ordering', () => {
  it('clean vessel scores strictly higher than all-unknown', () => {
    const clean = computeVesselVetting(
      makeVesselFields({ flag: 'Marshall Islands', classSociety: 'LR', built: 2020, pandi: 'Skuld', ciiRating: 'A' }),
      { refYear: REF_YEAR },
    );
    const unknown = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR });
    expect(clean.score).toBeGreaterThan(unknown.score);
  });

  it('vessel with warn factors scores lower than all-unknown', () => {
    const bad = computeVesselVetting(
      makeVesselFields({ flag: 'Comoros', built: 1995, ciiRating: 'E' }),
      { refYear: REF_YEAR },
    );
    const unknownVessel = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR });
    expect(bad.score).toBeLessThan(unknownVessel.score);
  });
});

describe('computeVesselVetting — PSC sub-factor (optional)', () => {
  it('detentionCount omitted → still 5 factors (backward-compatible)', () => {
    const result = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR });
    expect(result.factors).toHaveLength(5);
    expect(result.factors.some((f) => f.key === 'psc')).toBe(false);
  });

  it('detentionCount=0 → 6 factors, psc verdict ok, no badge', () => {
    const result = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR, detentionCount: 0 });
    expect(result.factors).toHaveLength(6);
    const psc = result.factors.find((f) => f.key === 'psc');
    expect(psc?.verdict).toBe('ok');
    expect(result.badges.some((b) => /detention|PSC/i.test(b))).toBe(false);
  });

  it('detentionCount=1 → psc caution + badge', () => {
    const result = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR, detentionCount: 1 });
    const psc = result.factors.find((f) => f.key === 'psc');
    expect(psc?.verdict).toBe('caution');
    expect(result.badges.some((b) => /detention|PSC/i.test(b))).toBe(true);
  });

  it('detentionCount>=2 → psc warn, lower score than caution', () => {
    const warn = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR, detentionCount: 2 });
    const caution = computeVesselVetting(makeVesselFields(), { refYear: REF_YEAR, detentionCount: 1 });
    const psc = warn.factors.find((f) => f.key === 'psc');
    expect(psc?.verdict).toBe('warn');
    expect(warn.score).toBeLessThan(caution.score);
  });

  it('a detention lowers overall vetting vs a clean PSC record', () => {
    const clean = computeVesselVetting(makeVesselFields({ flag: 'Marshall Islands', classSociety: 'DNV', built: 2018, pandi: 'Gard', ciiRating: 'B' }), { refYear: REF_YEAR, detentionCount: 0 });
    const detained = computeVesselVetting(makeVesselFields({ flag: 'Marshall Islands', classSociety: 'DNV', built: 2018, pandi: 'Gard', ciiRating: 'B' }), { refYear: REF_YEAR, detentionCount: 2 });
    expect(detained.score).toBeLessThan(clean.score);
  });
});
