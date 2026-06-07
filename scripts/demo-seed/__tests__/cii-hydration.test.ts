/**
 * Behavioral tests — hydrateCiiRatings (Task 7, Lane B CII hydration).
 *
 * PI2: calls the real lookupCii against the real cii.json dataset — no mocks of the impl.
 * The jest.mock factory wraps lookupCii to enforce the callLlm guard is passed (offline
 * determinism): any call without opts.callLlm throws, so tests would fail before the fix.
 * Verifies the helper sets ratings by IMO, maps unknown → null, skips pre-set ratings.
 */

// Guard: real lookupCii still runs, but throws if called without the callLlm opt.
// This makes every test in this file a determinism test — without the fix they'd all fail.
jest.mock('@/lib/imo/cii-lookup', () => {
  const actual = jest.requireActual<typeof import('@/lib/imo/cii-lookup')>('@/lib/imo/cii-lookup');
  return {
    ...actual,
    lookupCii: jest.fn((imo: string, opts?: { callLlm?: () => Promise<string> }) => {
      if (!opts?.callLlm) {
        throw new Error(
          `lookupCii("${imo}") called without callLlm guard — would hit network in offline regen`,
        );
      }
      return actual.lookupCii(imo, opts);
    }),
  };
});

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

  it('passes callLlm guard — offline determinism: absent IMO stays null without hitting LLM', async () => {
    // The module mock above throws if lookupCii is called without callLlm —
    // this test would throw before the fix (no guard was passed).
    const vessel = v('0000000');
    await hydrateCiiRatings([vessel]);
    expect(vessel.ciiRating).toBeNull();
  });
});
