/**
 * test-skill wave-c review — FINDING pin: the "item-aware" bucket React key is
 * a no-op because toBucketRows never populates the item-index columns.
 * Branch: feat/wave-c-engine-logic · HEAD: 13029428
 *
 * MatchesClient.tsx:393 keys bucket <li> rows with
 *   `${cargo_id}|${cargo_item_index ?? 0}|${vessel_id}|${vessel_item_index ?? 0}`
 * claiming (comment in the diff) that two items of the same email pair get
 * distinct keys since audit C.5. But review/insufficient tabs render rows from
 * toBucketRows (lib/matching/session-buckets.ts), which builds StoredMatch rows
 * WITHOUT cargo_item_index / vessel_item_index — both items degrade to `|0|`
 * and collide. C.4 makes this combination common: hold-cleanliness demotes
 * EVERY item of a dirty-hold vessel pair to 'weak', putting all of them into
 * the same review bucket.
 *
 * FLIPPED 2026-06-12 (QA F1 fix): toBucketRows now emits item indices AND
 * MatchesClient keys bucket rows by the unique row id.
 */
import { toBucketRows } from '@/lib/matching/session-buckets';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

const cargo = (itemIndex: number, desc: string): ParsedCargo =>
  ({
    emailId: 'c-multi',
    itemIndex,
    cargoDescription: { value: desc, confidence: 'confirmed' },
    laycan: '2026-10-01 .. 2026-10-11',
    originPort: { value: 'Rotterdam', confidence: 'confirmed' },
  } as unknown as ParsedCargo);

const vessel: ParsedVessel = {
  emailId: 'v-1',
  itemIndex: 0,
  vesselName: { value: 'MV TEST', confidence: 'confirmed' },
  dwtSummer: { value: 55000, confidence: 'confirmed' },
} as unknown as ParsedVessel;

const match = (cargoItemIndex: number): Match =>
  ({
    cargoEmailId: 'c-multi',
    cargoItemIndex,
    vesselEmailId: 'v-1',
    vesselItemIndex: 0,
    score: 50,
    matchLevel: 'weak',
    matchReasons: [`item ${cargoItemIndex}`],
    issues: [],
  } as unknown as Match);

// Exact key expression from app/matches/MatchesClient.tsx:393.
const bucketKey = (r: { cargo_id: string; cargo_item_index?: number | null; vessel_id: string; vessel_item_index?: number | null }) =>
  `${r.cargo_id}|${r.cargo_item_index ?? 0}|${r.vessel_id}|${r.vessel_item_index ?? 0}`;

describe('toBucketRows × MatchesClient bucket key (audit C.5 consumer gap)', () => {
  it('rows carry their item indices — item identity preserved', () => {
    const rows = toBucketRows([match(0), match(1)], [cargo(0, 'Grain'), cargo(1, 'Steel coils')], [vessel]);
    expect(rows).toHaveLength(2);
    expect(rows[0].cargo_item_index).toBe(0);
    expect(rows[1].cargo_item_index).toBe(1);
    expect(rows[0].vessel_item_index).toBe(0);
  });

  it('two items of the same email pair produce DISTINCT keys (and unique row ids)', () => {
    const rows = toBucketRows([match(0), match(1)], [cargo(0, 'Grain'), cargo(1, 'Steel coils')], [vessel]);
    expect(bucketKey(rows[0])).not.toBe(bucketKey(rows[1]));
    // MatchesClient now keys by row id — unique by construction:
    expect(rows[0].id).not.toBe(rows[1].id);
  });
});
