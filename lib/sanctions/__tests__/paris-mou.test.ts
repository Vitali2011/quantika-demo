import { getParisMouClassification } from '../paris-mou';

describe('getParisMouClassification', () => {
  it('returns white for well-known white list flags', () => {
    expect(getParisMouClassification('Bahamas')).toBe('white');
    expect(getParisMouClassification('Marshall Islands')).toBe('white');
    expect(getParisMouClassification('Cyprus')).toBe('white');
    expect(getParisMouClassification('Malta')).toBe('white');
    expect(getParisMouClassification('Norway')).toBe('white');
    expect(getParisMouClassification('Greece')).toBe('white');
    expect(getParisMouClassification('Panama')).toBe('white');
  });

  it('returns grey for grey list flags', () => {
    expect(getParisMouClassification('Togo')).toBe('grey');
    expect(getParisMouClassification('Tanzania')).toBe('grey');
  });

  it('returns black for high-risk flags', () => {
    expect(getParisMouClassification('Comoros')).toBe('black');
    expect(getParisMouClassification('Palau')).toBe('black');
  });

  it('returns unknown for unrecognized flags', () => {
    expect(getParisMouClassification('Nonexistentland')).toBe('unknown');
    expect(getParisMouClassification('')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(getParisMouClassification('bahamas')).toBe('white');
    expect(getParisMouClassification('MALTA')).toBe('white');
    expect(getParisMouClassification('comoros')).toBe('black');
  });
});
