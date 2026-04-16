import { validateImo, extractImo } from '../imo';

describe('validateImo', () => {
  // Real IMO numbers (public data, known-valid checksums)
  it.each([
    '9074729', // bulk carrier
    '9704611',
    '9241061', // Queen Mary 2
    '9321483', // Emma Maersk
    '9811000', // Ever Given
  ])('valid: %s', (imo) => {
    const r = validateImo(imo);
    expect(r.valid).toBe(true);
  });

  it('valid with "IMO" prefix', () => {
    expect(validateImo('IMO 9074729').valid).toBe(true);
    expect(validateImo('IMO9074729').valid).toBe(true);
    expect(validateImo('imo: 9074729').valid).toBe(true);
  });

  it('invalid: wrong checksum', () => {
    const r = validateImo('9074720'); // bad last digit
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/checksum/i);
  });

  it('invalid: wrong length', () => {
    expect(validateImo('12345').valid).toBe(false);
    expect(validateImo('123456789').valid).toBe(false);
  });

  it('invalid: non-numeric', () => {
    expect(validateImo('abcdefg').valid).toBe(false);
    expect(validateImo('').valid).toBe(false);
    expect(validateImo(null).valid).toBe(false);
  });

  it('invalid: starts with 0 (official IMOs start at 5000000+)', () => {
    const r = validateImo('0000001');
    expect(r.valid).toBe(false);
  });
});

describe('extractImo', () => {
  it('extracts IMO from vessel description text', () => {
    expect(extractImo('MV ALERIA IMO 9074729 DWT 5200')).toBe('9074729');
    expect(extractImo('imo: 9704611')).toBe('9704611');
    expect(extractImo('IMO9241061, Flag Bermuda')).toBe('9241061');
  });

  it('returns null if no IMO in text', () => {
    expect(extractImo('MV ALERIA DWT 5200')).toBeNull();
    expect(extractImo('')).toBeNull();
    expect(extractImo(null)).toBeNull();
  });

  it('extracts IMO even without prefix if surrounded by context', () => {
    expect(extractImo('built 2007, 9074729, bulker')).toBe('9074729');
  });

  it('skips invalid IMOs and returns null', () => {
    expect(extractImo('IMO 0000001')).toBeNull();
  });
});
