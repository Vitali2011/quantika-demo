/**
 * Behavioral tests — hydrateCiiRatings (Task 7, Lane B CII hydration).
 *
 * PI2: calls the real lookupCii against the real cii.json dataset — no mocks.
 * Verifies the helper sets ratings by IMO, maps unknown → null, skips pre-set ratings.
 */

import { hydrateCiiRatings } from '../regenerate-matches';
import type { ParsedVessel } from '@/lib/types';

function v(imo: string | null, ciiRating: ParsedVessel['ciiRating'] = null): ParsedVessel {
  return { imo, ciiRating } as unknown as ParsedVessel;
}

describe('hydrateCiiRatings', () => {
  it('sets ciiRating from the static cii.json dataset by IMO', async () => {
    const vessels = [v('9322180'), v('9200648'), v('0000000'), v(null)];
    await hydrateCiiRatings(vessels);
    expect(vessels[0].ciiRating).toBe('D'); // 9322180 → D in cii.json
    expect(vessels[1].ciiRating).toBe('A'); // 9200648 → A
    expect(vessels[2].ciiRating).toBeNull(); // unknown IMO → null (neutral)
    expect(vessels[3].ciiRating).toBeNull(); // no IMO → untouched
  });

  it('does not overwrite an already-present rating', async () => {
    const pre = v('9322180', 'A');
    await hydrateCiiRatings([pre]);
    expect(pre.ciiRating).toBe('A'); // pre-set 'A' stays, not overwritten with 'D'
  });
});
