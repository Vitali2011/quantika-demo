/**
 * TDD: runHardFilters wired with all new gates (Task 7).
 * Verifies the unified runner collects failures from all gates.
 */

import { runHardFilters } from '../match-filters';

const BASE = {
  cargoType: 'BULK' as const,
  originPort: 'Rotterdam',
  destinationPort: 'Hamburg',
  weightMt: 5000,
  cargoDescription: 'wheat',
  stowageFactor: null,
  vesselType: 'bulk carrier',
  geared: true,
  draftMax: 6.0,
  grainCapacity: 8000,
  dwtSummer: 10000,
  dwcc: null,
  vesselRestrictions: [],
  // new gates
  vesselBuilt: 2010,
  refYear: 2026,
  cargoMaxVesselAgeYrs: null,
  vesselBeam: null,
  vesselLoa: null,
  cargoMaxBeamM: null,
  cargoMaxLoaM: null,
  cargoGearRequired: null,
  vesselFlag: null,
  vesselClassSociety: null,
  cargoFlagRequired: null,
  cargoClassRequired: null,
};

describe('runHardFilters — all gates wired', () => {
  it('all-pass input returns pass=true with no failures', () => {
    const r = runHardFilters(BASE);
    expect(r.pass).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it('age gate: vessel too old → fail included in failures', () => {
    const r = runHardFilters({
      ...BASE,
      vesselBuilt: 1990,
      cargoMaxVesselAgeYrs: 25,
      refYear: 2026,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.vesselAge?.pass).toBe(false);
    expect(r.failures.some((f) => /age/i.test(f))).toBe(true);
  });

  it('beam gate: vessel beam exceeds limit → fail in failures', () => {
    const r = runHardFilters({
      ...BASE,
      vesselBeam: 29,
      cargoMaxBeamM: 16,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.dimensions?.pass).toBe(false);
    expect(r.failures.some((f) => /beam/i.test(f))).toBe(true);
  });

  it('LOA gate: vessel LOA exceeds limit → fail in failures', () => {
    const r = runHardFilters({
      ...BASE,
      vesselLoa: 200,
      cargoMaxLoaM: 145,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.dimensions?.pass).toBe(false);
  });

  it('gear gate: cargo requires geared + gearless + no port cranes → fail', () => {
    const r = runHardFilters({
      ...BASE,
      originPort: 'Skikda',
      destinationPort: null,
      geared: false,
      cargoGearRequired: true,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.gearRequired?.pass).toBe(false);
    expect(r.failures.some((f) => /gear/i.test(f))).toBe(true);
  });

  it('voyage gate: vessel excludes europe + Constanta on route → fail', () => {
    const r = runHardFilters({
      ...BASE,
      vesselRestrictions: ['no european ports for now'],
      destinationPort: 'Constanta',
    });
    expect(r.pass).toBe(false);
    expect(r.checks.voyage?.pass).toBe(false);
    expect(r.failures.some((f) => /europe/i.test(f))).toBe(true);
  });

  it('flag gate: cargo requires HK flag + vessel is Panama → fail', () => {
    const r = runHardFilters({
      ...BASE,
      cargoFlagRequired: 'HK',
      vesselFlag: 'Panama',
    });
    expect(r.pass).toBe(false);
    expect(r.checks.flagClass?.pass).toBe(false);
    expect(r.failures.some((f) => /flag/i.test(f))).toBe(true);
  });

  it('multiple gate failures aggregate correctly', () => {
    const r = runHardFilters({
      ...BASE,
      vesselBuilt: 1990,
      cargoMaxVesselAgeYrs: 25,
      refYear: 2026,
      vesselBeam: 29,
      cargoMaxBeamM: 16,
    });
    expect(r.pass).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(2);
  });

  it('conservative: all restriction fields null → pass', () => {
    const r = runHardFilters({
      ...BASE,
      vesselBuilt: null,
      cargoMaxVesselAgeYrs: null,
      vesselBeam: null,
      cargoMaxBeamM: null,
      vesselLoa: null,
      cargoMaxLoaM: null,
      cargoGearRequired: null,
      vesselFlag: null,
      cargoFlagRequired: null,
    });
    expect(r.pass).toBe(true);
  });
});
