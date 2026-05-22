/**
 * Adversarial tests for compute-matches invariants.
 * Cold QA — designed to BREAK, not confirm. Three adversarial scenarios:
 *
 * 1. Race condition: concurrent calls both pass the guard → LLM fired twice
 * 2. isComputing false positive: only cargo OR only vessel present → wrongly shows "Computing"
 * 3. Score boundary clamping: negative / >100 scores persisted correctly
 *
 * PI2-compliant: all tests call real SQLite in-memory DB + mock LLM boundary only.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import { listMatches } from '@/lib/matching/matches-repository';

jest.mock('@/lib/ai-provider', () => ({ callAiJson: jest.fn() }));
jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: jest.fn().mockResolvedValue({ matches: [], blockedMatches: [] }),
}));

const { analyzePairs } = require('@/lib/matching/pair-analyzer') as {
  analyzePairs: jest.Mock;
};

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  return db;
}

function makeMatch(cargoId: string, vesselId: string, score = 75) {
  return {
    cargoEmailId: cargoId,
    cargoItemIndex: 0,
    vesselEmailId: vesselId,
    vesselItemIndex: 0,
    score,
    matchLevel: 'good' as const,
    matchReasons: ['test'],
    issues: [],
    scoreBreakdown: null,
  };
}

describe('computeAndPersistMatches — adversarial', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    analyzePairs.mockResolvedValue({ matches: [], blockedMatches: [] });
  });

  afterEach(() => db.close());

  // ------------------------------------------------------------------ //
  // Adversarial #1: Race condition — concurrent calls both pass guard   //
  // ------------------------------------------------------------------ //
  it('RACE: concurrent calls do not produce duplicate DB rows (INSERT OR IGNORE holds)', async () => {
    let callCount = 0;

    analyzePairs.mockImplementation(async () => {
      callCount++;
      // Simulate async delay so the second concurrent call can also pass the
      // listMatches guard before the first call inserts anything.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        matches: [makeMatch('cargo-race', 'vessel-race', 80)],
        blockedMatches: [],
      };
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');

    await Promise.all([
      computeAndPersistMatches(
        [{ emailId: 'cargo-race', itemIndex: 0 } as never],
        [{ emailId: 'vessel-race', itemIndex: 0 } as never],
        'sess-race',
        db,
      ),
      computeAndPersistMatches(
        [{ emailId: 'cargo-race', itemIndex: 0 } as never],
        [{ emailId: 'vessel-race', itemIndex: 0 } as never],
        'sess-race',
        db,
      ),
    ]);

    // DB integrity: unique index prevents duplicates regardless of race.
    const stored = listMatches(db, { user_id: 'sess-race', sortBy: 'score', sortDir: 'desc' });
    expect(stored).toHaveLength(1);
  });

  // NOTE: the following assertion exposes a known race condition —
  // the guard is not atomic, so both concurrent calls fire the LLM.
  // Kept as a separate, clearly-named test so the bug is visible.
  it('RACE BUG: concurrent calls fire LLM twice (guard is not atomic — known limitation)', async () => {
    let callCount = 0;

    analyzePairs.mockImplementation(async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        matches: [makeMatch('cargo-race2', 'vessel-race2', 70)],
        blockedMatches: [],
      };
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');

    await Promise.all([
      computeAndPersistMatches(
        [{ emailId: 'cargo-race2', itemIndex: 0 } as never],
        [{ emailId: 'vessel-race2', itemIndex: 0 } as never],
        'sess-race2',
        db,
      ),
      computeAndPersistMatches(
        [{ emailId: 'cargo-race2', itemIndex: 0 } as never],
        [{ emailId: 'vessel-race2', itemIndex: 0 } as never],
        'sess-race2',
        db,
      ),
    ]);

    // This documents the race: both concurrent calls passed the guard and called LLM.
    // DB still has 1 row (INSERT OR IGNORE), but the LLM was wasted once.
    // If this becomes 1, the race has been fixed (e.g. with a DB-level advisory lock).
    expect(callCount).toBe(2);
  });

  // ------------------------------------------------------------------ //
  // Adversarial #2: isComputing false positive in page.tsx              //
  // ------------------------------------------------------------------ //
  describe('isComputing logic (replicates app/matches/page.tsx)', () => {
    // Exact logic from page.tsx line 46-47:
    function computeIsComputing(
      parsedCargos: unknown[],
      parsedVessels: unknown[],
      matches: unknown[],
    ): boolean {
      const hasInventory = parsedCargos.length > 0 || parsedVessels.length > 0;
      return hasInventory && matches.length === 0;
    }

    // The background compute only fires when BOTH cargos AND vessels are non-empty
    // (see parse-cargo/route.ts and parse-vessel/route.ts conditions).
    // If hasInventory uses OR but trigger uses AND, isComputing can be true when
    // matches will NEVER be computed — misleading the user indefinitely.

    it('only cargo, no vessels: isComputing=false (compute will never fire)', () => {
      // This FAILS with current impl (hasInventory uses OR → isComputing=true)
      const result = computeIsComputing([{ emailId: 'c1' }], [], []);
      expect(result).toBe(false);
    });

    it('only vessels, no cargo: isComputing=false (compute will never fire)', () => {
      // This FAILS with current impl (hasInventory uses OR → isComputing=true)
      const result = computeIsComputing([], [{ emailId: 'v1' }], []);
      expect(result).toBe(false);
    });

    it('both cargo AND vessels, no matches: isComputing=true (compute will fire)', () => {
      const result = computeIsComputing([{ emailId: 'c1' }], [{ emailId: 'v1' }], []);
      expect(result).toBe(true);
    });

    it('both cargo AND vessels, matches present: isComputing=false (done)', () => {
      const result = computeIsComputing([{ emailId: 'c1' }], [{ emailId: 'v1' }], [{ id: 1 }]);
      expect(result).toBe(false);
    });

    it('no cargo, no vessels, no matches: isComputing=false (nothing to compute)', () => {
      const result = computeIsComputing([], [], []);
      expect(result).toBe(false);
    });
  });

  // ------------------------------------------------------------------ //
  // Adversarial #3: Score boundary clamping                             //
  // ------------------------------------------------------------------ //
  it('score < 0 is clamped to 0 before persist', async () => {
    analyzePairs.mockResolvedValueOnce({
      matches: [makeMatch('cargo-neg', 'vessel-neg', -50)],
      blockedMatches: [],
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    await computeAndPersistMatches(
      [{ emailId: 'cargo-neg', itemIndex: 0 } as never],
      [{ emailId: 'vessel-neg', itemIndex: 0 } as never],
      'sess-neg',
      db,
    );

    const stored = listMatches(db, { user_id: 'sess-neg', sortBy: 'score', sortDir: 'desc' });
    expect(stored).toHaveLength(1);
    expect(stored[0].score).toBe(0);
  });

  it('score > 100 is clamped to 100 before persist', async () => {
    analyzePairs.mockResolvedValueOnce({
      matches: [makeMatch('cargo-hi', 'vessel-hi', 999)],
      blockedMatches: [],
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    await computeAndPersistMatches(
      [{ emailId: 'cargo-hi', itemIndex: 0 } as never],
      [{ emailId: 'vessel-hi', itemIndex: 0 } as never],
      'sess-hi',
      db,
    );

    const stored = listMatches(db, { user_id: 'sess-hi', sortBy: 'score', sortDir: 'desc' });
    expect(stored).toHaveLength(1);
    expect(stored[0].score).toBe(100);
  });

  it('fractional score is rounded (not truncated) before persist', async () => {
    analyzePairs.mockResolvedValueOnce({
      matches: [makeMatch('cargo-frac', 'vessel-frac', 72.9)],
      blockedMatches: [],
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    await computeAndPersistMatches(
      [{ emailId: 'cargo-frac', itemIndex: 0 } as never],
      [{ emailId: 'vessel-frac', itemIndex: 0 } as never],
      'sess-frac',
      db,
    );

    const stored = listMatches(db, { user_id: 'sess-frac', sortBy: 'score', sortDir: 'desc' });
    expect(stored).toHaveLength(1);
    expect(stored[0].score).toBe(73);
  });

  // ------------------------------------------------------------------ //
  // Adversarial #4: Different sessions do not cross-contaminate guard   //
  // ------------------------------------------------------------------ //
  it('matches for session A do not block compute for session B', async () => {
    analyzePairs.mockResolvedValue({
      matches: [makeMatch('cargo-x', 'vessel-x', 60)],
      blockedMatches: [],
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');

    // Session A computes
    const countA = await computeAndPersistMatches(
      [{ emailId: 'cargo-x', itemIndex: 0 } as never],
      [{ emailId: 'vessel-x', itemIndex: 0 } as never],
      'sess-A',
      db,
    );
    expect(countA).toBe(1);

    // Session B must NOT be blocked by Session A's matches
    const countB = await computeAndPersistMatches(
      [{ emailId: 'cargo-x', itemIndex: 0 } as never],
      [{ emailId: 'vessel-x', itemIndex: 0 } as never],
      'sess-B',
      db,
    );
    expect(countB).toBe(1);

    // Both sessions have their own row
    const rowsA = listMatches(db, { user_id: 'sess-A', sortBy: 'score', sortDir: 'desc' });
    const rowsB = listMatches(db, { user_id: 'sess-B', sortBy: 'score', sortDir: 'desc' });
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
  });
});
