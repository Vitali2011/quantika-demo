/**
 * Deterministic sweep test.
 *
 * Verifies that pairs which pass all hard filters but are NOT returned by the
 * LLM are captured by the sweep and added as weak matches with real deterministic
 * data (readiness, hardFilters, sanctions, scoreBreakdown).
 *
 * The sweep logic is extracted here as a pure function that mirrors what
 * route.ts does after receiving rawMatches from the LLM.
 */

import type {
  Match,
  MatchReadiness,
  MatchHardFilters,
  MatchSanctions,
} from '@/lib/types';

// ── Minimal PairAnalysis shape (mirrors route.ts internal interface) ──────────

interface PairAnalysis {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  readiness: MatchReadiness;
  hardFilters: MatchHardFilters;
  sanctions: MatchSanctions;
  dateIssues: string[];
  filterOut: boolean;
  filterReason?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pairKey(
  cargoEmailId: string,
  cargoItemIndex: number,
  vesselEmailId: string,
  vesselItemIndex: number,
): string {
  return `${cargoEmailId}|${cargoItemIndex}|${vesselEmailId}|${vesselItemIndex}`;
}

const DEFAULT_READINESS: MatchReadiness = {
  openDate: '2026-05-10',
  laycanStart: '2026-05-15',
  laycanEnd: '2026-05-25',
  distanceNm: 1200,
  distanceExact: false,
  speedKn: 12,
  sailingDays: 4.2,
  arrivalDate: '2026-05-14',
  gapDays: 1,
  verdict: 'tight',
  explanation: 'Vessel arrives 1d before laycan start',
};

const DEFAULT_HARD_FILTERS: MatchHardFilters = {
  draft: { pass: true },
  crane: { pass: true },
  volume: { pass: true },
  cargoVessel: { pass: true },
};

const DEFAULT_SANCTIONS: MatchSanctions = {
  risk: 'NONE',
  blocking: false,
};

function makeAnalysis(
  cargoEmailId: string,
  cargoItemIndex: number,
  vesselEmailId: string,
  vesselItemIndex: number,
  overrides: Partial<PairAnalysis> = {},
): PairAnalysis {
  return {
    cargoEmailId,
    cargoItemIndex,
    vesselEmailId,
    vesselItemIndex,
    readiness: DEFAULT_READINESS,
    hardFilters: DEFAULT_HARD_FILTERS,
    sanctions: DEFAULT_SANCTIONS,
    dateIssues: [],
    filterOut: false,
    ...overrides,
  };
}

// ── Pure sweep function (mirrors route.ts sweep logic) ────────────────────────
//
// This is intentionally a copy of the core sweep algorithm so the test is
// self-contained and does not depend on Next.js route infrastructure.

function runDeterministicSweep(
  analyses: PairAnalysis[],
  rawMatches: Match[],
): Match[] {
  const filteredOutKeys = new Set(
    analyses
      .filter(a => a.filterOut)
      .map(a => pairKey(a.cargoEmailId, a.cargoItemIndex, a.vesselEmailId, a.vesselItemIndex)),
  );

  const matchedKeys = new Set(
    rawMatches.map(m =>
      pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
    ),
  );

  const sweepMatches: Match[] = [];

  for (const analysis of analyses) {
    const key = pairKey(
      analysis.cargoEmailId,
      analysis.cargoItemIndex,
      analysis.vesselEmailId,
      analysis.vesselItemIndex,
    );

    if (matchedKeys.has(key) || filteredOutKeys.has(key)) continue;

    const issues: string[] = [
      'Not selected by AI for detailed evaluation — review manually',
      ...analysis.dateIssues,
      ...(analysis.sanctions.risk === 'MEDIUM' && analysis.sanctions.reason
        ? [`Sanctions: ${analysis.sanctions.reason}`]
        : []),
    ];

    sweepMatches.push({
      cargoEmailId: analysis.cargoEmailId,
      cargoItemIndex: analysis.cargoItemIndex,
      vesselEmailId: analysis.vesselEmailId,
      vesselItemIndex: analysis.vesselItemIndex,
      score: 25,
      matchLevel: 'weak',
      matchReasons: [
        'Physically feasible pair — passed all hard filters but was not evaluated by AI',
      ],
      issues,
      readiness: analysis.readiness,
      hardFilters: analysis.hardFilters,
      dateIssues: analysis.dateIssues,
      sanctions: analysis.sanctions,
    });
  }

  return sweepMatches;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

// 5 pairs: C1-V1, C1-V2, C1-V3, C2-V1, C2-V2
const analyses: PairAnalysis[] = [
  makeAnalysis('c-001', 0, 'v-001', 0),
  makeAnalysis('c-001', 0, 'v-002', 0),
  makeAnalysis('c-001', 0, 'v-003', 0),
  makeAnalysis('c-002', 0, 'v-001', 0),
  makeAnalysis('c-002', 0, 'v-002', 0),
];

// LLM returned only 3 matches (C1-V1, C1-V2, C2-V1)
const rawMatches: Match[] = [
  {
    cargoEmailId: 'c-001', cargoItemIndex: 0, vesselEmailId: 'v-001', vesselItemIndex: 0,
    score: 75, matchLevel: 'good', matchReasons: ['Good DWT fit'], issues: [],
  },
  {
    cargoEmailId: 'c-001', cargoItemIndex: 0, vesselEmailId: 'v-002', vesselItemIndex: 0,
    score: 60, matchLevel: 'possible', matchReasons: ['Acceptable route'], issues: [],
  },
  {
    cargoEmailId: 'c-002', cargoItemIndex: 0, vesselEmailId: 'v-001', vesselItemIndex: 0,
    score: 55, matchLevel: 'possible', matchReasons: ['Feasible'], issues: [],
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deterministic sweep — fills LLM gaps', () => {
  it('adds exactly 2 missing pairs (C1-V3 and C2-V2)', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    expect(sweep).toHaveLength(2);
  });

  it('total matches after merge = 5 (3 LLM + 2 sweep)', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    const all = [...rawMatches, ...sweep];
    expect(all).toHaveLength(5);
  });

  it('sweep matches have correct cargoEmailId and vesselEmailId', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    const keys = sweep.map(m => pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex));
    expect(keys).toContain('c-001|0|v-003|0');
    expect(keys).toContain('c-002|0|v-002|0');
  });

  it('sweep matches are labelled weak with score 25', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    for (const m of sweep) {
      expect(m.matchLevel).toBe('weak');
      expect(m.score).toBe(25);
    }
  });

  it('sweep match carries real readiness from analysis', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    for (const m of sweep) {
      expect(m.readiness).toBeDefined();
      expect(m.readiness?.verdict).toBe('tight');
      expect(m.readiness?.gapDays).toBe(1);
    }
  });

  it('sweep match carries real hardFilters from analysis (all pass)', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    for (const m of sweep) {
      expect(m.hardFilters?.draft.pass).toBe(true);
      expect(m.hardFilters?.crane.pass).toBe(true);
      expect(m.hardFilters?.volume.pass).toBe(true);
      expect(m.hardFilters?.cargoVessel.pass).toBe(true);
    }
  });

  it('sweep match carries real sanctions from analysis (NONE, non-blocking)', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    for (const m of sweep) {
      expect(m.sanctions?.risk).toBe('NONE');
      expect(m.sanctions?.blocking).toBe(false);
    }
  });

  it('sweep match has the standard "not evaluated by AI" issue text', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    for (const m of sweep) {
      expect(m.issues[0]).toMatch(/Not selected by AI/);
    }
  });

  it('sweep match has the standard matchReasons placeholder', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    for (const m of sweep) {
      expect(m.matchReasons[0]).toMatch(/Physically feasible pair/);
    }
  });

  it('does not sweep blocked pairs (filterOut=true)', () => {
    const analysesWithBlocked = [
      ...analyses,
      // Blocked pair — must NOT appear in sweep
      makeAnalysis('c-001', 0, 'v-099', 0, { filterOut: true, filterReason: 'draft too deep' }),
    ];

    const sweep = runDeterministicSweep(analysesWithBlocked, rawMatches);
    const keys = sweep.map(m => pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex));
    expect(keys).not.toContain('c-001|0|v-099|0');
    // Still gets the 2 missing non-blocked pairs
    expect(sweep).toHaveLength(2);
  });

  it('does not re-add pairs already in LLM output', () => {
    const sweep = runDeterministicSweep(analyses, rawMatches);
    const sweepKeys = new Set(sweep.map(m => pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)));
    // LLM pairs must not appear in sweep
    expect(sweepKeys.has('c-001|0|v-001|0')).toBe(false);
    expect(sweepKeys.has('c-001|0|v-002|0')).toBe(false);
    expect(sweepKeys.has('c-002|0|v-001|0')).toBe(false);
  });

  it('MEDIUM sanctions warning is included in sweep match issues', () => {
    const analysesWithSanctions = [
      makeAnalysis('c-003', 0, 'v-005', 0, {
        sanctions: { risk: 'MEDIUM', reason: 'Vessel flag Belarus — OFAC watch list', blocking: false },
      }),
    ];

    const sweep = runDeterministicSweep(analysesWithSanctions, []);
    expect(sweep).toHaveLength(1);
    expect(sweep[0].issues.some(i => i.includes('Sanctions:'))).toBe(true);
  });

  it('date issues from analysis appear in sweep match issues', () => {
    const analysesWithDateIssues = [
      makeAnalysis('c-004', 0, 'v-006', 0, {
        dateIssues: ['Open position is 7 days old — may be stale'],
      }),
    ];

    const sweep = runDeterministicSweep(analysesWithDateIssues, []);
    expect(sweep).toHaveLength(1);
    expect(sweep[0].issues).toContain('Open position is 7 days old — may be stale');
  });

  it('sweep is empty when LLM already returned all allowed pairs', () => {
    const allReturned: Match[] = analyses.map(a => ({
      cargoEmailId: a.cargoEmailId,
      cargoItemIndex: a.cargoItemIndex,
      vesselEmailId: a.vesselEmailId,
      vesselItemIndex: a.vesselItemIndex,
      score: 50,
      matchLevel: 'possible' as const,
      matchReasons: [],
      issues: [],
    }));

    const sweep = runDeterministicSweep(analyses, allReturned);
    expect(sweep).toHaveLength(0);
  });
});
