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
      // Wave 3 gap-fill ports
      'Antalya', 'Izmail', 'Haugesund', 'Georgetown', 'Qingdao',
      'Jeddah', 'Dubai', 'Mumbai', 'Colombo', 'Singapore',
      'HongKong', 'Busan', 'Durban', 'CapeTown',
      'Genoa', 'Barcelona', 'Algeciras', 'LeHavre', 'Felixstowe',
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

describe('normalizePortName — session gap-fill aliases', () => {
  it('resolves "ARA range" → Antwerp', () => {
    expect(normalizePortName('ARA range')).toBe('Antwerp');
  });

  it('resolves "Vera Cruz" (with space) → Veracruz', () => {
    expect(normalizePortName('Vera Cruz')).toBe('Veracruz');
  });

  it('resolves "Haugesund" → Haugesund', () => {
    expect(normalizePortName('Haugesund')).toBe('Haugesund');
  });

  it('resolves "Derince" → Marmara (Sea of Marmara region)', () => {
    expect(normalizePortName('Derince')).toBe('Marmara');
  });

  it('resolves "Izmail / Reni" → Izmail', () => {
    expect(normalizePortName('Izmail / Reni')).toBe('Izmail');
  });

  it('resolves "Georgetown" → Georgetown', () => {
    expect(normalizePortName('Georgetown')).toBe('Georgetown');
  });

  it('resolves "Xingang / Qingdao (range)" → Qingdao', () => {
    expect(normalizePortName('Xingang / Qingdao (range)')).toBe('Qingdao');
  });

  it('resolves "Ain Sokhna / Suez Canal area" → Suez', () => {
    expect(normalizePortName('Ain Sokhna / Suez Canal area')).toBe('Suez');
  });

  it('resolves "KARASU, Turkey" → Karasu (uppercase + country suffix)', () => {
    expect(normalizePortName('KARASU, Turkey')).toBe('Karasu');
  });

  it('resolves "Novorossiysk, Russia" → Novorossiysk', () => {
    expect(normalizePortName('Novorossiysk, Russia')).toBe('Novorossiysk');
  });
});

describe('getPortDistance — new commercial port pairs', () => {
  it('Jeddah ↔ Suez (Red Sea ~700 NM)', () => {
    const d = getPortDistance('Jeddah', 'Suez');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(500);
    expect(d!).toBeLessThan(900);
  });

  it('Dubai ↔ Mumbai (Arabian Sea ~1200 NM)', () => {
    const d = getPortDistance('Dubai', 'Mumbai');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(800);
    expect(d!).toBeLessThan(1600);
  });

  it('Colombo ↔ Singapore (Indian Ocean ~1530 NM)', () => {
    const d = getPortDistance('Colombo', 'Singapore');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(1000);
    expect(d!).toBeLessThan(2000);
  });

  it('Busan ↔ Shanghai (Yellow Sea ~500 NM)', () => {
    const d = getPortDistance('Busan', 'Shanghai');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(300);
    expect(d!).toBeLessThan(700);
  });

  it('Algeciras ↔ Casablanca (Strait of Gibraltar ~150 NM)', () => {
    const d = getPortDistance('Algeciras', 'Casablanca');
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(300);
  });

  it('alias "Jebel Ali" → Dubai resolves for distance', () => {
    expect(getPortDistance('Jebel Ali', 'Suez')).toBe(getPortDistance('Dubai', 'Suez'));
  });

  it('alias "Bombay" → Mumbai resolves for distance', () => {
    expect(getPortDistance('Bombay', 'Singapore')).toBe(getPortDistance('Mumbai', 'Singapore'));
  });

  it('alias "Saigon" → HoChiMinh resolves for distance', () => {
    expect(getPortDistance('Saigon', 'Singapore')).toBe(getPortDistance('HoChiMinh', 'Singapore'));
  });

  it('alias "Laem Chabang" → Bangkok resolves for distance', () => {
    expect(getPortDistance('Laem Chabang', 'Singapore')).toBe(getPortDistance('Bangkok', 'Singapore'));
  });

  it('Durban ↔ CapeTown (South Africa coast ~800 NM)', () => {
    const d = getPortDistance('Durban', 'CapeTown');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(500);
    expect(d!).toBeLessThan(1100);
  });
});

describe('getPortDistance — haversine fallback', () => {
  // Karasu ↔ Mykolaiv IS in static table — must return table value exactly
  it('static table pair returns exact table value (Karasu ↔ Mykolaiv = 315)', () => {
    expect(getPortDistance('Karasu', 'Mykolaiv')).toBe(315);
  });

  // Same port → 0 regardless of fallback path
  it('same port returns 0', () => {
    expect(getPortDistance('Singapore', 'Singapore')).toBe(0);
    expect(getPortDistance('Varna', 'Varna')).toBe(0);
  });

  // A pair NOT in the static table but both ports have coords → haversine fallback
  // Varna ↔ Novorossiysk: both Black Sea, not in static table
  // Real distance ~375 NM; haversine×1.25 should give a plausible value in [200, 600]
  it('pair not in static table but with coords returns haversine × 1.25 (Varna ↔ Novorossiysk)', () => {
    const d = getPortDistance('Varna', 'Novorossiysk');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(200);
    expect(d!).toBeLessThan(600);
  });

  // Antwerp ↔ Hamburg is IN static table (310); fallback must NOT be used
  // Sanity: result should equal static value, not a haversine estimate
  it('Antwerp ↔ Hamburg returns static 310 (not haversine estimate ~285)', () => {
    expect(getPortDistance('Antwerp', 'Hamburg')).toBe(310);
  });

  // Sanity: Antwerp ↔ Hamburg haversine range [200, 400]
  it('Antwerp ↔ Hamburg result is in realistic range [200, 400]', () => {
    const d = getPortDistance('Antwerp', 'Hamburg');
    expect(d!).toBeGreaterThanOrEqual(200);
    expect(d!).toBeLessThanOrEqual(400);
  });

  // Sanity: Singapore ↔ Shanghai haversine × 1.25 should be in [1800, 3000]
  // (Static table value is 2200, also within that range — test passes either way)
  it('Singapore ↔ Shanghai is in [1800, 3000] NM range', () => {
    const d = getPortDistance('Singapore', 'Shanghai');
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThanOrEqual(1800);
    expect(d!).toBeLessThanOrEqual(3000);
  });

  // One port has no coords AND is not a known port → null
  it('unknown port returns null even with fallback', () => {
    expect(getPortDistance('Karasu', 'Atlantis')).toBeNull();
    expect(getPortDistance('Atlantis', 'Rotterdam')).toBeNull();
  });
});
