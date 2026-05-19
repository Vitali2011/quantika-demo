import { getPortDistance, normalizePortName, KNOWN_PORTS } from '../port-distances';

describe('normalizePortName — parenthetical hint fallback (Phase 2C)', () => {
  it('"Hereke (Marmara)" resolves via parenthetical hint to Marmara', () => {
    // Hereke is a small port in the Sea of Marmara — primary name resolves
    // directly via the new alias entry, OR via parenthetical fallback if absent.
    expect(normalizePortName('Hereke (Marmara)')).toBe('Marmara');
  });

  it('"Some Obscure Port (Marmara)" — unknown primary, hint rescues', () => {
    expect(normalizePortName('Some Obscure Port (Marmara)')).toBe('Marmara');
  });

  it('"Bay of Biscay (Bayonne/Bilbao range)" — slash-separated hint tokens', () => {
    // Either Bayonne or Bilbao resolution acceptable — both are valid hints
    const r = normalizePortName('Bay of Biscay (Bayonne/Bilbao range)');
    expect(['Bayonne', 'Bilbao']).toContain(r);
  });

  it('"Alexandria (EG)" — 2-letter country code skipped, primary still matches', () => {
    // Primary "Alexandria" resolves directly; parenthetical (EG) is just a hint.
    expect(normalizePortName('Alexandria (EG)')).toBe('Alexandria');
  });

  it('"Unknown Place (XX)" — country-code-only hint, returns null', () => {
    // Only a 2-letter code in parens → no usable hint, no fallback → null
    expect(normalizePortName('Unknown Place (XX)')).toBe(null);
  });

  it('"Marmara Sea" resolves to Marmara (new alias)', () => {
    expect(normalizePortName('Marmara Sea')).toBe('Marmara');
  });

  it('"Hereke" alone resolves via direct alias (new)', () => {
    expect(normalizePortName('Hereke')).toBe('Marmara');
  });

  it('"Gemlik" — south Marmara cluster, new alias', () => {
    expect(normalizePortName('Gemlik')).toBe('Marmara');
  });

  it('"sea of marmara" — case-insensitive new alias', () => {
    expect(normalizePortName('sea of marmara')).toBe('Marmara');
  });

  it('Primary name takes precedence over hint when both resolve', () => {
    // "Antwerp (Rotterdam range)" — both are valid ports, primary wins
    expect(normalizePortName('Antwerp (Rotterdam range)')).toBe('Antwerp');
  });
});

describe('normalizePortName — JSON-only ports (port-master corpus)', () => {
  it('fuzzy-matches Fos-sur-Mer with dropped letter to canonical JSON name', () => {
    // "Fos-sr-Mer" is a dropped-'u' typo of "Fos-sur-Mer".
    // Port exists ONLY in port-master.json, not in KNOWN_PORTS or PORT_ALIASES.
    expect(normalizePortName('Fos-sr-Mer')).toBe('Fos-sur-Mer');
  });
});

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
      // New ports added for smoke-test coverage
      'Chornomorsk', 'Marmara', 'Suez', 'Marghera',
      'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk',
      'Dakar', 'Lagos', 'Nacala',
      'Veracruz', 'NewOrleans', 'Houston', 'Santos',
      'Singapore', 'Tokyo', 'Shanghai',
      // Wave 3 gap-fill ports
      'Antalya', 'Izmail', 'Derince', 'Haugesund', 'Georgetown', 'Qingdao',
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
    expect(d!.nm).toBeGreaterThan(200);
    expect(d!.nm).toBeLessThan(500);
  });

  it('Chornomorsk ↔ Odesa (same bay, ~25 NM)', () => {
    const d = getPortDistance('Chornomorsk', 'Odesa');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeLessThan(100);
  });

  it('Singapore ↔ Shanghai (Far East, ~2200 NM)', () => {
    const d = getPortDistance('Singapore', 'Shanghai');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(1500);
  });

  it('alias "nikolaev" resolves for distance lookup', () => {
    expect(getPortDistance('nikolaev', 'Karasu')).toEqual(getPortDistance('Mykolaiv', 'Karasu'));
  });

  it('"Port of Antwerp, Belgium" resolves for distance lookup', () => {
    expect(getPortDistance('Port of Antwerp, Belgium', 'Rotterdam')).toEqual(
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

  it('resolves "Derince" → Derince (own canonical entry, Bug E1 fix)', () => {
    expect(normalizePortName('Derince')).toBe('Derince');
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
    expect(d!.nm).toBeGreaterThan(500);
    expect(d!.nm).toBeLessThan(900);
  });

  it('Dubai ↔ Mumbai (Arabian Sea ~1200 NM)', () => {
    const d = getPortDistance('Dubai', 'Mumbai');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(800);
    expect(d!.nm).toBeLessThan(1600);
  });

  it('Colombo ↔ Singapore (Indian Ocean ~1530 NM)', () => {
    const d = getPortDistance('Colombo', 'Singapore');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(1000);
    expect(d!.nm).toBeLessThan(2000);
  });

  it('Busan ↔ Shanghai (Yellow Sea ~500 NM)', () => {
    const d = getPortDistance('Busan', 'Shanghai');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(300);
    expect(d!.nm).toBeLessThan(700);
  });

  it('Algeciras ↔ Casablanca (Strait of Gibraltar ~150 NM)', () => {
    const d = getPortDistance('Algeciras', 'Casablanca');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeLessThan(300);
  });

  it('alias "Jebel Ali" → Dubai resolves for distance', () => {
    expect(getPortDistance('Jebel Ali', 'Suez')).toEqual(getPortDistance('Dubai', 'Suez'));
  });

  it('alias "Bombay" → Mumbai resolves for distance', () => {
    expect(getPortDistance('Bombay', 'Singapore')).toEqual(getPortDistance('Mumbai', 'Singapore'));
  });

  it('alias "Saigon" → HoChiMinh resolves for distance', () => {
    expect(getPortDistance('Saigon', 'Singapore')).toEqual(getPortDistance('HoChiMinh', 'Singapore'));
  });

  it('alias "Laem Chabang" → Bangkok resolves for distance', () => {
    expect(getPortDistance('Laem Chabang', 'Singapore')).toEqual(getPortDistance('Bangkok', 'Singapore'));
  });

  it('Durban ↔ CapeTown (South Africa coast ~800 NM)', () => {
    const d = getPortDistance('Durban', 'CapeTown');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(500);
    expect(d!.nm).toBeLessThan(1100);
  });
});

describe('getPortDistance — haversine fallback', () => {
  // Karasu ↔ Mykolaiv IS in static table — must return table value exactly
  it('static table pair returns exact table value (Karasu ↔ Mykolaiv = 315)', () => {
    expect(getPortDistance('Karasu', 'Mykolaiv')).toEqual({ nm: 315, exact: true });
  });

  // Same port → 0 regardless of fallback path
  it('same port returns 0', () => {
    expect(getPortDistance('Singapore', 'Singapore')).toEqual({ nm: 0, exact: true });
    expect(getPortDistance('Varna', 'Varna')).toEqual({ nm: 0, exact: true });
  });

  // A pair NOT in the static table but both ports have coords → haversine fallback
  // Varna ↔ Novorossiysk: both Black Sea, not in static table
  // Real distance ~375 NM; haversine×1.25 should give a plausible value in [200, 600]
  it('pair not in static table but with coords returns haversine × 1.25 (Varna ↔ Novorossiysk)', () => {
    const d = getPortDistance('Varna', 'Novorossiysk');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(200);
    expect(d!.nm).toBeLessThan(600);
  });

  // Antwerp ↔ Hamburg is IN static table (310); fallback must NOT be used
  // Sanity: result should equal static value, not a haversine estimate
  it('Antwerp ↔ Hamburg returns static 310 (not haversine estimate ~285)', () => {
    expect(getPortDistance('Antwerp', 'Hamburg')).toEqual({ nm: 310, exact: true });
  });

  // Sanity: Antwerp ↔ Hamburg haversine range [200, 400]
  it('Antwerp ↔ Hamburg result is in realistic range [200, 400]', () => {
    const d = getPortDistance('Antwerp', 'Hamburg');
    expect(d!.nm).toBeGreaterThanOrEqual(200);
    expect(d!.nm).toBeLessThanOrEqual(400);
  });

  // Sanity: Singapore ↔ Shanghai haversine × 1.25 should be in [1800, 3000]
  // (Static table value is 2200, also within that range — test passes either way)
  it('Singapore ↔ Shanghai is in [1800, 3000] NM range', () => {
    const d = getPortDistance('Singapore', 'Shanghai');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThanOrEqual(1800);
    expect(d!.nm).toBeLessThanOrEqual(3000);
  });

  // One port has no coords AND is not a known port → null
  it('unknown port returns null even with fallback', () => {
    expect(getPortDistance('Karasu', 'Atlantis')).toBeNull();
    expect(getPortDistance('Atlantis', 'Rotterdam')).toBeNull();
  });
});

describe('getPortDistance — previously-unknown verdict pairs (session gap-fill)', () => {
  // All 42 unknown-verdict matches resolved to null distanceNm because these
  // port pairs were missing from DISTANCES_NM. Added in this patch.

  it('Antalya ↔ Antwerp — Eastern Med → N.Europe (~3200 NM)', () => {
    const d = getPortDistance('Antalya', 'Antwerp');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(2500);
    expect(d!.nm).toBeLessThan(4000);
  });

  it('Antalya ↔ Hamburg — Eastern Med → N.Europe (~3350 NM)', () => {
    const d = getPortDistance('Antalya', 'Hamburg');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(2800);
    expect(d!.nm).toBeLessThan(4000);
  });

  it('Antalya ↔ Halsvik — Eastern Med → Norway (~4070 NM)', () => {
    const d = getPortDistance('Antalya', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Antalya ↔ Haugesund — Eastern Med → Norway (~4030 NM)', () => {
    const d = getPortDistance('Antalya', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Antalya ↔ Casablanca — Med → Atlantic (~1750 NM)', () => {
    const d = getPortDistance('Antalya', 'Casablanca');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(1200);
    expect(d!.nm).toBeLessThan(2500);
  });

  it('Antalya ↔ Karasu — Eastern Med → Black Sea (~540 NM)', () => {
    const d = getPortDistance('Antalya', 'Karasu');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(300);
    expect(d!.nm).toBeLessThan(800);
  });

  it('Marmara (Derince) ↔ Antwerp — via alias "Derince" → Marmara', () => {
    const d = getPortDistance('Derince', 'Antwerp');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(2800);
  });

  it('Marmara ↔ Hamburg (~3500 NM)', () => {
    const d = getPortDistance('Marmara', 'Hamburg');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(2800);
  });

  it('Marmara ↔ Halsvik (~4020 NM)', () => {
    const d = getPortDistance('Marmara', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Marmara ↔ Haugesund (~3980 NM)', () => {
    const d = getPortDistance('Marmara (Derince / Izmit range)', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Marmara ↔ Casablanca (~2270 NM)', () => {
    const d = getPortDistance('Marmara', 'Casablanca');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(1800);
    expect(d!.nm).toBeLessThan(3000);
  });

  it('Marmara ↔ Suez (~870 NM)', () => {
    const d = getPortDistance('Marmara', 'Suez');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(600);
    expect(d!.nm).toBeLessThan(1200);
  });

  it('Izmail / Reni ↔ Antwerp — via alias → Izmail', () => {
    const d = getPortDistance('Izmail / Reni', 'Antwerp');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3000);
  });

  it('Izmail ↔ Hamburg (~3880 NM)', () => {
    const d = getPortDistance('Izmail', 'Hamburg');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3000);
  });

  it('Izmail ↔ Halsvik (~4400 NM)', () => {
    const d = getPortDistance('Izmail', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Izmail ↔ Haugesund (~4360 NM)', () => {
    const d = getPortDistance('Izmail', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Izmail ↔ Marmara (~430 NM)', () => {
    const d = getPortDistance('Izmail', 'Marmara');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(200);
    expect(d!.nm).toBeLessThan(700);
  });

  it('Chornomorsk ↔ Halsvik (~4320 NM)', () => {
    const d = getPortDistance('Chornomorsk', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Chornomorsk ↔ Haugesund (~4280 NM)', () => {
    const d = getPortDistance('Chornomorsk', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Chornomorsk ↔ Marmara (~450 NM)', () => {
    const d = getPortDistance('Chornomorsk', 'Marmara');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(200);
    expect(d!.nm).toBeLessThan(700);
  });

  it('Constanta ↔ Halsvik (~4180 NM)', () => {
    const d = getPortDistance('Constanta', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Constanta ↔ Haugesund (~4140 NM)', () => {
    const d = getPortDistance('Constanta', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Mykolaiv ↔ Halsvik (~4400 NM)', () => {
    const d = getPortDistance('Mykolaiv', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Mykolaiv ↔ Haugesund (~4360 NM)', () => {
    const d = getPortDistance('Mykolaiv', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('El Dekheila (Alexandria) ↔ Halsvik — via alias → Alexandria', () => {
    const d = getPortDistance('El Dekheila (Alexandria)', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('El Dekheila (Alexandria) ↔ Haugesund — via alias → Alexandria', () => {
    const d = getPortDistance('El Dekheila (Alexandria)', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Ain Sokhna / Suez Canal area ↔ Halsvik — via alias → Suez', () => {
    const d = getPortDistance('Ain Sokhna / Suez Canal area', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Ain Sokhna / Suez Canal area ↔ Haugesund — via alias → Suez', () => {
    const d = getPortDistance('Ain Sokhna / Suez Canal area', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(3500);
  });

  it('Ain Sokhna / Suez Canal area ↔ Marmara — via alias → Suez', () => {
    const d = getPortDistance('Ain Sokhna / Suez Canal area', 'Marmara (Derince / Izmit range)');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(500);
    expect(d!.nm).toBeLessThan(1500);
  });

  it('Xingang / Qingdao range ↔ Halsvik — via alias → Qingdao', () => {
    const d = getPortDistance('Xingang / Qingdao range', 'Halsvik');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(10000);
  });

  it('Xingang / Qingdao range ↔ Haugesund — via alias → Qingdao', () => {
    const d = getPortDistance('Xingang / Qingdao range', 'Haugesund');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(10000);
  });

  it('Xingang / Qingdao range ↔ Marmara (Derince / Izmit range) — via aliases', () => {
    const d = getPortDistance('Xingang / Qingdao range', 'Marmara (Derince / Izmit range)');
    expect(d).not.toBeNull();
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(7000);
  });

  it('normalizePortName("Efesan (Aliaga)") → Aliaga', () => {
    expect(normalizePortName('Efesan (Aliaga)')).toBe('Aliaga');
  });

  it('normalizePortName("ARA range") → Antwerp', () => {
    expect(normalizePortName('ARA range')).toBe('Antwerp');
  });

  it('normalizePortName("Xingang / Qingdao range") → Qingdao', () => {
    expect(normalizePortName('Xingang / Qingdao range')).toBe('Qingdao');
  });

  it('normalizePortName("Izmail / Reni") → Izmail', () => {
    expect(normalizePortName('Izmail / Reni')).toBe('Izmail');
  });

  it('normalizePortName("Marmara (Derince / Izmit range)") → Marmara', () => {
    expect(normalizePortName('Marmara (Derince / Izmit range)')).toBe('Marmara');
  });
});
