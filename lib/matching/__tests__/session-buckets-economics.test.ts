/**
 * Behavioral test — toBucketRows reads canonical engine economics (audit B.3).
 *
 * pair-analyzer attaches m.economics (computeStoredMatchEconomics — live
 * bunker, port-DA, canal) to every pair before bucket partition. Bucket rows
 * must read that one-truth value instead of recomputing a flat-bunker
 * estimate, so bucket tabs agree numerically with the main board.
 */
import { toBucketRows } from '@/lib/matching/session-buckets';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    vesselEmailId: 'v1',
    cargoItemIndex: 0,
    vesselItemIndex: 0,
    score: 50,
    matchLevel: 'possible',
    matchReasons: ['test reason'],
    issues: [],
    ...overrides,
  } as unknown as Match;
}

describe('toBucketRows economics source', () => {
  it('uses canonical engine economics (m.economics) when present', () => {
    const m = makeMatch({
      economics: {
        tceUsdPerDay: 4321,
        freightRateUsdPerMt: 21.5,
        freightRateSource: 'baltic',
      } as Match['economics'],
    });
    // no cargos/vessels supplied → the legacy estimate path CANNOT produce a
    // number (no ports → no distance), so a non-null TCE proves the engine
    // economics short-circuit is in effect.
    const [row] = toBucketRows([m], [], []);
    expect(row.tce_usd_per_day).toBe(4321);
    expect(row.freight_rate_usd_per_mt).toBe(21.5);
    expect(row.freight_rate_source).toBe('baltic');
  });

  it('falls back to null (not a fabricated number) when engine economics and ports are both absent', () => {
    const [row] = toBucketRows([makeMatch()], [], []);
    expect(row.tce_usd_per_day).toBeNull();
    expect(row.freight_rate_usd_per_mt).toBeNull();
    expect(row.freight_rate_source).toBeNull();
  });

  it('estimates TCE via the legacy fallback when engine economics is absent but ports resolve', () => {
    // emailId/itemIndex line up with makeMatch() defaults (c1|0, v1|0) so the
    // cargo/vessel maps inside toBucketRows find these fixtures.
    const cargo = {
      emailId: 'c1',
      itemIndex: 0,
      originPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
      destinationPort: { value: 'Santos', confidence: 'confirmed', source_text: 'Santos' },
      cargoType: { value: 'GRAIN', confidence: 'confirmed', source_text: 'grain' },
      weightMt: { value: 50000, confidence: 'confirmed', source_text: '50000' },
    } as unknown as ParsedCargo;
    const vessel = {
      emailId: 'v1',
      itemIndex: 0,
      dwtSummer: { value: 55000, confidence: 'confirmed', source_text: '55000' },
      speedLaden: '14',
      consumption: '28',
    } as unknown as ParsedVessel;

    // makeMatch() has no economics → the engine-first read yields null and the
    // estimate fallback must fire off the resolvable Rotterdam→Santos leg.
    // No exact dollar assertions — they would couple the test to rate tables.
    const [row] = toBucketRows([makeMatch()], [cargo], [vessel]);
    expect(row.tce_usd_per_day).not.toBeNull();
    expect(row.freight_rate_usd_per_mt).not.toBeNull();
    expect(row.freight_rate_source).toBe('estimated');
  });
});
