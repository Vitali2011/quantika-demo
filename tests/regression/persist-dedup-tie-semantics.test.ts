/**
 * REWRITTEN 2026-06-12: founder decision (audit C.5) — uniqueness is per item
 * pair; the 044-era one-per-email-pair semantics this test pinned are retired.
 *
 * Originally test-skill ATTACK-2 (merger precedence, commit c2e2c1a2): pinned
 * the array-first tie choice of the persist dedup. Since migration 051 the
 * dedup key is the ITEM pair (cargoEmailId|cargoItemIndex|vesselEmailId|
 * vesselItemIndex), so different items of the same email pair are NOT
 * duplicates anymore — both persist. The tie pins below now exercise
 * duplicates of the SAME item pair, where the contract is unchanged:
 *   1. equal fitPercent, different score — array-first wins; dedup ignores
 *      score entirely (regen's own dedup breaks ties by score; this one
 *      does not).
 *   2. fitPercent undefined on both — both sort as 0; array order decides.
 * Legacy INSERT OR IGNORE kept the array-first row the same way, so the tie
 * choice remains PRE-EXISTING semantics, pinned for visibility.
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import migration045 from '@/lib/migrations/045-matches-worksheet';
import migration046 from '@/lib/migrations/046-matches-consumption-estimated';
import migration047 from '@/lib/migrations/047-matches-ballast-distance';
import migration050 from '@/lib/migrations/050-matches-breakeven';
import migration051 from '@/lib/migrations/051-matches-item-unique';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  migration044.up(db);
  migration045.up(db);
  migration046.up(db);
  migration047.up(db);
  migration050.up(db);
  migration051.up(db);
  return db;
}

const CARGO0 = {
  emailId: 'cargo-dup', itemIndex: 0,
  originPort: { value: 'UAODS', confidence: 'confirmed' },
  destinationPort: { value: 'NLRTM', confidence: 'confirmed' },
  weightMt: { value: 5000, confidence: 'confirmed' },
  cargoType: 'GRAIN', freightRateUsd: null, missingInfo: [],
} as unknown as ParsedCargo;
const CARGO1 = { ...CARGO0, itemIndex: 1, weightMt: { value: 3000, confidence: 'confirmed' } } as unknown as ParsedCargo;
const VESSEL = {
  emailId: 'vessel-dup', itemIndex: 0,
  dwtSummer: { value: 28000, confidence: 'confirmed' },
  speedLaden: '12 kn', consumption: '22 mt/day',
  restrictions: [], specialFeatures: [],
} as unknown as ParsedVessel;

function m(overrides: Partial<Match>): Match {
  return {
    cargoEmailId: 'cargo-dup',
    cargoItemIndex: 0,
    vesselEmailId: 'vessel-dup',
    vesselItemIndex: 0,
    score: 50,
    matchLevel: 'possible',
    matchReasons: ['m'],
    issues: [],
    ...overrides,
  } as unknown as Match;
}

describe('persistSessionMatches dedup — item-aware key, ties stay array-first (audit C.5)', () => {
  it('different item indices of the same email pair are NOT duplicates — both persist', () => {
    const db = makeDb();
    const item0 = m({ cargoItemIndex: 0, score: 40, fitPercent: 60, matchReasons: ['item0'] });
    const item1 = m({ cargoItemIndex: 1, score: 90, fitPercent: 60, matchReasons: ['item1'] });
    persistSessionMatches(db, 'sess-1', [item0, item1], [CARGO0, CARGO1], [VESSEL]);
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cargo_item_index).sort()).toEqual([0, 1]);
  });

  it('equal fitPercent, SAME item pair: array-first wins even when the second has the higher score', () => {
    const db = makeDb();
    const first = m({ score: 40, fitPercent: 60, matchReasons: ['first'] });
    const second = m({ score: 90, fitPercent: 60, matchReasons: ['second'] });
    persistSessionMatches(db, 'sess-1', [first, second], [CARGO0, CARGO1], [VESSEL]);
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    // Current contract: first in array wins the tie (same as legacy INSERT OR
    // IGNORE). NOT score-aware — if this assertion ever flips, the dedup
    // gained (or lost) a tiebreaker; update the comment in
    // persist-session-matches.ts accordingly.
    expect(rows[0].reason).toBe('first');
    expect(rows[0].score).toBe(40);
  });

  it('undefined fitPercent on both duplicates of the SAME item pair: array-first wins', () => {
    const db = makeDb();
    const first = m({ score: 30, matchReasons: ['first-nofit'] });
    const second = m({ score: 80, matchReasons: ['second-nofit'] });
    persistSessionMatches(db, 'sess-1', [first, second], [CARGO0, CARGO1], [VESSEL]);
    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('first-nofit');
  });
});
