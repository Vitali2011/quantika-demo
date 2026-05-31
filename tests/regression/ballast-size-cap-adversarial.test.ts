/**
 * COLD-START adversarial QA — applyBallastSizeCap + isPartCargo (Wave C levers 3+4).
 *
 * Target module: lib/sailing/match-scoring.ts (PR a28b4a5 / 2b9e4f1).
 * The dev-authored happy-path suite lives in lib/sailing/__tests__/match-scoring.test.ts.
 * This file attacks the gaps that suite does NOT cover.
 *
 * Each `it` is labelled:
 *   [BUG]      — found a real defect on first QA pass; the fix (commit 0962133)
 *                hardened isPartCargo + the null-DWT guard, so these now PASS and
 *                stand as regression guards. The "misses it" comments below describe
 *                the PRE-FIX regex (`[\s-]?`, `\bcargo\b`), kept for provenance.
 *   [FIXED]    — a soundness concern from the first pass, now resolved in code.
 *
 * NOTE: jest.config.mjs excludes /tests/regression/ from `npm test`; the
 * contract-critical cases are mirrored in lib/sailing/__tests__/match-scoring.test.ts
 * (which DOES run in CI). This file is the cold-start QA artifact.
 */
import {
  applyBallastSizeCap,
  isPartCargo,
  BALLAST_GOOD_MAX_NM,
  type BallastSizeCapInput,
} from '@/lib/sailing/match-scoring';
import type { Match } from '@/lib/types';

function mkMatch(score = 81, level: Match['matchLevel'] = 'good', issues: string[] = []): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score,
    matchLevel: level,
    matchReasons: [],
    issues,
  };
}

function capInput(over: Partial<BallastSizeCapInput> = {}): BallastSizeCapInput {
  return {
    match: mkMatch(81, 'good'),
    distanceNm: null,
    vesselDwt: 5200, // handysize
    vesselDwcc: null,
    cargoWeightMax: null,
    cargoDescription: null,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. isPartCargo — FALSE NEGATIVES (legit part-cargo wrongly demoted = HIGH)
// The acceptance contract: a legitimate part-cargo MUST NOT be demoted.
// A false-negative means isPartCargo returns false for a real part-cargo phrase,
// so the size guard fires and the 'good' match is wrongly capped to 'possible'.
// ─────────────────────────────────────────────────────────────────────────────
describe('isPartCargo — adversarial false-negatives (HIGH)', () => {
  it('[BUG] plural "part cargoes" is a real part-cargo phrase', () => {
    // "2 part cargoes of steel" — extremely common broker phrasing.
    // \bcargo\b does not match "cargoes" => regex misses it.
    expect(isPartCargo('2 part cargoes of steel coils')).toBe(true);
  });

  it('[BUG] plural "part loads" is a real part-cargo phrase', () => {
    expect(isPartCargo('vessel can take 2 part loads')).toBe(true);
  });

  it('[BUG] "p/c" is the standard broker abbreviation for part cargo', () => {
    // Brokers routinely write "p/c basis" for part-cargo basis.
    expect(isPartCargo('steel, p/c basis')).toBe(true);
  });

  it('[BUG] double-space "part  cargo" (whitespace variance) is part cargo', () => {
    // [\s-]? allows only ONE separator char; two spaces breaks the match.
    expect(isPartCargo('part  cargo of bagged urea')).toBe(true);
  });

  it('[BUG] underscore-joined "part_cargo" is part cargo', () => {
    expect(isPartCargo('part_cargo')).toBe(true);
  });
});

describe('isPartCargo — confirmed-correct cases (regression guards)', () => {
  it('matches the canonical forms the dev suite relies on', () => {
    expect(isPartCargo('part cargo')).toBe(true);
    expect(isPartCargo('part-cargo basis')).toBe(true);
    expect(isPartCargo('in part cargo')).toBe(true);
    expect(isPartCargo('part load')).toBe(true);
    expect(isPartCargo('part lot')).toBe(true);
    expect(isPartCargo('PART CARGO')).toBe(true);
    expect(isPartCargo('partcargo')).toBe(true); // no-space variant DOES match
  });

  it('[BEHAVIOR] does NOT false-positive on substrings — "counterpart cargo", "departure cargo"', () => {
    // \bpart guards the left boundary, so "counterpart cargo"/"departure cargo" are safe.
    // GOOD: a disproportionate full cargo with these words is NOT wrongly exempted.
    expect(isPartCargo('counterpart cargo')).toBe(false);
    expect(isPartCargo('departure cargo nomination')).toBe(false);
    expect(isPartCargo('parcel of wheat')).toBe(false); // bare "parcel" intentionally excluded
    expect(isPartCargo('partial cargo')).toBe(false); // "partial" intentionally excluded
  });

  it('null / undefined / empty → false (no crash)', () => {
    expect(isPartCargo(null)).toBe(false);
    expect(isPartCargo(undefined)).toBe(false);
    expect(isPartCargo('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. End-to-end demotion: a legit part-cargo wrongly capped via the false-negative
// This proves the isPartCargo bug propagates to the acceptance-contract violation.
// ─────────────────────────────────────────────────────────────────────────────
describe('applyBallastSizeCap — legit part-cargo wrongly demoted (HIGH)', () => {
  it('[BUG] "2 part cargoes" low-util match must stay good (part-cargo exempt)', () => {
    // 2500mt cargo on a 50000 DWT vessel = 5% util — would be capped UNLESS exempt.
    const out = applyBallastSizeCap(
      capInput({
        distanceNm: 200,
        vesselDwt: 50000,
        cargoWeightMax: 2500,
        cargoDescription: '2 part cargoes of steel',
      }),
    );
    expect(out.matchLevel).toBe('good');
    expect((out.issues ?? []).some((i) => i.startsWith('SIZE:'))).toBe(false);
  });

  it('[BUG] "p/c basis" low-util match must stay good (part-cargo exempt)', () => {
    const out = applyBallastSizeCap(
      capInput({
        distanceNm: 200,
        vesselDwt: 50000,
        cargoWeightMax: 2500,
        cargoDescription: 'steel coils, p/c basis',
      }),
    );
    expect(out.matchLevel).toBe('good');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Numeric edges of applyBallastSizeCap
// ─────────────────────────────────────────────────────────────────────────────
describe('applyBallastSizeCap — numeric edges (lever 3 ballast)', () => {
  it('[BEHAVIOR] off-by-one: distance EXACTLY at handysize cap (1500nm) stays good (strict >)', () => {
    const out = applyBallastSizeCap(capInput({ distanceNm: 1500 }));
    expect(out.matchLevel).toBe('good'); // > maxNm, so 1500 is NOT capped
    const justOver = applyBallastSizeCap(capInput({ distanceNm: 1501 }));
    expect(justOver.matchLevel).toBe('possible');
  });

  it('NaN distance does not trigger the ballast guard', () => {
    const out = applyBallastSizeCap(capInput({ distanceNm: NaN }));
    expect(out.matchLevel).toBe('good');
  });

  it('Infinity distance does not trigger the ballast guard (Number.isFinite guard)', () => {
    const out = applyBallastSizeCap(capInput({ distanceNm: Infinity }));
    expect(out.matchLevel).toBe('good');
  });

  it('negative distance does not trigger the ballast guard', () => {
    const out = applyBallastSizeCap(capInput({ distanceNm: -500 }));
    expect(out.matchLevel).toBe('good');
  });

  it('[FIXED] null DWT skips the ballast guard (conservative on missing data)', () => {
    // Resolves the MEDIUM concern: an unknown-DWT vessel must NOT be demoted on the
    // handysize-default assumption. With no DWT we cannot pick a class radius, so the
    // ballast guard is skipped — honest to "missing data never triggers a cap".
    const out = applyBallastSizeCap(capInput({ distanceNm: 1600, vesselDwt: null }));
    expect(out.matchLevel).toBe('good');
    expect((out.issues ?? []).some((i) => i.startsWith('BALLAST:'))).toBe(false);
  });

  it('[BEHAVIOR] 95000 DWT (kamsarmax/post-panamax) → classified capesize → LOOSEST 4000nm cap', () => {
    // CONCERN: classifyVesselByDwt has a gap 90001..99999 that falls through to capesize.
    // A ~95k DWT vessel gets the 4000nm cap (capesize), so a 3500nm ballast survives as good.
    // Pre-existing classifier behavior, not introduced by this PR — flagged for awareness.
    const out = applyBallastSizeCap(capInput({ distanceNm: 3500, vesselDwt: 95000 }));
    expect(out.matchLevel).toBe('good');
  });
});

describe('applyBallastSizeCap — numeric edges (lever 4 size)', () => {
  it('vesselDwcc present but 0 falls back to DWT', () => {
    // dwcc=0 -> use dwt=10000; cargo 4000/10000 = 40% < 0.5 -> capped.
    const out = applyBallastSizeCap(
      capInput({ distanceNm: 100, vesselDwt: 10000, vesselDwcc: 0, cargoWeightMax: 4000 }),
    );
    expect(out.matchLevel).toBe('possible');
    expect((out.issues ?? []).some((i) => i.startsWith('SIZE:'))).toBe(true);
  });

  it('cargoWeightMax = 0 does not trigger the size guard (guarded by > 0)', () => {
    const out = applyBallastSizeCap(
      capInput({ distanceNm: 100, vesselDwt: 10000, cargoWeightMax: 0 }),
    );
    expect(out.matchLevel).toBe('good');
  });

  it('negative cargoWeightMax does not trigger the size guard', () => {
    const out = applyBallastSizeCap(
      capInput({ distanceNm: 100, vesselDwt: 10000, cargoWeightMax: -500 }),
    );
    expect(out.matchLevel).toBe('good');
  });

  it('negative capacity (dwcc<0, dwt<0) does not trigger the size guard', () => {
    const out = applyBallastSizeCap(
      capInput({ distanceNm: 100, vesselDwt: -1, vesselDwcc: -1, cargoWeightMax: 5000 }),
    );
    expect(out.matchLevel).toBe('good');
  });

  it('util exactly 0.5 stays good; just below caps', () => {
    expect(
      applyBallastSizeCap(capInput({ distanceNm: 100, vesselDwt: 10000, cargoWeightMax: 5000 })).matchLevel,
    ).toBe('good');
    expect(
      applyBallastSizeCap(capInput({ distanceNm: 100, vesselDwt: 10000, cargoWeightMax: 4999 })).matchLevel,
    ).toBe('possible');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Tier / score invariants
// ─────────────────────────────────────────────────────────────────────────────
describe('applyBallastSizeCap — tier & score invariants', () => {
  it('never raises a lower tier — possible match with awful ballast+size stays possible', () => {
    const out = applyBallastSizeCap({
      match: mkMatch(60, 'possible'),
      distanceNm: 9999,
      vesselDwt: 5200,
      vesselDwcc: null,
      cargoWeightMax: 10,
      cargoDescription: null,
    });
    expect(out.matchLevel).toBe('possible');
    expect(out.score).toBe(60);
    expect(out.issues ?? []).toHaveLength(0);
  });

  it('weak match (score 30) is never touched even with both triggers', () => {
    const m = mkMatch(30, 'weak');
    const out = applyBallastSizeCap({
      match: m,
      distanceNm: 9999,
      vesselDwt: 5200,
      vesselDwcc: null,
      cargoWeightMax: 10,
      cargoDescription: null,
    });
    expect(out).toBe(m); // returns the SAME object (early return), no copy, no issue
  });

  it('[BEHAVIOR] inconsistent input: score 65 but matchLevel "good" → guard uses SCORE not level, returns as-is', () => {
    // The cap gate is `match.score < 70`, NOT `matchLevel`. A malformed match with
    // score 65 but level 'good' is returned untouched — it never gets re-derived to 'possible'.
    // In the real pipeline the wiring gates on matchLevel==='good' first, so a 65/'good'
    // mismatch could slip past the wiring filter yet be ignored by the function => no demotion.
    const out = applyBallastSizeCap({
      match: mkMatch(65, 'good'),
      distanceNm: 9999,
      vesselDwt: 5200,
      vesselDwcc: null,
      cargoWeightMax: 10,
      cargoDescription: null,
    });
    expect(out.matchLevel).toBe('good'); // unchanged — score<70 early-return
    expect(out.score).toBe(65);
  });

  it('both ballast AND size trigger → score capped once to 69, BOTH issues present', () => {
    const out = applyBallastSizeCap(
      capInput({
        distanceNm: 5000,
        vesselDwt: 8000,
        cargoWeightMax: 2000, // 25% util
        cargoDescription: 'bulk wheat',
      }),
    );
    expect(out.score).toBe(69);
    expect(out.matchLevel).toBe('possible');
    const issues = out.issues ?? [];
    expect(issues.some((i) => i.startsWith('BALLAST:'))).toBe(true);
    expect(issues.some((i) => i.startsWith('SIZE:'))).toBe(true);
  });

  it('caps to 69 even when original score was barely above threshold (70)', () => {
    const out = applyBallastSizeCap(capInput({ match: mkMatch(70, 'good'), distanceNm: 5000 }));
    expect(out.score).toBe(69);
    expect(out.matchLevel).toBe('possible');
  });

  it('does not mutate the input match or its issues array', () => {
    const issues = ['EXISTING: keep me'];
    const input = mkMatch(81, 'good', issues);
    const out = applyBallastSizeCap({
      match: input,
      distanceNm: 5000,
      vesselDwt: 5200,
      vesselDwcc: null,
      cargoWeightMax: null,
      cargoDescription: null,
    });
    expect(input.score).toBe(81); // input untouched
    expect(input.matchLevel).toBe('good');
    expect(input.issues).toEqual(['EXISTING: keep me']); // original array length unchanged
    expect(out.issues).not.toBe(input.issues); // new array
    expect(out.issues).toContain('EXISTING: keep me'); // preserves prior issues
  });

  it('idempotent — second pass adds no duplicate BALLAST issue', () => {
    const once = applyBallastSizeCap(capInput({ distanceNm: 5000 }));
    const twice = applyBallastSizeCap({
      match: once,
      distanceNm: 5000,
      vesselDwt: 5200,
      vesselDwcc: null,
      cargoWeightMax: null,
      cargoDescription: null,
    });
    expect((twice.issues ?? []).filter((i) => i.startsWith('BALLAST:'))).toHaveLength(1);
  });

  it('[BEHAVIOR] idempotency dedup is by TAG prefix, not full text — a pre-existing BALLAST issue suppresses a new one', () => {
    // existing.some(e => e.startsWith("BALLAST:")) — so ANY prior "BALLAST:" issue
    // blocks the cap from appending its own. The score is STILL lowered. Verify the
    // demotion still happens (score drops) even though the issue text is suppressed.
    const out = applyBallastSizeCap({
      match: mkMatch(81, 'good', ['BALLAST: some unrelated prior note']),
      distanceNm: 5000,
      vesselDwt: 5200,
      vesselDwcc: null,
      cargoWeightMax: null,
      cargoDescription: null,
    });
    expect(out.score).toBe(69); // demotion still applies
    expect(out.matchLevel).toBe('possible');
    expect((out.issues ?? []).filter((i) => i.startsWith('BALLAST:'))).toHaveLength(1); // not duplicated
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Threshold table sanity
// ─────────────────────────────────────────────────────────────────────────────
describe('BALLAST_GOOD_MAX_NM table', () => {
  it('is monotonic increasing by class and handysize=1500', () => {
    expect(BALLAST_GOOD_MAX_NM.handysize).toBe(1500);
    expect(BALLAST_GOOD_MAX_NM.supramax).toBeGreaterThan(BALLAST_GOOD_MAX_NM.handysize);
    expect(BALLAST_GOOD_MAX_NM.panamax).toBeGreaterThan(BALLAST_GOOD_MAX_NM.supramax);
    expect(BALLAST_GOOD_MAX_NM.capesize).toBeGreaterThan(BALLAST_GOOD_MAX_NM.panamax);
  });
});
