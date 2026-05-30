/**
 * Wave A — getPortDistance falls back to a vague-region centroid (approximate,
 * exact:false) when an endpoint is a broad range rather than a real port.
 * Real-port behaviour must be unchanged.
 */
import { describe, it, expect } from '@jest/globals';
import { getPortDistance } from '@/lib/sailing/port-distances';

describe('getPortDistance — vague-region centroid fallback', () => {
  it('returns an approximate distance when one endpoint is a vague range', () => {
    const r = getPortDistance('Rotterdam', 'WC India');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
    expect(r!.nm).toBeGreaterThan(0);
  });

  it('returns approximate distance when BOTH endpoints are vague ranges', () => {
    const r = getPortDistance('Continent', 'US Gulf');
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(false);
    expect(r!.nm).toBeGreaterThan(0);
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
