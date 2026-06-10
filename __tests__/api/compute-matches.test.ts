/**
 * Unit tests for lib/matching/compute-matches.ts
 *
 * Class 5 (repository + business logic). Mocks the LLM boundary (callAiJson)
 * and the pair-analyzer to keep tests fast and deterministic.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import { listMatches, createMatch } from '@/lib/matching/matches-repository';

// Mock the LLM boundary and pair-analyzer so tests don't hit real AI APIs.
jest.mock('@/lib/ai-provider', () => ({ callAiJson: jest.fn() }));
jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: jest.fn().mockResolvedValue({ matches: [], blockedMatches: [] }),
}));
jest.mock('@/lib/market/bunker-repository', () => ({
  getLatestBunkerPrice: jest.fn().mockReturnValue(null),
}));

const { analyzePairs } = require('@/lib/matching/pair-analyzer') as {
  analyzePairs: jest.Mock;
};
const { getLatestBunkerPrice } = require('@/lib/market/bunker-repository') as {
  getLatestBunkerPrice: jest.Mock;
};

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  return db;
}

describe('computeAndPersistMatches', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    analyzePairs.mockResolvedValue({ matches: [], blockedMatches: [] });
  });

  afterEach(() => db.close());

  it('returns 0 and skips compute when cargos is empty', async () => {
    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    const count = await computeAndPersistMatches([], [{ emailId: 'v1', itemIndex: 0 } as never], 'sess-1', db);
    expect(count).toBe(0);
    expect(analyzePairs).not.toHaveBeenCalled();
  });

  it('returns 0 and skips compute when vessels is empty', async () => {
    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    const count = await computeAndPersistMatches([{ emailId: 'c1', itemIndex: 0 } as never], [], 'sess-1', db);
    expect(count).toBe(0);
    expect(analyzePairs).not.toHaveBeenCalled();
  });

  it('returns 0 without calling AI when matches already exist for the session (idempotency)', async () => {
    // Pre-seed a match in DB so idempotency guard fires
    createMatch(db, {
      cargo_id: 'cargo-existing',
      vessel_id: 'vessel-existing',
      score: 80,
      reason: 'pre-existing match',
      status: 'shortlist',
      user_id: 'sess-idempotent',
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    const count = await computeAndPersistMatches(
      [{ emailId: 'c1', itemIndex: 0 } as never],
      [{ emailId: 'v1', itemIndex: 0 } as never],
      'sess-idempotent',
      db,
    );
    expect(count).toBe(0);
    expect(analyzePairs).not.toHaveBeenCalled();
  });

  it('persists AI-scored matches to DB and returns correct count', async () => {
    analyzePairs.mockResolvedValueOnce({
      matches: [
        {
          cargoEmailId: 'cargo-abc',
          cargoItemIndex: 0,
          vesselEmailId: 'vessel-xyz',
          vesselItemIndex: 0,
          score: 78,
          matchLevel: 'good',
          matchReasons: ['Compatible cargo type'],
          issues: [],
          scoreBreakdown: null,
        },
        {
          cargoEmailId: 'cargo-abc',
          cargoItemIndex: 0,
          vesselEmailId: 'vessel-qqq',
          vesselItemIndex: 0,
          score: 55,
          matchLevel: 'possible',
          matchReasons: ['Possible fit'],
          issues: [],
          scoreBreakdown: null,
        },
      ],
      blockedMatches: [],
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    const count = await computeAndPersistMatches(
      [{ emailId: 'cargo-abc', itemIndex: 0 } as never],
      [{ emailId: 'vessel-xyz', itemIndex: 0 } as never],
      'sess-new',
      db,
    );

    expect(count).toBe(2);
    const stored = listMatches(db, { user_id: 'sess-new', sortBy: 'score', sortDir: 'desc' });
    expect(stored).toHaveLength(2);
    expect(stored[0].score).toBe(78);
    expect(stored[0].cargo_id).toBe('cargo-abc');
    expect(stored[0].vessel_id).toBe('vessel-xyz');
    expect(stored[0].status).toBe('shortlist');
    expect(stored[0].user_id).toBe('sess-new');
  });

  it('is idempotent on second call — INSERT OR IGNORE deduplicates, count returns 0', async () => {
    analyzePairs.mockResolvedValue({
      matches: [
        {
          cargoEmailId: 'cargo-dup',
          cargoItemIndex: 0,
          vesselEmailId: 'vessel-dup',
          vesselItemIndex: 0,
          score: 60,
          matchLevel: 'possible',
          matchReasons: ['Dup test'],
          issues: [],
          scoreBreakdown: null,
        },
      ],
      blockedMatches: [],
    });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');

    // First call persists
    const first = await computeAndPersistMatches(
      [{ emailId: 'cargo-dup', itemIndex: 0 } as never],
      [{ emailId: 'vessel-dup', itemIndex: 0 } as never],
      'sess-dup',
      db,
    );
    expect(first).toBe(1);

    // Second call hits idempotency guard — DB already has a match for this session
    const second = await computeAndPersistMatches(
      [{ emailId: 'cargo-dup', itemIndex: 0 } as never],
      [{ emailId: 'vessel-dup', itemIndex: 0 } as never],
      'sess-dup',
      db,
    );
    expect(second).toBe(0);

    // Only one row in DB
    const stored = listMatches(db, { user_id: 'sess-dup', sortBy: 'score', sortDir: 'desc' });
    expect(stored).toHaveLength(1);
  });

  it('H3: passes live bunker price to analyzePairs for board-demote floor check', async () => {
    // Arrange: DB has a live bunker price of 791 (NLRTM/VLSFO)
    getLatestBunkerPrice.mockReturnValueOnce({ price_usd_per_mt: 791 });
    analyzePairs.mockResolvedValueOnce({ matches: [], blockedMatches: [] });

    const { computeAndPersistMatches } = await import('@/lib/matching/compute-matches');
    await computeAndPersistMatches(
      [{ emailId: 'cargo-b', itemIndex: 0 } as never],
      [{ emailId: 'vessel-b', itemIndex: 0 } as never],
      'sess-bunker',
      db,
    );

    // analyzePairs must receive live bunker price so the board-demote floor
    // check judges pairs at $791, not the hardcoded $600 default.
    expect(analyzePairs).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ bunkerPriceUsdPerMt: 791 }),
    );
  });
});
