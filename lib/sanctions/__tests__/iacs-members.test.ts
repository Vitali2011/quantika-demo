import { IACS_MEMBERS, isIacs } from '../iacs-members';

describe('IACS_MEMBERS', () => {
  it('contains exactly 9 members', () => {
    // qa-smoke F5: IRS (Indian Register of Shipping) is an IACS member — was missing
    expect(IACS_MEMBERS).toHaveLength(9);
  });

  it('includes standard abbreviations', () => {
    expect(IACS_MEMBERS).toContain('DNV');
    expect(IACS_MEMBERS).toContain('LR');
    expect(IACS_MEMBERS).toContain('ABS');
    expect(IACS_MEMBERS).toContain('BV');
    expect(IACS_MEMBERS).toContain('NKK');
    expect(IACS_MEMBERS).toContain('KR');
    expect(IACS_MEMBERS).toContain('CCS');
    expect(IACS_MEMBERS).toContain('RINA');
    expect(IACS_MEMBERS).toContain('IRS'); // qa-smoke F5
  });
});

describe('isIacs', () => {
  it('matches exact abbreviations (case-insensitive)', () => {
    expect(isIacs('DNV')).toBe(true);
    expect(isIacs('dnv')).toBe(true);
    expect(isIacs('Lr')).toBe(true);
    expect(isIacs('ABS')).toBe(true);
  });

  it('matches known aliases', () => {
    expect(isIacs("Lloyd's Register")).toBe(true);
    expect(isIacs('Lloyds Register')).toBe(true);
    expect(isIacs('DNV GL')).toBe(true);
    expect(isIacs('Bureau Veritas')).toBe(true);
    expect(isIacs('Nippon Kaiji Kyokai')).toBe(true);
    expect(isIacs('Korean Register')).toBe(true);
    expect(isIacs('China Classification Society')).toBe(true);
    expect(isIacs('Registro Italiano Navale')).toBe(true);
    expect(isIacs('American Bureau of Shipping')).toBe(true);
    expect(isIacs('Indian Register of Shipping')).toBe(true); // qa-smoke F5
    expect(isIacs('IRS')).toBe(true); // qa-smoke F5
  });

  it('returns false for unknown classification societies', () => {
    expect(isIacs('Random Society')).toBe(false);
    expect(isIacs('')).toBe(false);
    expect(isIacs('Unknown')).toBe(false);
  });

  it('returns false for partial matches that are not aliases', () => {
    expect(isIacs('DV')).toBe(false);
    expect(isIacs('NKK Extra')).toBe(false);
  });
});
