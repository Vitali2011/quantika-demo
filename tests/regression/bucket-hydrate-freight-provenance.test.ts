/**
 * test-skill ATTACK-4 (displayed-value-provenance / half-landed producer, audit B.3).
 * Branch: claude/compassionate-jennings-cb6e62 · HEAD: dded0315
 *
 * B.3 switched toBucketRows to an economics-first read. The plan modeled
 * m.economics as the full engine triple (tce + freightRate + freightSource) —
 * but the demo hydrate producer (lib/demo-mode/hydrate-demo-session.ts
 * rowsToMatches, OUT of this diff) builds economics with ONLY tceUsdPerDay;
 * its SQL does not even SELECT the freight columns from the seed.
 *
 * Result on HEAD for hydrated demo bucket rows with resolvable ports:
 *   tce_usd_per_day        = seed/canonical value   (improvement)
 *   freight_rate_usd_per_mt = NULL                  (pre-B.3: estimate value)
 *   freight_rate_source     = NULL                  (pre-B.3: 'estimated')
 * MatchesClient renders freightBadge(null) → "≈ Estimate", dimmed — same badge
 * tone as before, but now attached to a canonical TCE, and the row's rate that
 * regen DID resolve (possibly baltic) is dropped on the floor by the producer.
 *
 * These tests PIN the introduced row shape (mixed provenance) so the follow-up
 * (teach hydrate to carry freight fields, or fall back to the estimate triple
 * when economics is partial) has a red/green anchor.
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

// Ports that resolve a distance (same fixture as the campaign's own
// session-buckets-economics test, which proves the estimate path CAN fire
// for these fixtures when economics is absent).
const CARGO = {
  emailId: 'c1', itemIndex: 0,
  originPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
  destinationPort: { value: 'Santos', confidence: 'confirmed', source_text: 'Santos' },
  cargoType: { value: 'GRAIN', confidence: 'confirmed', source_text: 'grain' },
  weightMt: { value: 50000, confidence: 'confirmed', source_text: '50000' },
} as unknown as ParsedCargo;
const VESSEL = {
  emailId: 'v1', itemIndex: 0,
  dwtSummer: { value: 55000, confidence: 'confirmed', source_text: '55000' },
  speedLaden: '14',
  consumption: '28',
} as unknown as ParsedVessel;

describe('toBucketRows with the HYDRATE-shaped partial economics object (tce only)', () => {
  // What hydrate-demo-session.ts rowsToMatches actually produces: economics
  // exists, carries tceUsdPerDay, has NO freightRateUsdPerMt/freightRateSource.
  const hydrated = makeMatch({
    economics: {
      breakdown: {
        bunkerCost: 0, bunkerPort: '', euEtsAmount: 0, euEtsApplicable: false,
        warRiskPremium: 0, warRiskZones: [],
      },
      totalUsd: 0,
      calculatedAt: new Date(0).toISOString(),
      dataFreshness: { bunker: 'seed', eua: 'seed' },
      tceUsdPerDay: 7777,
    } as unknown as Match['economics'],
  });

  it('keeps the canonical seed TCE (engine-first read works)', () => {
    const [row] = toBucketRows([hydrated], [CARGO], [VESSEL]);
    expect(row.tce_usd_per_day).toBe(7777);
  });

  it('PINS the introduced mixed-provenance shape: freight fields are NULL even though ports resolve (pre-B.3 they carried the estimate triple)', () => {
    const [row] = toBucketRows([hydrated], [CARGO], [VESSEL]);
    // Documented HEAD behavior (MEDIUM finding in .test-review/findings.md):
    // canonical TCE + null rate + null source → freightBadge(null) renders
    // "≈ Estimate" (dimmed) over a canonical number, and the seed-resolved
    // rate is lost. If a follow-up teaches the hydrate producer to carry
    // freight fields (or adds a partial-economics fallback here), flip these
    // expectations to non-null.
    expect(row.freight_rate_usd_per_mt).toBeNull();
    expect(row.freight_rate_source).toBeNull();
  });

  it('control: estimate fallback still fires when economics is fully absent', () => {
    const [row] = toBucketRows([makeMatch()], [CARGO], [VESSEL]);
    expect(row.tce_usd_per_day).not.toBeNull();
    expect(row.freight_rate_source).toBe('estimated');
  });
});
