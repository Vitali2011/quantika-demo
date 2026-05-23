import { applyReadinessScoring } from '@/lib/sailing/match-scoring';
import type { Match, MatchReadiness } from '@/lib/types';

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score: 60,
    matchLevel: 'possible',
    matchReasons: ['Timing roughly aligns'],
    issues: [],
    ...overrides,
  };
}

function readinessOf(verdict: MatchReadiness['verdict'], gapDays: number | null = 2): MatchReadiness {
  return {
    openDate: '2025-09-05',
    laycanStart: '2025-09-15',
    laycanEnd: '2025-09-25',
    distanceNm: 315,
    speedKn: 12.5,
    sailingDays: 1.05,
    arrivalDate: '2025-09-06',
    gapDays,
    verdict,
    explanation: `stub ${verdict}`,
  };
}

describe('applyReadinessScoring', () => {
  it('ideal verdict: +10 score, no issues added', () => {
    const m = applyReadinessScoring(baseMatch({ score: 65 }), readinessOf('ideal', 2));
    expect(m.score).toBe(75);
    expect(m.matchLevel).toBe('good');
    expect(m.issues).toHaveLength(0);
    expect(m.readiness?.verdict).toBe('ideal');
  });

  it('idle verdict: -15 score + issue added with day count (short idle ≤14d)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 75 }), readinessOf('idle', 9));
    expect(m.score).toBe(60);
    expect(m.matchLevel).toBe('possible');
    expect(m.issues).toHaveLength(1);
    expect(m.issues[0]).toMatch(/idle/i);
    expect(m.issues[0]).toMatch(/9/);
  });

  it('idle verdict: extended (>14d) → -25 penalty, issue notes extended severity', () => {
    const m = applyReadinessScoring(baseMatch({ score: 75 }), readinessOf('idle', 20));
    expect(m.score).toBe(50);
    expect(m.matchLevel).toBe('possible');
    expect(m.issues).toHaveLength(1);
    expect(m.issues[0]).toMatch(/idle/i);
    expect(m.issues[0]).toMatch(/extended/i);
  });

  it('idle verdict: severe (>30d) → -35 penalty, W1-style 60d idle drops to weak tier', () => {
    // Phase B finding: a "possible" match (score 70) with 60-day idle must land in 'weak'.
    const m = applyReadinessScoring(baseMatch({ score: 70 }), readinessOf('idle', 60));
    expect(m.score).toBe(35);
    expect(m.matchLevel).toBe('weak');
    expect(m.issues).toHaveLength(1);
    expect(m.issues[0]).toMatch(/idle/i);
    expect(m.issues[0]).toMatch(/severe/i);
  });

  it('late verdict: -30 score + issue', () => {
    const m = applyReadinessScoring(baseMatch({ score: 80 }), readinessOf('late', -11));
    expect(m.score).toBe(50);
    expect(m.matchLevel).toBe('possible');
    expect(m.issues[0]).toMatch(/after laycan|misses/i);
  });

  it('tight verdict: no change', () => {
    const m = applyReadinessScoring(baseMatch({ score: 70 }), readinessOf('tight', 0));
    expect(m.score).toBe(70);
    expect(m.issues).toHaveLength(0);
  });

  it('unknown verdict: no change, readiness still attached', () => {
    const m = applyReadinessScoring(baseMatch({ score: 65 }), readinessOf('unknown', null));
    expect(m.score).toBe(65);
    expect(m.readiness?.verdict).toBe('unknown');
  });

  it('no readiness: match is returned unchanged (no readiness attached)', () => {
    const base = baseMatch({ score: 55 });
    const m = applyReadinessScoring(base, undefined);
    expect(m).toEqual(base);
    expect(m.readiness).toBeUndefined();
  });

  it('score cannot exceed 100 after ideal bonus', () => {
    const m = applyReadinessScoring(baseMatch({ score: 95 }), readinessOf('ideal', 2));
    expect(m.score).toBe(100);
  });

  it('score cannot drop below 0 after idle/late penalties', () => {
    const m = applyReadinessScoring(baseMatch({ score: 10 }), readinessOf('late', -11));
    expect(m.score).toBe(0);
  });

  it('matchLevel recomputed: score 75 → good, 45 → possible, 30 → weak', () => {
    expect(applyReadinessScoring(baseMatch({ score: 65 }), readinessOf('ideal', 2)).matchLevel).toBe('good');
    expect(applyReadinessScoring(baseMatch({ score: 60 }), readinessOf('idle', 8)).matchLevel).toBe('possible');
    expect(applyReadinessScoring(baseMatch({ score: 40 }), readinessOf('idle', 8)).matchLevel).toBe('weak');
  });
});

// MED-01: boundary alignment — applyReadinessScoring must use deriveMatchLevel thresholds (>=, not >)
describe('applyReadinessScoring boundary alignment with deriveMatchLevel', () => {
  // These boundary tests pin the CORRECT behavior after the MED-01 fix.
  // Before the fix, the inline formula used > 70 and > 40 (exclusive),
  // while deriveMatchLevel uses >= 70 and >= 40 (inclusive).

  it('score exactly 70 + tight: matchLevel must be good (>= threshold)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 70 }), readinessOf('tight', 0));
    expect(m.score).toBe(70);
    expect(m.matchLevel).toBe('good');
  });

  it('score exactly 40 + tight: matchLevel must be possible (>= threshold)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 40 }), readinessOf('tight', 0));
    expect(m.score).toBe(40);
    expect(m.matchLevel).toBe('possible');
  });

  it('score 30 + ideal (+10 = 40): matchLevel must be possible (>= 40)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 30 }), readinessOf('ideal', 2));
    expect(m.score).toBe(40);
    expect(m.matchLevel).toBe('possible');
  });

  it('score 60 + ideal (+10 = 70): matchLevel must be good (>= 70)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 60 }), readinessOf('ideal', 2));
    expect(m.score).toBe(70);
    expect(m.matchLevel).toBe('good');
  });

  it('score 69 + tight: matchLevel must be possible (below 70)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 69 }), readinessOf('tight', 0));
    expect(m.score).toBe(69);
    expect(m.matchLevel).toBe('possible');
  });

  it('score 39 + tight: matchLevel must be weak (below 40)', () => {
    const m = applyReadinessScoring(baseMatch({ score: 39 }), readinessOf('tight', 0));
    expect(m.score).toBe(39);
    expect(m.matchLevel).toBe('weak');
  });

  it('matchLevel from applyReadinessScoring matches deriveMatchLevel at score boundaries', () => {
    const { deriveMatchLevel } = require('@/lib/sailing/match-scoring');
    const verdicts = ['tight', 'unknown'] as const;
    const boundaryScores = [0, 39, 40, 41, 69, 70, 71, 100];
    for (const verdict of verdicts) {
      for (const score of boundaryScores) {
        const m = applyReadinessScoring(baseMatch({ score }), readinessOf(verdict, 0));
        expect(m.matchLevel).toBe(deriveMatchLevel(score));
      }
    }
  });
});
