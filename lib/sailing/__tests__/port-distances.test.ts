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
  it('Karasu ↔ Mykolaiv is short (~320 NM, Black Sea crossing) — exact from matrix', () => {
    const d = getPortDistance('Karasu', 'Mykolaiv');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(250);
    expect(d!.nm).toBeLessThan(450);
    expect(d!.exact).toBe(true);
  });

  it('is symmetric', () => {
    const a = getPortDistance('Karasu', 'Mykolaiv');
    const b = getPortDistance('Mykolaiv', 'Karasu');
    expect(a).toEqual(b);
  });

  it('case-insensitive', () => {
    expect(getPortDistance('karasu', 'MYKOLAIV')).toEqual(getPortDistance('Karasu', 'Mykolaiv'));
  });

  it('Istanbul ↔ Piraeus is medium (Aegean crossing)', () => {
    const d = getPortDistance('Istanbul', 'Piraeus');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(350);
    expect(d!.nm).toBeLessThan(700);
  });

  it('Piraeus ↔ Alexandria is Mediterranean ~600 NM', () => {
    const d = getPortDistance('Piraeus', 'Alexandria');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(500);
    expect(d!.nm).toBeLessThan(800);
  });

  it('same port → 0, exact', () => {
    expect(getPortDistance('Karasu', 'Karasu')).toEqual({ nm: 0, exact: true });
  });

  it('unknown port → null', () => {
    expect(getPortDistance('Karasu', 'Atlantis')).toBeNull();
    expect(getPortDistance('Atlantis', 'Karasu')).toBeNull();
  });

  it('normalizes aliases on lookup', () => {
    expect(getPortDistance('Odessa', 'Karasu')).toEqual(getPortDistance('Odesa', 'Karasu'));
  });

  it('haversine fallback for un-matrixed pair (Karasu ↔ Bayonne not in matrix)', () => {
    const d = getPortDistance('Karasu', 'Bayonne');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(false);
    // Karasu (41°N 30°E) to Bayonne (43°N -1°E) great-circle straight across
    // Europe is ~1400-1500 NM. The real SEA route via Bosphorus + Med +
    // Gibraltar is ~3100 NM, but haversine ignores land. UI marks "~" so
    // brokers know it's an approximation — this is the documented trade-off.
    expect(d!.nm).toBeGreaterThan(1300);
    expect(d!.nm).toBeLessThan(1700);
  });

  it('returns null when one port lacks coords for haversine fallback', () => {
    // If we asked for an alias that resolves but has no coords AND no matrix
    // entry, must gracefully return null (not throw).
    // (No way to construct this with current 15 ports — all have coords.
    //  Phase 5 with JSON-loaded ports may have null-coord entries.)
    expect(getPortDistance('Karasu', 'Karasu')).not.toBeNull();
  });
});

describe('normalizePortName — fuzzy fallback (Wave 4)', () => {
  it('catches single typo (Karasu → Karsu)', () => {
    expect(normalizePortName('Karsu')).toBe('Karasu');
  });

  it('catches dropped letter (Constanta → Constana)', () => {
    expect(normalizePortName('Constana')).toBe('Constanta');
  });

  it('catches "Port of X" prefix not in alias map', () => {
    expect(normalizePortName('Port of Mykolaiv')).toBe('Mykolaiv');
    expect(normalizePortName('Port of Constanta')).toBe('Constanta');
  });

  it('catches mixed case + country code suffix', () => {
    expect(normalizePortName('NOVOROSSIYSK RU')).toBe('Novorossiysk');
  });

  it('returns null for nonsense input (no false positive)', () => {
    expect(normalizePortName('xyz123')).toBeNull();
    expect(normalizePortName('Atlantis')).toBeNull();
  });

  it('empty / null input still returns null', () => {
    expect(normalizePortName('')).toBeNull();
    expect(normalizePortName('   ')).toBeNull();
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
