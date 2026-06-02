/**
 * Integration gate tests (Task 8).
 * Reproduces real cases from the restriction audit:
 * (a) vessel "no european ports" + cargo disch Constanța → blocked
 * (b) cargo "max 25 years" + vessel built 1996 → blocked
 * (c) cargo "max beam 16m" + vessel beam 29m → blocked
 * (d) bulk-minerals + gearless + bulk terminal → still passes (no false knockout)
 * (e) SEAGULL-72 Odessa case (soft ukraine) → not hard-blocked, soft-flagged
 * All run via runHardFilters.
 */

import { runHardFilters } from '../match-filters';

const YEAR = 2026;

describe('Integration: reviewed violations blocked', () => {
  it('(a) vessel "no european ports" + disch Constanța → hard-blocked', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Alexandria',
      destinationPort: 'Constanta',
      weightMt: 25000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 8.0,
      grainCapacity: 35000,
      dwtSummer: 30000,
      dwcc: null,
      vesselRestrictions: ['no european ports for now'],
      refYear: YEAR,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.voyage?.pass).toBe(false);
  });

  it('(b) cargo "max 25 years" + vessel built 1996 (age 30) → hard-blocked', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Rotterdam',
      weightMt: 25000,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 8.0,
      grainCapacity: 35000,
      dwtSummer: 30000,
      dwcc: null,
      vesselRestrictions: [],
      vesselBuilt: 1996,
      cargoMaxVesselAgeYrs: 25,
      refYear: YEAR,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.vesselAge?.pass).toBe(false);
  });

  it('(c) cargo "max beam 16m" + vessel beam 29m → hard-blocked', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Rotterdam',
      weightMt: 5000,
      cargoDescription: 'wheat',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 8.0,
      grainCapacity: 9000,
      dwtSummer: 8000,
      dwcc: null,
      vesselRestrictions: [],
      vesselBeam: 29,
      cargoMaxBeamM: 16,
    });
    expect(r.pass).toBe(false);
    expect(r.checks.dimensions?.pass).toBe(false);
  });

  it('(d) bulk minerals + gearless + bulk terminal (Mykolaiv) → passes (no false knockout)', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Mykolaiv',
      destinationPort: 'Rotterdam',
      weightMt: 25000,
      cargoDescription: 'iron ore',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: false,           // gearless
      draftMax: 8.0,
      grainCapacity: 35000,
      dwtSummer: 30000,
      dwcc: null,
      vesselRestrictions: [],
      cargoGearRequired: null, // no gear req → no false knockout
    });
    expect(r.pass).toBe(true);
    expect(r.checks.gearRequired?.pass).toBe(true);
  });

  it('(e) SEAGULL-72 Odessa soft-ukraine → NOT hard-blocked', () => {
    const r = runHardFilters({
      cargoType: 'BULK',
      originPort: 'Odesa',
      destinationPort: 'Rotterdam',
      weightMt: 25000,
      cargoDescription: 'grain',
      stowageFactor: null,
      vesselType: 'bulk carrier',
      geared: true,
      draftMax: 8.0,
      grainCapacity: 35000,
      dwtSummer: 30000,
      dwcc: null,
      vesselRestrictions: ['not prefer ukraine voyage for just now'],
    });
    // Soft restriction → should NOT hard-block
    expect(r.pass).toBe(true);
    expect(r.checks.voyage?.pass).toBe(true);
  });
});
