/**
 * Regression tests for abbrPort() — #516
 *
 * Root cause: abbr() split on [\s,/-]+ but not "(", so "(Ukraine)" became a
 * single token whose first char "(" propagated into the display code.
 * Fix: strip parenthetical qualifiers before abbreviating.
 */
import { abbrPort } from '../abbr-port';

describe('abbrPort — parenthetical stripping (regression #516)', () => {
  // These inputs caused malformed codes before the fix (first char of "(Ukraine)" = "(")
  it('"Odessa (Ukraine)" → "ODES" not "O("', () => {
    expect(abbrPort('Odessa (Ukraine)')).toBe('ODES');
  });

  it('"Iskenderun (Turkey)" → "ISKE" not "I("', () => {
    expect(abbrPort('Iskenderun (Turkey)')).toBe('ISKE');
  });

  it('"Novorossiysk (Russia)" → "NOVO" not "N("', () => {
    expect(abbrPort('Novorossiysk (Russia)')).toBe('NOVO');
  });

  it('"Eastern Mediterranean (Turkey)" → "EM" not "EM("', () => {
    // strip parenthetical qualifier → "Eastern Mediterranean" → 2-word initials
    const result = abbrPort('Eastern Mediterranean (Turkey)');
    expect(result).not.toContain('(');
    expect(result).toBe('EM');
  });

  it('"1 safe port Continental (US Gulf)" → no "(" in result', () => {
    const result = abbrPort('1 safe port Continental (US Gulf)');
    expect(result).not.toContain('(');
  });

  it('"Gulf (US Gulf)" → no "(" in result', () => {
    const result = abbrPort('Gulf (US Gulf)');
    expect(result).not.toContain('(');
  });

  it('"Marmara (Sea)" → no "(" in result', () => {
    expect(abbrPort('Marmara (Sea)')).not.toContain('(');
  });
});

describe('abbrPort — baseline behavior preserved', () => {
  it('short all-caps code passes through unchanged (UNLOCODE fast-path)', () => {
    expect(abbrPort('NLRTM')).toBe('NLRTM');
    expect(abbrPort('CNSHA')).toBe('CNSHA');
  });

  it('single-word name → first 4 chars uppercase', () => {
    expect(abbrPort('Iskenderun')).toBe('ISKE');
    expect(abbrPort('Rotterdam')).toBe('ROTT');
  });

  it('multi-word name → initials up to 4', () => {
    expect(abbrPort('Black Sea')).toBe('BS');
    expect(abbrPort('New Orleans')).toBe('NO');
    expect(abbrPort('Port Said Egypt')).toBe('PSE');
  });

  it('empty string → empty string', () => {
    expect(abbrPort('')).toBe('');
  });

  it('already abbreviated (≤5 all-caps) → unchanged', () => {
    expect(abbrPort('BEANR')).toBe('BEANR');
    expect(abbrPort('USG')).toBe('USG');
  });
});
