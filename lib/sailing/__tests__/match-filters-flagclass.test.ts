/**
 * TDD: checkFlagClass hard-filter gate.
 * Rule: block when cargoFlagRequired != null && vesselFlag != null
 *       && normalize(vesselFlag) !== normalize(cargoFlagRequired).
 * Conservative on null.
 */

import { checkFlagClass } from '../match-filters';

describe('checkFlagClass — flag', () => {
  it('blocks when cargo requires HK flag but vessel is Panama', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: 'Panama', cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/flag/i);
    expect(r.reason).toContain('Panama');
    expect(r.reason).toContain('HK');
  });

  it('passes when vessel flag matches requirement (HK vs HK)', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: 'HK', cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });

  it('passes when vessel flag matches requirement (case insensitive: hk vs HK)', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: 'hk', cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });

  it('passes when vessel flag matches requirement with whitespace (\"Hong Kong\" → normalized)', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: '  HK  ', cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: cargoFlagRequired null → pass', () => {
    const r = checkFlagClass({ cargoFlagRequired: null, vesselFlag: 'Panama', cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: vesselFlag null → pass (cannot verify)', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: null, cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: both null → pass', () => {
    const r = checkFlagClass({ cargoFlagRequired: null, vesselFlag: null, cargoClassRequired: null, vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });
});

describe('checkFlagClass — class society', () => {
  it('blocks when cargo requires CCS class but vessel is BV', () => {
    const r = checkFlagClass({ cargoFlagRequired: null, vesselFlag: null, cargoClassRequired: 'CCS', vesselClassSociety: 'BV' });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/class/i);
  });

  it('passes when class matches (CCS vs CCS)', () => {
    const r = checkFlagClass({ cargoFlagRequired: null, vesselFlag: null, cargoClassRequired: 'CCS', vesselClassSociety: 'CCS' });
    expect(r.pass).toBe(true);
  });

  it('conservative: vesselClassSociety null → pass (unknown class — cannot verify)', () => {
    const r = checkFlagClass({ cargoFlagRequired: null, vesselFlag: null, cargoClassRequired: 'CCS', vesselClassSociety: null });
    expect(r.pass).toBe(true);
  });

  it('conservative: cargoClassRequired null → pass', () => {
    const r = checkFlagClass({ cargoFlagRequired: null, vesselFlag: null, cargoClassRequired: null, vesselClassSociety: 'BV' });
    expect(r.pass).toBe(true);
  });
});

describe('checkFlagClass — combined flag+class', () => {
  it('blocks on flag mismatch, even when class matches', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: 'Panama', cargoClassRequired: 'CCS', vesselClassSociety: 'CCS' });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/flag/i);
  });

  it('passes when both flag and class match', () => {
    const r = checkFlagClass({ cargoFlagRequired: 'HK', vesselFlag: 'HK', cargoClassRequired: 'CCS', vesselClassSociety: 'CCS' });
    expect(r.pass).toBe(true);
  });
});
