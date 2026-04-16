import { getPortDistance, normalizePortName, KNOWN_PORTS } from '../port-distances';

describe('normalizePortName', () => {
  it('uppercases and trims', () => {
    expect(normalizePortName('karasu')).toBe('Karasu');
    expect(normalizePortName('  KARASU  ')).toBe('Karasu');
    expect(normalizePortName('Karasu, Turkey')).toBe('Karasu');
  });

  it('handles aliases', () => {
    expect(normalizePortName('Odessa')).toBe('Odesa');
    expect(normalizePortName('Constantza')).toBe('Constanta');
    expect(normalizePortName('Aliaga')).toBe('Aliaga');
    expect(normalizePortName('Efesan')).toBe('Aliaga'); // Efesan port is in Aliaga bay
  });

  it('strips country suffixes', () => {
    expect(normalizePortName('Mykolaiv, Ukraine')).toBe('Mykolaiv');
    expect(normalizePortName('Alexandria Egypt')).toBe('Alexandria');
  });

  it('returns null for unknown', () => {
    expect(normalizePortName('Atlantis')).toBeNull();
    expect(normalizePortName('')).toBeNull();
    expect(normalizePortName(null)).toBeNull();
  });

  it('handles multi-port ranges by taking first', () => {
    expect(normalizePortName('Bay of Biscay (Bayonne/Bilbao range)')).toBe('Bayonne');
  });
});

describe('getPortDistance', () => {
  it('Karasu ↔ Mykolaiv is short (~320 NM, Black Sea crossing)', () => {
    const d = getPortDistance('Karasu', 'Mykolaiv');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(250);
    expect(d!).toBeLessThan(450);
  });

  it('is symmetric', () => {
    const a = getPortDistance('Karasu', 'Mykolaiv');
    const b = getPortDistance('Mykolaiv', 'Karasu');
    expect(a).toBe(b);
  });

  it('case-insensitive', () => {
    expect(getPortDistance('karasu', 'MYKOLAIV')).toBe(getPortDistance('Karasu', 'Mykolaiv'));
  });

  it('Istanbul ↔ Piraeus is medium (Aegean crossing)', () => {
    const d = getPortDistance('Istanbul', 'Piraeus');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(350);
    expect(d!).toBeLessThan(700);
  });

  it('Piraeus ↔ Alexandria is Mediterranean ~600 NM', () => {
    const d = getPortDistance('Piraeus', 'Alexandria');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(500);
    expect(d!).toBeLessThan(800);
  });

  it('same port → 0', () => {
    expect(getPortDistance('Karasu', 'Karasu')).toBe(0);
  });

  it('unknown port → null', () => {
    expect(getPortDistance('Karasu', 'Atlantis')).toBeNull();
    expect(getPortDistance('Atlantis', 'Karasu')).toBeNull();
  });

  it('normalizes aliases on lookup', () => {
    // "Odessa" alias should resolve to Odesa and match distances
    expect(getPortDistance('Odessa', 'Karasu')).toBe(getPortDistance('Odesa', 'Karasu'));
  });
});

describe('KNOWN_PORTS coverage', () => {
  it('includes all sample-data ports', () => {
    const expected = [
      'Karasu', 'Mykolaiv', 'Odesa', 'Constanta', 'Alexandria', 'Piraeus',
      'Ravenna', 'Istanbul', 'Aliaga', 'Skikda', 'Casablanca', 'Bayonne',
    ];
    for (const p of expected) {
      expect(KNOWN_PORTS).toContain(p);
    }
  });
});
