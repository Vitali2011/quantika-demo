/**
 * TDD: parseVoyageExclusions + checkVoyageRestriction.
 * Real corpus strings from restriction audit.
 */

import { parseVoyageExclusions, checkVoyageRestriction } from '../voyage-restriction';

describe('parseVoyageExclusions', () => {
  it('empty array → no exclusions', () => {
    expect(parseVoyageExclusions([])).toEqual([]);
  });

  it('"no european ports for now" → hard exclusion region=europe', () => {
    const result = parseVoyageExclusions(['no european ports for now']);
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('europe');
    expect(result[0].hard).toBe(true);
  });

  it('"not prefer ukraine voyage for just now" → soft exclusion region=ukraine', () => {
    const result = parseVoyageExclusions(['not prefer ukraine voyage for just now']);
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('ukraine');
    expect(result[0].hard).toBe(false);
  });

  it('"ukraine excl" → hard exclusion', () => {
    const result = parseVoyageExclusions(['ukraine excl']);
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('ukraine');
    expect(result[0].hard).toBe(true);
  });

  it('"no ukraine ports" → hard exclusion', () => {
    const result = parseVoyageExclusions(['no ukraine ports']);
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe('ukraine');
    expect(result[0].hard).toBe(true);
  });

  it('"no european voyage" → hard', () => {
    const result = parseVoyageExclusions(['no european voyage']);
    expect(result).toHaveLength(1);
    expect(result[0].hard).toBe(true);
  });

  it('"all africa pg india try" (no exclusion pattern) → empty', () => {
    expect(parseVoyageExclusions(['all africa pg india try'])).toEqual([]);
  });

  it('DG-only restriction → no voyage exclusion parsed', () => {
    expect(parseVoyageExclusions(['no dangerous goods', 'gearless'])).toEqual([]);
  });

  it('mixed: one hard, one soft', () => {
    const result = parseVoyageExclusions([
      'no russia ports',
      'not prefer black sea voyage',
    ]);
    expect(result).toHaveLength(2);
    const hard = result.find((e) => e.hard);
    const soft = result.find((e) => !e.hard);
    expect(hard?.region).toBe('russia');
    expect(soft?.region).toBe('black sea');
  });
});

describe('checkVoyageRestriction', () => {
  it('hard exclusion europe + disch Constanța → block', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: ['no european ports for now'],
      originPort: 'Alexandria',
      destinationPort: 'Constanța',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/europe/i);
  });

  it('soft exclusion ukraine + load Odessa → NOT blocked (soft only)', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: ['not prefer ukraine voyage for just now'],
      originPort: 'Odessa',
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
    expect(r.softExclusions).toBeDefined();
    expect(r.softExclusions!.length).toBeGreaterThan(0);
  });

  it('no restrictions → pass', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: [],
      originPort: 'Odessa',
      destinationPort: 'Constanța',
    });
    expect(r.pass).toBe(true);
  });

  it('exclusion region not on route → pass', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: ['no european ports for now'],
      originPort: 'Singapore',
      destinationPort: 'Shanghai',
    });
    expect(r.pass).toBe(true);
  });

  it('hard exclusion ukraine + disch Odesa → block', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: ['ukraine excl'],
      originPort: 'Alexandria',
      destinationPort: 'Odesa',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/ukraine/i);
  });

  it('DG restriction only (no voyage exclusion) → pass', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: ['no dangerous goods'],
      originPort: 'Odessa',
      destinationPort: 'Constanța',
    });
    expect(r.pass).toBe(true);
  });

  it('conservative: null ports → pass even with hard exclusion', () => {
    const r = checkVoyageRestriction({
      vesselRestrictions: ['no european ports for now'],
      originPort: null,
      destinationPort: null,
    });
    expect(r.pass).toBe(true);
  });
});
