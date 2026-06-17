/**
 * Tests for the Equasis → seed normalisation helpers. These guard that raw
 * Equasis spellings map to the demo's canonical Paris-MoU / IACS-alias keys so
 * vessel-vetting resolves (a wrong spelling silently degrades to 'unknown').
 */
import { canonFlag, canonClass } from '../equasis-backfill';
import { getParisMouClassification } from '../../../lib/sanctions/paris-mou';
import { isIacs } from '../../../lib/sanctions/iacs-members';

describe('canonFlag', () => {
  it('strips register suffixes and fixes spacing to match Paris MoU keys', () => {
    expect(canonFlag('Portugal (MAR)')).toBe('Portugal');
    expect(canonFlag('Palau (Republic of)')).toBe('Palau');
    expect(canonFlag('St.Kitts and Nevis')).toBe('St Kitts and Nevis');
    expect(canonFlag('St Vincent and Grenadines')).toBe('Saint Vincent and the Grenadines');
  });

  it('passes through already-canonical flags and null', () => {
    expect(canonFlag('Panama')).toBe('Panama');
    expect(canonFlag('Comoros')).toBe('Comoros');
    expect(canonFlag(null)).toBeNull();
  });

  it('canonical flags resolve to a real Paris MoU tier (not unknown)', () => {
    expect(getParisMouClassification(canonFlag('Portugal (MAR)')!)).toBe('white');
    expect(getParisMouClassification(canonFlag('St.Kitts and Nevis')!)).toBe('white');
    expect(getParisMouClassification(canonFlag('Palau (Republic of)')!)).toBe('black');
    expect(getParisMouClassification(canonFlag('St Vincent and Grenadines')!)).toBe('grey');
  });
});

describe('canonClass', () => {
  it('strips the trailing recognised-org parenthetical', () => {
    expect(canonClass('Nippon Kaiji Kyokai (IACS)')).toBe('Nippon Kaiji Kyokai');
    expect(canonClass('Korean Register (IACS)')).toBe('Korean Register');
    expect(canonClass('International Register of Shipping (IS)')).toBe('International Register of Shipping');
  });

  it('leaves non-suffixed names and null intact', () => {
    expect(canonClass('Turk Loydu')).toBe('Turk Loydu');
    expect(canonClass('Hellas Naval Bureau')).toBe('Hellas Naval Bureau');
    expect(canonClass(null)).toBeNull();
  });

  it('IACS societies still resolve as IACS after suffix strip', () => {
    expect(isIacs(canonClass('Nippon Kaiji Kyokai (IACS)')!)).toBe(true);
    expect(isIacs(canonClass('Korean Register (IACS)')!)).toBe(true);
    expect(isIacs(canonClass('Registro Italiano Navale (IACS)')!)).toBe(true);
  });
});
