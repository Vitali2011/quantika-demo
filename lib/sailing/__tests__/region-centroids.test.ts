/**
 * Wave A — port coverage. Vague maritime ranges (broker shorthand like
 * "WC India", "Continent", "Aegean") don't resolve to a single port, so the
 * distance engine returns null and pairs show as `unknown`. regionCentroid maps
 * them to a representative point for an APPROXIMATE (exact:false) distance.
 */
import { describe, it, expect } from '@jest/globals';
import { regionCentroid } from '@/lib/sailing/region-centroids';

describe('regionCentroid — demo vague-range coverage', () => {
  // Drawn from the actual unresolved origin/openPosition strings in the demo corpus.
  it.each([
    ['CONTINENT', 'nw-europe'],
    ['Egypt Mediterranean port (unspecified)', 'egypt-med'],
    ['East Mediterranean', 'east-med'],
    // Adjective forms ("Eastern"/"Western") must reach the SAME distinct centroid
    // as the bare "East"/"West" forms — otherwise both fall through to the generic
    // `med` centroid and searoute(med, med) ≈ 0 (broken $0 TCE). (#1074 residual)
    ['Eastern Mediterranean (unspecified)', 'east-med'],
    ['Western Mediterranean (unspecified)', 'west-med'],
    ['1 safe port Spanish Mediterranean', 'spanish-med'],
    ['Agadir or any West Med', 'west-med'],
    ['RED SEA', 'red-sea'],
    ['YEMEN', 'yemen'],
    ['AEGEAN', 'aegean'],
    ['AEGEAN SEA', 'aegean'],
    ['Adriatic', 'adriatic'],
    ['East Coast Italy port (unspecified)', 'east-italy'],
    ['Turkish Black Sea', 'black-sea'],
    ['WEST BLACK SEA', 'black-sea'],
    ['CHINA', 'china'],
    ['North China port (unspecified)', 'north-china'],
    ['S.KOREA', 'korea'],
    ['EC-INDIA', 'ec-india'],
    ['1 safe port East Coast India', 'ec-india'],
    ['West Coast India port (unspecified)', 'wc-india'],
    ['EC GREECE', 'greece'],
    ['1 safe port Sweden', 'sweden'],
    ['North Brazil port (unspecified)', 'north-brazil'],
  ])('resolves "%s" → %s with valid coords', (input, id) => {
    const r = regionCentroid(input);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(id);
    expect(r!.lat).toBeGreaterThanOrEqual(-90);
    expect(r!.lat).toBeLessThanOrEqual(90);
    expect(r!.lon).toBeGreaterThanOrEqual(-180);
    expect(r!.lon).toBeLessThanOrEqual(180);
  });

  it('covers the common ballast ranges used across dry-bulk broking', () => {
    const cases: Array<[string, string]> = [
      ['US Gulf', 'us-gulf'],
      ['Persian Gulf', 'persian-gulf'],
      ['Arabian Gulf (AG)', 'persian-gulf'],
      ['West Africa range', 'west-africa'],
      ['SE Asia', 'se-asia'],
      ['CIS Baltic', 'cis-baltic'],
      ['Santos area', 'santos'],
      ['Recalada / Río de la Plata', 'rio-de-la-plata'],
      ['EC Mexico', 'ec-mexico'],
      ['WC South America', 'wc-south-america'],
      ['marmara', 'marmara'],
      ['USEC', 'us-east-coast'],
      ['Bay of Biscay', 'biscay'],
    ];
    for (const [input, id] of cases) {
      const r = regionCentroid(input);
      expect(r?.id).toBe(id);
    }
  });

  it('returns null for empty / unspecified / garbage input', () => {
    expect(regionCentroid('')).toBeNull();
    expect(regionCentroid(null)).toBeNull();
    expect(regionCentroid(undefined)).toBeNull();
    expect(regionCentroid('TBS (to be specified)')).toBeNull();
    expect(regionCentroid('zzzqqq')).toBeNull();
  });
});
