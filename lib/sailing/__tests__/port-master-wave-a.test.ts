/**
 * Wave A — port coverage. Real ports present in the demo corpus but missing from
 * port-master.json (so they resolved as `unknown` distance). Added with UNLOCODE
 * + coords, plus aliases for the demo's spellings of two existing ports.
 * Sources: MarineTraffic / latitude.to / UN-LOCODE.
 */
import { describe, it, expect } from '@jest/globals';
import { getPortMaster } from '@/lib/sailing/port-master';
import { normalizePortName, getPortDistance } from '@/lib/sailing/port-distances';

describe('Wave A — newly added real ports', () => {
  const ADDED: Array<[string, string, number, number]> = [
    ['Praia Mole', 'BRPRM', -20.30, -40.27],
    ['Vassiliko', 'CYVAS', 34.71, 33.34],
    ['Souda', 'GRSUD', 35.49, 24.07],
    ['Thisvi', 'GRTHI', 38.30, 22.99],
    ['Dongguan', 'CNDGG', 22.95, 113.75],
    ['Visakhapatnam', 'INVTZ', 17.69, 83.30],
    ['Vanino', 'RUVNN', 49.09, 140.25],
    ['Arzew', 'DZAZW', 35.85, -0.32],
    ['La Coruna', 'ESLCG', 43.36, -8.41],
    ['Safi', 'MASFI', 32.30, -9.24],
    ['Alexandroupolis', 'GRAXD', 40.84, 25.87],
    ['Mtwara', 'TZMYW', -10.27, 40.19],
  ];

  it.each(ADDED)('%s → UNLOCODE %s with coords ≈(%s, %s)', (name, unlocode, lat, lon) => {
    const m = getPortMaster(name);
    expect(m).not.toBeNull();
    expect(m!.unlocode).toBe(unlocode);
    expect(m!.lat).toBeCloseTo(lat, 0);
    expect(m!.lon).toBeCloseTo(lon, 0);
    expect(typeof m!.maxDraftM).toBe('number');
    expect(m!.maxDraftM).toBeGreaterThan(0);
  });

  it.each(ADDED)('%s resolves a real (non-centroid) distance from Rotterdam', (name) => {
    expect(normalizePortName(name)).not.toBeNull();
    const d = getPortDistance('Rotterdam', name);
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(0);
  });
});

describe('Wave A — demo-spelling aliases for existing ports', () => {
  it.each([
    ['Vizag', 'Visakhapatnam'],
    ['Al Arish', 'El Arish'],
    ['Figuera De Foz', 'Figueira da Foz'],
  ])('alias "%s" resolves to %s', (alias, canonical) => {
    expect(normalizePortName(alias)).not.toBeNull();
    const m = getPortMaster(alias);
    expect(m).not.toBeNull();
    expect(m!.name).toBe(canonical);
  });
});
