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
      // New ports added for smoke-test coverage
      'Chornomorsk', 'Marmara', 'Suez', 'Marghera',
      'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk',
      'Dakar', 'Lagos', 'Nacala',
      'Veracruz', 'NewOrleans', 'Houston', 'Santos',
      'Singapore', 'Tokyo', 'Shanghai',
    ];
    for (const p of expected) {
      expect(KNOWN_PORTS).toContain(p);
    }
  });
});

describe('normalizePortName — extended aliases', () => {
  it('resolves "Port of Antwerp, Belgium" → Antwerp', () => {
    expect(normalizePortName('Port of Antwerp, Belgium')).toBe('Antwerp');
  });

  it('resolves "nikolaev" → Mykolaiv', () => {
    expect(normalizePortName('nikolaev')).toBe('Mykolaiv');
  });

  it('resolves "Alexandria (EG)" → Alexandria (strips parenthetical)', () => {
    expect(normalizePortName('Alexandria (EG)')).toBe('Alexandria');
  });

  it('resolves "El Dekheila" → Alexandria', () => {
    expect(normalizePortName('El Dekheila')).toBe('Alexandria');
  });

  it('resolves "Chornomorsk" → Chornomorsk', () => {
    expect(normalizePortName('Chornomorsk')).toBe('Chornomorsk');
  });

  it('resolves "Yokohama" → Tokyo', () => {
    expect(normalizePortName('Yokohama')).toBe('Tokyo');
  });

  it('resolves "Port Hamburg" → Hamburg', () => {
    expect(normalizePortName('Port Hamburg')).toBe('Hamburg');
  });

  it('returns null for fantasy port "Mars Base Alpha"', () => {
    expect(normalizePortName('Mars Base Alpha')).toBeNull();
  });
});

describe('getPortDistance — new port pairs', () => {
  it('Antwerp ↔ Hamburg (North Sea, ~310 NM)', () => {
    const d = getPortDistance('Antwerp', 'Hamburg');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(200);
    expect(d!).toBeLessThan(500);
  });

  it('Chornomorsk ↔ Odesa (same bay, ~25 NM)', () => {
    const d = getPortDistance('Chornomorsk', 'Odesa');
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(100);
  });

  it('Singapore ↔ Shanghai (Far East, ~2200 NM)', () => {
    const d = getPortDistance('Singapore', 'Shanghai');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(1500);
  });

  it('alias "nikolaev" resolves for distance lookup', () => {
    expect(getPortDistance('nikolaev', 'Karasu')).toBe(getPortDistance('Mykolaiv', 'Karasu'));
  });

  it('"Port of Antwerp, Belgium" resolves for distance lookup', () => {
    expect(getPortDistance('Port of Antwerp, Belgium', 'Rotterdam')).toBe(
      getPortDistance('Antwerp', 'Rotterdam'),
    );
  });
});
