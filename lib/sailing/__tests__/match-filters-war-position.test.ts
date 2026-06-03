/**
 * TDD: checkWarPositionVoyage hard-filter gate (issue #784).
 * Rule: block when vessel DWT < 25k AND open position is in JWC HRA zone
 *       AND the laden voyage is intercontinental (≥4 basin hops).
 * Conservative: any null input → pass.
 */

import { checkWarPositionVoyage, runHardFilters } from '../match-filters';

describe('checkWarPositionVoyage', () => {
  it('SEAGULL-12 case: Hodeidah (HRA) + 5328 DWT + Marmara→Veracruz → blocked', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Hodeidah, Yemen',
      dwtSummer: 5328,
      originPort: 'Marmara',
      destinationPort: 'Veracruz',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/war-risk/i);
  });

  it('non-HRA open position → pass (Rotterdam is not HRA)', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Rotterdam',
      dwtSummer: 5000,
      originPort: 'Marmara',
      destinationPort: 'Veracruz',
    });
    expect(r.pass).toBe(true);
  });

  it('large vessel (> threshold) at HRA + intercontinental → pass (not tiny)', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Hodeidah',
      dwtSummer: 40000,
      originPort: 'Marmara',
      destinationPort: 'Veracruz',
    });
    expect(r.pass).toBe(true);
  });

  it('tiny vessel + HRA + short regional voyage → pass (not intercontinental)', () => {
    // Rotterdam → Antwerp is same basin (NorthEurope → NorthEurope)
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Aden, Yemen',
      dwtSummer: 5000,
      originPort: 'Rotterdam',
      destinationPort: 'Hamburg',
    });
    expect(r.pass).toBe(true);
  });

  it('vesselOpenPosition null → conservative pass', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: null,
      dwtSummer: 5000,
      originPort: 'Marmara',
      destinationPort: 'Veracruz',
    });
    expect(r.pass).toBe(true);
  });

  it('dwtSummer null → conservative pass', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Hodeidah',
      dwtSummer: null,
      originPort: 'Marmara',
      destinationPort: 'Veracruz',
    });
    expect(r.pass).toBe(true);
  });

  it('originPort null → conservative pass', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Hodeidah',
      dwtSummer: 5000,
      originPort: null,
      destinationPort: 'Veracruz',
    });
    expect(r.pass).toBe(true);
  });

  it('destinationPort null → conservative pass', () => {
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Hodeidah',
      dwtSummer: 5000,
      originPort: 'Marmara',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });

  it('Red Sea HRA (Djibouti) + tiny + EastMed→Americas → blocked (3 basin hops)', () => {
    // Piraeus (EastMed) → Houston (AtlanticNorth) = EastMed→WestMed→AtlanticNorth = 3 hops
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Djibouti',
      dwtSummer: 8000,
      originPort: 'Piraeus',
      destinationPort: 'Houston',
    });
    expect(r.pass).toBe(false);
  });

  it('Gulf of Guinea HRA (Lagos) + tiny + Med→Americas → blocked (3 basin hops)', () => {
    // Genoa (WestMed) → Houston (AtlanticNorth) = WestMed→AtlanticNorth = 2 hops → NOT blocked
    // Use Piraeus→Houston (EastMed→AtlanticNorth) = 3 hops → blocked
    const r = checkWarPositionVoyage({
      vesselOpenPosition: 'Lagos',
      dwtSummer: 10000,
      originPort: 'Piraeus',
      destinationPort: 'Houston',
    });
    expect(r.pass).toBe(false);
  });
});

describe('runHardFilters — warPositionVoyage wired', () => {
  const BASE = {
    cargoType: 'PROJECT' as const,
    originPort: 'Marmara',
    destinationPort: 'Veracruz',
    weightMt: 1000,
    cargoDescription: 'project cargo',
    stowageFactor: null,
    vesselType: 'mpp',
    geared: true,
    draftMax: 5.0,
    grainCapacity: 8000,
    dwtSummer: 5328,
    dwcc: null,
    vesselRestrictions: [],
  };

  it('#784 vessel: Hodeidah open + 5328 DWT + Marmara→Veracruz → blocked', () => {
    const r = runHardFilters({ ...BASE, vesselOpenPosition: 'Hodeidah, Yemen' });
    expect(r.pass).toBe(false);
    expect(r.checks.warPositionVoyage?.pass).toBe(false);
    expect(r.failures.some((f) => /war-risk/i.test(f))).toBe(true);
  });

  it('same route but large vessel → passes war-position gate', () => {
    const r = runHardFilters({ ...BASE, dwtSummer: 40000, vesselOpenPosition: 'Hodeidah, Yemen' });
    expect(r.checks.warPositionVoyage?.pass).toBe(true);
  });

  it('vesselOpenPosition absent → passes war-position gate (conservative)', () => {
    const r = runHardFilters({ ...BASE });
    expect(r.checks.warPositionVoyage?.pass).toBe(true);
  });
});
