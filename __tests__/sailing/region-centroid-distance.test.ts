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

  it('gives a REAL approximate distance for Eastern↔Western Med, not a broken ~0', () => {
    // Both endpoints are non-vague broker shorthand, so the centroid path fires.
    // Before the fix the adjective forms collapsed to the generic `med` centroid
    // on BOTH sides → searoute(med, med) ≈ 0 → falsely-precise $0 TCE. (#1074 residual)
    expect(isVagueRegion('Eastern Mediterranean (unspecified)').vague).toBe(false);
    expect(isVagueRegion('Western Mediterranean (unspecified)').vague).toBe(false);
    const r = getPortDistance('Eastern Mediterranean (unspecified)', 'Western Mediterranean (unspecified)');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false); // approximate — endpoints are regions
    expect(r!.nm).toBeGreaterThan(500); // East↔West Med is ~1000nm, never ~0
  });

  it('returns NULL (not a broken ~0) when two centroids resolve to ~the same point', () => {
    // "Continent" and "NW Europe" are both non-vague shorthand for the SAME region
    // (neither resolves to a real port) → identical nw-europe centroid → searoute
    // ≈ 0. An intra-region ~0 is a meaningless, falsely-precise distance, so the
    // pair must report unknown rather than a broken $0.
    expect(isVagueRegion('Continent').vague).toBe(false);
    expect(isVagueRegion('NW Europe').vague).toBe(false);
    expect(getPortDistance('Continent', 'NW Europe')).toBeNull();
  });
});
