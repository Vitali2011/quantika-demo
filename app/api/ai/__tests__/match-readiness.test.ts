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

  it('idle verdict: -15 score + issue added with day count', () => {
    const m = applyReadinessScoring(baseMatch({ score: 75 }), readinessOf('idle', 9));
    expect(m.score).toBe(60);
    expect(m.matchLevel).toBe('possible');
    expect(m.issues).toHaveLength(1);
    expect(m.issues[0]).toMatch(/idle/i);
    expect(m.issues[0]).toMatch(/9/);
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
