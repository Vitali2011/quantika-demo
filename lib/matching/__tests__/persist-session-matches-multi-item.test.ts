/** Audit C.5 end-to-end: a cargo email with TWO items matching the same vessel
 *  email persists TWO rows with distinct item indices (the old email-pair
 *  dedup + 034 index collapsed them to one). */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { resolveSyntheticCargo, resolveSyntheticVessel } from '@/lib/sample-data/synthetic-economics';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations); // full chain incl. 051-matches-item-unique
  return db;
}

const now = new Date();

// Two cargo ITEMS parsed from the SAME email — distinct descriptions so a
// collapsed row would be visibly wrong, not just missing.
const cargoItem0: ParsedCargo = {
  ...resolveSyntheticCargo(now),
  emailId: 'c-multi',
  itemIndex: 0,
  cargoDescription: { value: 'Grain', confidence: 'confirmed', sourceText: '50,000 mts Grain' },
};
const cargoItem1: ParsedCargo = {
  ...resolveSyntheticCargo(now),
  emailId: 'c-multi',
  itemIndex: 1,
  cargoDescription: { value: 'Steel coils', confidence: 'confirmed', sourceText: '30,000 mts Steel coils' },
};
const vessel: ParsedVessel = {
  ...resolveSyntheticVessel(now),
  emailId: 'v-1',
  itemIndex: 0,
};

// No fitBreakdown on purpose: persist recomputes fitPercent from live TCE when
// a breakdown is present; without it fit_percent persists verbatim, so each
// row's value pins WHICH item it came from.
const matchItem0: Match = {
  cargoEmailId: 'c-multi',
  cargoItemIndex: 0,
  vesselEmailId: 'v-1',
  vesselItemIndex: 0,
  score: 89,
  matchLevel: 'good',
  matchReasons: ['Grain parcel fits 58k DWT'],
  issues: [],
  fitPercent: 80,
};
const matchItem1: Match = {
  cargoEmailId: 'c-multi',
  cargoItemIndex: 1,
  vesselEmailId: 'v-1',
  vesselItemIndex: 0,
  score: 84,
  matchLevel: 'good',
  matchReasons: ['Steel coils parcel fits 58k DWT'],
  issues: [],
  fitPercent: 75,
};

describe('persistSessionMatches — two items of one cargo email persist as two rows (audit C.5)', () => {
  it('persists one row per ITEM pair, each carrying its own fit_percent', () => {
    const db = freshDb();
    persistSessionMatches(
      db,
      'sess-multi',
      [matchItem0, matchItem1],
      [cargoItem0, cargoItem1],
      [vessel],
    );

    const rows = listMatches(db, { user_id: 'sess-multi', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.cargo_item_index).sort()).toEqual([0, 1]);

    const row0 = rows.find((r) => r.cargo_item_index === 0)!;
    const row1 = rows.find((r) => r.cargo_item_index === 1)!;
    expect(row0.fit_percent).toBe(80);
    expect(row1.fit_percent).toBe(75);
  });
});
