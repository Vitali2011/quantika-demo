/**
 * checkVolume — CBM-only cargo volumetric fit (cold-QA MEDIUM follow-up, Group B phase-2).
 *
 * ROOT: a CBM-only cargo (weight absent, volumeCbm present) whose recovered net
 * volume EXCEEDS the vessel grain capacity used to show a green "OK" on the
 * Volume row, because checkVolume returned {pass:true} the moment effectiveWeight
 * was null and never looked at volumeCbm. scoreVolume (fit-breakdown) already
 * scored the CBM/grain ratio (#1021); checkVolume was the lone reader that did not.
 *
 * FIX (honesty, NOT exclusion — phase-2 mandate): when weight is absent but
 * volumeCbm is present and grain capacity is known, compare the two. Overflow
 * beyond the 5% "abt" tolerance → a WARNING verdict (pass stays true, so the
 * match is NOT hard-excluded) so the Volume row shows ⚠️ instead of a green OK.
 * Cargo that fits stays a clean pass; cargo with no volume data stays neutral.
 *
 * Behavioral: drives the REAL checkVolume, asserts the FilterResult shape.
 */
import { checkVolume } from '@/lib/sailing/match-filters';

describe('checkVolume — CBM-only cargo (weight absent, volumeCbm present)', () => {
  it('WARNS (not green OK) when recovered volumeCbm overflows grain capacity beyond tolerance', () => {
    // 15,000 cbm cargo vs a 13,000 m³ hold → ~115% → overflow past the 5% margin.
    const r = checkVolume({
      weightMt: null,
      grainCapacity: 13000,
      cargoDescription: 'steel pipes',
      stowageFactor: null,
      volumeCbm: 15000,
    });
    // NOT a hard gate — match stays in the list, but the verdict is honest.
    expect(r.pass).toBe(true);
    expect(r.warning).toBe(true);
    expect(r.reason).toMatch(/15000|15,000/);
    expect(r.reason).toMatch(/grain capacity|13000|13,000/i);
  });

  it('passes cleanly (no warning) when volumeCbm is within grain capacity', () => {
    // 12,000 cbm vs 13,000 m³ hold → ~92% → fits.
    const r = checkVolume({
      weightMt: null,
      grainCapacity: 13000,
      cargoDescription: 'steel pipes',
      stowageFactor: null,
      volumeCbm: 12000,
    });
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it('tolerates a ≤5% "abt" overflow (does not warn just over capacity)', () => {
    // 13,500 cbm vs 13,000 m³ → ~104% → within the 5% abt tolerance → clean.
    const r = checkVolume({
      weightMt: null,
      grainCapacity: 13000,
      cargoDescription: null,
      stowageFactor: null,
      volumeCbm: 13500,
    });
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it('stays neutral (clean pass, no warning) when there is no volume data at all', () => {
    const r = checkVolume({
      weightMt: null,
      grainCapacity: 13000,
      cargoDescription: null,
      stowageFactor: null,
      volumeCbm: null,
    });
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it('stays neutral when volumeCbm is present but grain capacity is unknown', () => {
    const r = checkVolume({
      weightMt: null,
      grainCapacity: null,
      cargoDescription: null,
      stowageFactor: null,
      volumeCbm: 15000,
    });
    expect(r.pass).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it('weight path is unchanged when weight IS present (volumeCbm ignored)', () => {
    // 6000 mt grain × 1.35 ≈ 8100 m³ vs 6247 hold → overflow → hard fail (pass:false).
    const r = checkVolume({
      weightMt: 6000,
      grainCapacity: 6247,
      cargoDescription: 'grain',
      stowageFactor: null,
      volumeCbm: 100, // small CBM must NOT rescue a weight-derived overflow
    });
    expect(r.pass).toBe(false);
  });
});
