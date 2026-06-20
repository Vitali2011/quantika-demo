/**
 * audit-1 #4 / A6 — canal-aware centroid fallback.
 *
 * `centroidFallbackDistance` resolves vague broker ranges ("Egypt Mediterranean",
 * "North China", "Continent") to region centroids. Previously it joined the two
 * centroids with a pure haversine great-circle — a straight line THROUGH LAND
 * (Sahara, Asian landmass) that systematically under-reports the real ballast
 * distance and corrupts TCE for those routes.
 *
 * Fix (Option A): try the SAME Tier-3 searoute path used by real-port distances
 * (canal/strait-aware) FIRST, marking the result exact:false because the
 * endpoints are approximate regions; fall through to the EXISTING haversine
 * safety net only when searoute returns null or throws.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getPortDistance,
  _setLiveSearouteForTest,
} from '@/lib/sailing/port-distances';
import { isVagueRegion } from '@/lib/sailing/vague-region-detector';

afterEach(() => _setLiveSearouteForTest(null));

describe('centroid fallback routes via canal-aware searoute, not straight-line', () => {
  it('Egypt-Med → Douala detours around West Africa (>4000 nm, not ~1992 haversine)', () => {
    expect(isVagueRegion('Egypt Mediterranean').vague).toBe(false); // precondition: centroid fires
    const r = getPortDistance('Egypt Mediterranean', 'Douala');
    expect(r).not.toBeNull();
    // Haversine cuts straight through the Sahara (~1989 nm). The real sea route
    // exits the Med at Gibraltar and rounds West Africa — must be far longer.
    expect(r!.nm).toBeGreaterThan(4000);
    expect(r!.exact).toBe(false); // endpoints are approximate regions
  });

  it('Med → Far-East centroid route reflects the Suez/Indian-Ocean detour, not a chord', () => {
    expect(isVagueRegion('Egypt Mediterranean').vague).toBe(false);
    expect(isVagueRegion('North China').vague).toBe(false);
    const r = getPortDistance('Egypt Mediterranean', 'North China');
    expect(r).not.toBeNull();
    // Haversine straight-lines across Asia (~4335 nm). Real route is Suez → Indian
    // Ocean → Malacca → Bohai, much longer.
    expect(r!.nm).toBeGreaterThan(7000);
    expect(r!.exact).toBe(false);
  });

  it('falls back to haversine when searoute THROWS (safety net preserved)', () => {
    _setLiveSearouteForTest(() => {
      throw new Error('searoute boom');
    });
    const r = getPortDistance('Egypt Mediterranean', 'Douala');
    expect(r).not.toBeNull();
    // Throw → fall through to the haversine great-circle (~1989 nm), still exact:false.
    expect(r!.nm).toBeLessThan(2100);
    expect(r!.nm).toBeGreaterThan(1800);
    expect(r!.exact).toBe(false);
  });

  it('falls back to haversine when searoute returns NULL (unroutable)', () => {
    _setLiveSearouteForTest(() => null);
    const r = getPortDistance('Egypt Mediterranean', 'Douala');
    expect(r).not.toBeNull();
    expect(r!.nm).toBeLessThan(2100);
    expect(r!.nm).toBeGreaterThan(1800);
    expect(r!.exact).toBe(false);
  });
});
