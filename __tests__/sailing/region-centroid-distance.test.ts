/**
 * Wave A — getPortDistance centroid fallback, scoped to honour the shipped core.
 *
 * The matching core (PR #694) DELIBERATELY classifies detector-vague positions
 * (sea basins, bare countries, coast ranges — "Red Sea", "Persian Gulf",
 * "WC India") as `unknown` + a -20 penalty + an actionable broker hint
 * (evals SC-10..15, match-scoring, readiness-gap Phase C2). Wave A must NOT
 * fabricate a distance for those — it would silently flip that UX. So the
 * centroid fallback fires ONLY for broker shorthand the detector does NOT flag
 * (e.g. "Continent"). Real ports always resolve via the direct path first.
 */
import { describe, it, expect } from '@jest/globals';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { isVagueRegion } from '@/lib/sailing/vague-region-detector';

describe('getPortDistance — centroid fallback (non-detector-vague only)', () => {
  it('resolves an approximate distance for non-vague broker shorthand ("Continent")', () => {
    expect(isVagueRegion('Continent').vague).toBe(false); // precondition: not core-vague
    const r = getPortDistance('Continent', 'Singapore');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false); // centroid → great-circle → approximate
    expect(r!.nm).toBeGreaterThan(0);
  });

  it('returns NULL for a detector-vague endpoint, preserving the core unknown+hint UX', () => {
    expect(isVagueRegion('Red Sea').vague).toBe(true);
    expect(getPortDistance('Red Sea', 'Mykolaiv')).toBeNull();
    expect(isVagueRegion('Persian Gulf').vague).toBe(true);
    expect(getPortDistance('Persian Gulf', 'Mykolaiv')).toBeNull();
  });

  it('still returns null for genuinely unresolvable junk', () => {
    expect(getPortDistance('zzzqqq', 'wwwvvv')).toBeNull();
  });

  it('does not downgrade a real curated pair to approximate', () => {
    const r = getPortDistance('Rotterdam', 'Singapore');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(true);
  });
});
