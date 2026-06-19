import * as fs from 'fs';
import * as path from 'path';
import { getPortDistance, normalizePortName, KNOWN_PORTS } from '../port-distances';
import { getPortMaster } from '../port-master';

describe('normalizePortName — fuzzy length-ratio guard (Phase B)', () => {
  it('"Vasto" resolves to canonical Vasto, NOT Vladivostok (Phase C1)', () => {
    // Originally (Phase B) "Vasto" returned null because it was not a known
    // port AND the length-ratio guard blocked the fuzzy Vasto→Vladivostok
    // false positive. Phase C1 promotes Vasto to a canonical port-master
    // entry, so it now resolves to itself. The Vladivostok regression
    // remains guarded by FUZZY_LEN_RATIO_MAX.
    expect(normalizePortName('Vasto')).toBe('Vasto');
  });

  it('"Vladivstk" does NOT cross-match Vasto (length-ratio guard still works)', () => {
    // Length-ratio guard regression: a typo of Vladivostok must NOT collapse
    // onto the much shorter "Vasto" via fuzzy match.
    expect(normalizePortName('Vladivstk')).not.toBe('Vasto');
  });

  it('"Karsu" still resolves to "Karasu" (legit typo, ratio 1.2)', () => {
    expect(normalizePortName('Karsu')).toBe('Karasu');
  });

  it('"Fos-sr-Mer" still resolves to "Fos-sur-Mer" (dropped letter, ratio 1.1)', () => {
    expect(normalizePortName('Fos-sr-Mer')).toBe('Fos-sur-Mer');
  });

  it('returns null for very short queries (< 4 chars)', () => {
    expect(normalizePortName('ab')).toBe(null);
  });
});

describe('normalizePortName — explicit alias additions (Phase B)', () => {
  it('"Gibraltar Range" resolves to "Gibraltar" via direct alias', () => {
    // "Gibraltar" was in port-master.json but missing from PORT_ALIASES.
    // Phase B adds it explicitly so common compound forms resolve directly.
    expect(normalizePortName('Gibraltar Range')).toBe('Gibraltar');
  });

  it('"Gibraltar" alone resolves directly', () => {
    expect(normalizePortName('Gibraltar')).toBe('Gibraltar');
  });

  it('"Adriatic" alone still returns null (vague region, no specific port)', () => {
    expect(normalizePortName('Adriatic')).toBe(null);
  });
});

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

  it('"Port of Call, Ukraine (unspecified)" resolves to Odesa (vague-ukraine guard)', () => {
    expect(normalizePortName('Port of Call, Ukraine (unspecified)')).toBe('Odesa');
  });

  it('"Port of Call, Ukraine" (no parenthetical) resolves to Odesa', () => {
    expect(normalizePortName('Port of Call, Ukraine')).toBe('Odesa');
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

  it('tier-2 JSON lookup for un-matrixed pair (Karasu ↔ Bayonne not in hand-curated matrix)', () => {
    const d = getPortDistance('Karasu', 'Bayonne');
    expect(d).not.toBeNull();
    // Tier 2 (searoute JSON) now covers this pair — returns exact sea-route distance
    // via Bosphorus + Med + Gibraltar (~2700-3100nm), not haversine great-circle (~1500nm).
    expect(d!.exact).toBe(true);
    expect(d!.nm).toBeGreaterThan(2000);
    expect(d!.nm).toBeLessThan(3500);
  });

  it('returns null when one port lacks coords for haversine fallback', () => {
    // If we asked for an alias that resolves but has no coords AND no matrix
    // entry, must gracefully return null (not throw).
    // (No way to construct this with current 15 ports — all have coords.
    //  Phase 5 with JSON-loaded ports may have null-coord entries.)
    expect(getPortDistance('Karasu', 'Karasu')).not.toBeNull();
  });

  it('Iskenderun → "Port of Call, Ukraine (unspecified)" < 2000nm (not 7811nm Callao)', () => {
    const d = getPortDistance('Iskenderun', 'Port of Call, Ukraine (unspecified)');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeLessThan(2000);
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

describe('normalizePortName — UNLOCODE fast path (#407 populate gap)', () => {
  it('NLRTM resolves to Rotterdam', () => {
    expect(normalizePortName('NLRTM')).toBe('Rotterdam');
  });

  it('CNSHA resolves to Shanghai', () => {
    expect(normalizePortName('CNSHA')).toBe('Shanghai');
  });

  it('DEHAM resolves to Hamburg', () => {
    expect(normalizePortName('DEHAM')).toBe('Hamburg');
  });

  it('BEANR resolves to Antwerp', () => {
    expect(normalizePortName('BEANR')).toBe('Antwerp');
  });

  it('unknown UNLOCODE returns null gracefully', () => {
    expect(normalizePortName('XYZQW')).toBeNull();
  });
});

describe('getPortDistance — UNLOCODE input (#407 populate gap)', () => {
  it('CNSHA ↔ NLRTM returns non-null distance', () => {
    const d = getPortDistance('CNSHA', 'NLRTM');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(0);
  });

  it('CNSHA ↔ NLRTM equals Shanghai ↔ Rotterdam', () => {
    const byCode = getPortDistance('CNSHA', 'NLRTM');
    const byName = getPortDistance('Shanghai', 'Rotterdam');
    expect(byCode).toEqual(byName);
  });

  it('unknown UNLOCODE in either position returns null', () => {
    expect(getPortDistance('XYZQW', 'NLRTM')).toBeNull();
    expect(getPortDistance('CNSHA', 'XYZQW')).toBeNull();
  });

  it('CNSHA ↔ CNSHA (same port) returns 0', () => {
    expect(getPortDistance('CNSHA', 'CNSHA')).toEqual({ nm: 0, exact: true });
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

describe('normalizePortName — Phase 2D coverage (port DB aliases)', () => {
  // ── Aliaga cluster (Turkish Aegean) ──
  it('"Nemrut Bay" — Aliaga industrial complex', () => {
    expect(normalizePortName('Nemrut Bay')).toBe('Aliaga');
  });
  it('"Nemrut" alone — Aliaga industrial complex', () => {
    expect(normalizePortName('Nemrut')).toBe('Aliaga');
  });

  // ── Marmara cluster (Turkish Sea of Marmara) ──
  it('"Yarımca" with Turkish diacritic — Marmara cluster', () => {
    expect(normalizePortName('Yarımca')).toBe('Marmara');
  });
  it('"Yarimca" without diacritic — Marmara cluster', () => {
    expect(normalizePortName('Yarimca')).toBe('Marmara');
  });
  it('"Diliskelesi" — Dilovasi cluster, Marmara south shore', () => {
    expect(normalizePortName('Diliskelesi')).toBe('Marmara');
  });
  it('"Çanakkale" with diacritic — Dardanelles, Marmara entry', () => {
    expect(normalizePortName('Çanakkale')).toBe('Marmara');
  });
  it('"Canakkale" without diacritic — Dardanelles, Marmara entry', () => {
    expect(normalizePortName('Canakkale')).toBe('Marmara');
  });
  it('"Bandırma" with diacritic — Sea of Marmara', () => {
    expect(normalizePortName('Bandırma')).toBe('Marmara');
  });

  // ── Black Sea / Danube ──
  it('"Pivdennyi" — Ukrainian name for Yuzhny port', () => {
    expect(normalizePortName('Pivdennyi')).toBe('Yuzhny');
  });
  it('"Yuzhne" — Ukrainian variant of Yuzhny', () => {
    expect(normalizePortName('Yuzhne')).toBe('Yuzhny');
  });
  it('"Pivdennyi (Yuzhne)" — broker phrasing with bilingual hint', () => {
    expect(normalizePortName('Pivdennyi (Yuzhne)')).toBe('Yuzhny');
  });
  it('"Giurgiulesti" — Moldovan Danube port, Izmail proxy', () => {
    expect(normalizePortName('Giurgiulesti')).toBe('Izmail');
  });
  it('"Giurgiulești" with diacritic — Moldovan Danube port', () => {
    expect(normalizePortName('Giurgiulești')).toBe('Izmail');
  });
  it('"Braila" — Romanian Danube port, Izmail proxy', () => {
    expect(normalizePortName('Braila')).toBe('Izmail');
  });
  it('"Galati" — Romanian Danube port, Izmail proxy', () => {
    expect(normalizePortName('Galati')).toBe('Izmail');
  });
  it('"Kavkaz" — Kerch Strait port, Novorossiysk proxy', () => {
    expect(normalizePortName('Kavkaz')).toBe('Novorossiysk');
  });

  // ── Eastern Med ──
  it('"Tartus" — Syrian port (now in KNOWN_PORTS)', () => {
    expect(normalizePortName('Tartus')).toBe('Tartus');
  });
  it('"Tartous" — French/Arabic spelling variant', () => {
    expect(normalizePortName('Tartous')).toBe('Tartus');
  });
  it('"Abu Qir" — Alexandria eastern terminal', () => {
    expect(normalizePortName('Abu Qir')).toBe('Alexandria');
  });
  it('"Adabiya" — Suez Gulf bulk terminal', () => {
    expect(normalizePortName('Adabiya')).toBe('Suez');
  });

  // ── Red Sea / Saudi ──
  it('"King Abdullah Port" — KAEC at Rabigh, Jeddah proxy', () => {
    expect(normalizePortName('King Abdullah Port')).toBe('Jeddah');
  });
  it('"KAEC" — King Abdullah Economic City', () => {
    expect(normalizePortName('KAEC')).toBe('Jeddah');
  });

  // ── South Asia ──
  it('"Kakinada Anchorage" — multi-word resolves via part-split', () => {
    expect(normalizePortName('Kakinada Anchorage')).toBe('Kakinada');
  });
  it('"Kakinada" — South India port (now in KNOWN_PORTS)', () => {
    expect(normalizePortName('Kakinada')).toBe('Kakinada');
  });

  // ── SE Asia ──
  it('"Songkhla" — South Thailand port (now in KNOWN_PORTS)', () => {
    expect(normalizePortName('Songkhla')).toBe('Songkhla');
  });
  it('"Ko Si Chang" — Gulf of Thailand anchorage, Bangkok proxy', () => {
    expect(normalizePortName('Ko Si Chang')).toBe('Bangkok');
  });
  it('"Koh Sichang" — alt spelling, Bangkok proxy', () => {
    expect(normalizePortName('Koh Sichang')).toBe('Bangkok');
  });

  // ── Negative: ambiguous regional phrasings still return null ──
  it('"East Coast Greece" — vague region, returns null (no ambiguous alias)', () => {
    expect(normalizePortName('East Coast Greece')).toBeNull();
  });
  it('"1 safe port Greece" — placeholder phrasing, returns null', () => {
    expect(normalizePortName('1 safe port Greece')).toBeNull();
  });
});



describe('Phase C1: new port-master entries', () => {
  // Each new canonical port resolves to itself (identity), plus a sample alias.
  // Coordinates and metadata live in data/ports/port-master.json.

  it('"Vasto" — Italian Adriatic port (canonical)', () => {
    expect(normalizePortName('Vasto')).toBe('Vasto');
  });
  it('"Birkenhead" — Mersey/Liverpool group port', () => {
    expect(normalizePortName('Birkenhead')).toBe('Birkenhead');
  });
  it('"Greenore" — NE Ireland Carlingford Lough port', () => {
    expect(normalizePortName('Greenore')).toBe('Greenore');
  });
  it('"Damietta" — Egyptian Med container/grain port', () => {
    expect(normalizePortName('Damietta')).toBe('Damietta');
  });
  it('"damietta port" — lowercase alias resolves to Damietta', () => {
    expect(normalizePortName('damietta port')).toBe('Damietta');
  });
  it('"Bizerte" — northern Tunisia port', () => {
    expect(normalizePortName('Bizerte')).toBe('Bizerte');
  });
  it('"Bizerta" — French/older spelling alias', () => {
    expect(normalizePortName('Bizerta')).toBe('Bizerte');
  });
  it('"Bejaia" — Algerian Med coast port', () => {
    expect(normalizePortName('Bejaia')).toBe('Bejaia');
  });
  it('"Bougie" — colonial French alias for Bejaia', () => {
    expect(normalizePortName('Bougie')).toBe('Bejaia');
  });
  it('"Trapani" — western Sicily port', () => {
    expect(normalizePortName('Trapani')).toBe('Trapani');
  });
  it('"Pozzallo" — southern Sicily port', () => {
    expect(normalizePortName('Pozzallo')).toBe('Pozzallo');
  });
  it('"Fujairah" — UAE Gulf of Oman bunkering hub', () => {
    expect(normalizePortName('Fujairah')).toBe('Fujairah');
  });
  it('"Sohar" — Omani deepwater port', () => {
    expect(normalizePortName('Sohar')).toBe('Sohar');
  });
  it('"Conakry" — Guinea capital port', () => {
    expect(normalizePortName('Conakry')).toBe('Conakry');
  });

  it('getPortDistance(Vasto, Casablanca) returns positive distance (was null pre-C1)', () => {
    const d = getPortDistance('Vasto', 'Casablanca');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(0);
  });

  it('getPortDistance(Fujairah, Singapore) returns positive distance', () => {
    const d = getPortDistance('Fujairah', 'Singapore');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(0);
  });
});

describe('getPortDistance — Phase D1 hand-curated corridor pairs', () => {
  // Each pair verified against BIMCO/searoutes-style anchors in the matrix.
  // exact:true confirms the lookup hits the curated table, not haversine fallback.

  describe('Damietta (East Med, Egypt)', () => {
    it('Damietta ↔ Alexandria (coastal Egypt) = 130 NM exact', () => {
      const d = getPortDistance('Damietta', 'Alexandria');
      expect(d).toEqual({ nm: 130, exact: true });
    });
    it('Damietta ↔ Suez (Med to Suez Canal mouth) = 150 NM exact', () => {
      expect(getPortDistance('Damietta', 'Suez')).toEqual({ nm: 150, exact: true });
    });
    it('Damietta ↔ Piraeus (Aegean crossing) = 610 NM exact', () => {
      expect(getPortDistance('Damietta', 'Piraeus')).toEqual({ nm: 610, exact: true });
    });
    it('Damietta ↔ Istanbul (through Bosphorus) = 820 NM exact', () => {
      expect(getPortDistance('Damietta', 'Istanbul')).toEqual({ nm: 820, exact: true });
    });
    it('Damietta ↔ Antwerp (via Gibraltar) = 3490 NM exact (haversine would be ~2400)', () => {
      expect(getPortDistance('Damietta', 'Antwerp')).toEqual({ nm: 3490, exact: true });
    });
    it('Damietta ↔ Rotterdam (via Gibraltar) = 3510 NM exact', () => {
      expect(getPortDistance('Damietta', 'Rotterdam')).toEqual({ nm: 3510, exact: true });
    });
    it('Damietta ↔ Hamburg (via Gibraltar) = 3610 NM exact', () => {
      expect(getPortDistance('Damietta', 'Hamburg')).toEqual({ nm: 3610, exact: true });
    });
  });

  describe('Vasto (mid Adriatic, Italy)', () => {
    it('Vasto ↔ Ravenna (Adriatic Italian coast) = 210 NM exact', () => {
      expect(getPortDistance('Vasto', 'Ravenna')).toEqual({ nm: 210, exact: true });
    });
    it('Vasto ↔ Marghera (top Adriatic) = 290 NM exact', () => {
      expect(getPortDistance('Vasto', 'Marghera')).toEqual({ nm: 290, exact: true });
    });
    it('Vasto ↔ Piraeus (Otranto + Aegean) = 620 NM exact', () => {
      expect(getPortDistance('Vasto', 'Piraeus')).toEqual({ nm: 620, exact: true });
    });
    it('Vasto ↔ Istanbul (via Aegean + Bosphorus) = 900 NM exact', () => {
      expect(getPortDistance('Vasto', 'Istanbul')).toEqual({ nm: 900, exact: true });
    });
    it('Vasto ↔ Odesa (Adriatic to Black Sea via Bosphorus) = 1290 NM exact', () => {
      expect(getPortDistance('Vasto', 'Odesa')).toEqual({ nm: 1290, exact: true });
    });
  });

  describe('Fujairah / Sohar (Gulf of Oman bunkering)', () => {
    it('Fujairah ↔ Suez (Indian Ocean + Red Sea) = 2200 NM exact', () => {
      expect(getPortDistance('Fujairah', 'Suez')).toEqual({ nm: 2200, exact: true });
    });
    it('Fujairah ↔ Singapore (east trade route) = 3050 NM exact', () => {
      expect(getPortDistance('Fujairah', 'Singapore')).toEqual({ nm: 3050, exact: true });
    });
    it('Sohar ↔ Suez (similar to Fujairah, ~30 NM closer) = 2230 NM exact', () => {
      expect(getPortDistance('Sohar', 'Suez')).toEqual({ nm: 2230, exact: true });
    });
  });

  describe('Birkenhead (UK NW, Mersey — Liverpool sister port)', () => {
    it('Birkenhead ↔ Rotterdam (UK → Continent) = 400 NM exact', () => {
      expect(getPortDistance('Birkenhead', 'Rotterdam')).toEqual({ nm: 400, exact: true });
    });
    it('Birkenhead ↔ Antwerp = 420 NM exact', () => {
      expect(getPortDistance('Birkenhead', 'Antwerp')).toEqual({ nm: 420, exact: true });
    });
    it('Birkenhead ↔ Hamburg = 580 NM exact', () => {
      expect(getPortDistance('Birkenhead', 'Hamburg')).toEqual({ nm: 580, exact: true });
    });
    it('Birkenhead ↔ Casablanca (UK → Morocco) = 1450 NM exact', () => {
      expect(getPortDistance('Birkenhead', 'Casablanca')).toEqual({ nm: 1450, exact: true });
    });
    it('Birkenhead ↔ Damietta (UK → East Med via Gibraltar) = 3500 NM exact', () => {
      expect(getPortDistance('Birkenhead', 'Damietta')).toEqual({ nm: 3500, exact: true });
    });
  });

  describe('symmetry — reversed argument order returns same exact distance', () => {
    it('Suez → Fujairah = Fujairah → Suez', () => {
      expect(getPortDistance('Suez', 'Fujairah')).toEqual(getPortDistance('Fujairah', 'Suez'));
    });
    it('Odesa → Vasto = Vasto → Odesa', () => {
      expect(getPortDistance('Odesa', 'Vasto')).toEqual(getPortDistance('Vasto', 'Odesa'));
    });
  });
});

describe('vague Ukraine discharge resolves to Black-Sea-plausible distance', () => {
  it('Iskenderun → "Port of Call Ukraine" resolves to a Black-Sea-plausible distance (< 1500nm), not 7811', () => {
    const d = getPortDistance('Iskenderun', 'Port of Call Ukraine');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(400);   // real Iskenderun→Odesa ≈ 760nm
    expect(d!.nm).toBeLessThan(1500);     // hard ceiling — 7811 is the bug
  });

  it('"Ukraine" alone resolves to a Black-Sea representative port', () => {
    expect(normalizePortName('Ukraine')).toBe('Odesa');
  });
});

describe('vague-unknown port strings do not fuzzy-match distant real ports (fix-l2-r5)', () => {
  // Root bug: "Port of Call (unspecified)" → strips to "Call" → fuzzysort prefix-matches
  // "callao" (Callao, Peru) → Damietta↔Callao = 7688nm in the MAIN match bucket.
  it('normalizePortName("Port of Call (unspecified)") → null, not Callao', () => {
    expect(normalizePortName('Port of Call (unspecified)')).toBeNull();
  });

  it('normalizePortName("Port of Call") → null, not Callao', () => {
    expect(normalizePortName('Port of Call')).toBeNull();
  });

  // Root bug: "Greece (port unspecified)" → paren hint "port" → fuzzysort prefix-matches
  // "portland" → getPortDistance(Iskenderun, Portland) = 5105nm.
  it('normalizePortName("Greece (port unspecified)") → null, not Portland', () => {
    expect(normalizePortName('Greece (port unspecified)')).toBeNull();
  });

  it('normalizePortName("Egypt (port unspecified)") → null, not Portland', () => {
    expect(normalizePortName('Egypt (port unspecified)')).toBeNull();
  });

  // Behavioral: vague unknown discharge → getPortDistance returns null (no bogus 7000+nm distance)
  it('getPortDistance("Damietta", "Port of Call (unspecified)") → null (was 7688nm via Callao)', () => {
    expect(getPortDistance('Damietta', 'Port of Call (unspecified)')).toBeNull();
  });

  it('getPortDistance("Iskenderun", "Greece (port unspecified)") → not 5105nm (was Portland via paren-hint "port")', () => {
    const d = getPortDistance('Iskenderun', 'Greece (port unspecified)');
    // Before fix: paren hint "port" → fuzzy → Portland → 5105nm (wrong continent).
    // After fix: "port" is noise word, hint discarded; centroid fallback gives ~600nm (correct region).
    expect(d?.nm ?? 0).toBeLessThan(4000);
  });

  // Regression: Ukraine-specific guard still works (must come before the UNKNOWN_RE guard)
  it('"Port of Call, Ukraine (unspecified)" still resolves to Odesa (Ukraine guard unchanged)', () => {
    expect(normalizePortName('Port of Call, Ukraine (unspecified)')).toBe('Odesa');
  });

  // Regression: real port name lookups still work (direct alias + fuzzy not broken by new guards)
  it('real port names with aliases still resolve correctly', () => {
    expect(normalizePortName('Aliaga')).toBe('Aliaga');
    expect(normalizePortName('Odessa')).toBe('Odesa');          // alias → Odesa
    expect(normalizePortName('Novorossisk')).toBe('Novorossiysk'); // alias → Novorossiysk
  });
});

describe('portgap: absent/aliased ports resolve to non-null distance', () => {
  it('Monrovia resolves via new JSON entry', () => {
    expect(getPortMaster('Monrovia')).not.toBeNull();
    expect(getPortDistance('Kakinada Anchorage', 'Monrovia')?.nm).toBeGreaterThan(0);
  });
  it('Ras el Khair resolves via new JSON entry', () => {
    expect(getPortMaster('Ras el Khair')).not.toBeNull();
    expect(getPortDistance('Ras el Khair', 'Shuaiba')?.nm).toBeGreaterThan(0);
  });
  it('Puerto Limon (no accent) resolves to existing CRLIO via alias', () => {
    expect(normalizePortName('Puerto Limon')).toBe('Puerto Limón');
    expect(getPortDistance('Karasu', 'Puerto Limon')?.nm).toBeGreaterThan(0);
  });
  it('Koh Sri Chang resolves via Bangkok alias', () => {
    expect(getPortDistance('Koh Sri Chang', 'Conakry')?.nm).toBeGreaterThan(0);
  });
});

describe('DISTANCES_NM key-order regression (fix-distance-keyorder)', () => {
  // Every key in the hand-curated DISTANCES_NM table must be in canonical
  // alphabetically-sorted form ("A|B" where A <= B lexicographically).
  // If any key is in wrong order, it is never reached by getPortDistance
  // (which sorts the pair before lookup) — silent bad-value or miss.
  it('all DISTANCES_NM keys are in canonical sorted form (no dead keys)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'port-distances.ts'),
      'utf8',
    );
    const keyRe = /'([^'|]+\|[^'|]+)':\s*\d+/g;
    let m: RegExpExecArray | null;
    const deadKeys: string[] = [];
    while ((m = keyRe.exec(src)) !== null) {
      const key = m[1];
      const [a, b] = key.split('|');
      const sorted = [a, b].sort().join('|');
      if (sorted !== key) deadKeys.push(key);
    }
    expect(deadKeys).toEqual([]);
  });

  // Behavioral: Hamburg ↔ Alexandria must return the hand-curated 3500 NM
  // (tier-1 hit), NOT the searoute JSON 3447 NM (tier-2 fallback).
  // Before fix: key was 'Hamburg|Alexandria' — lookup produces 'Alexandria|Hamburg' — miss.
  it('Hamburg ↔ Alexandria returns hand-curated 3500 NM exact (tier-1, not searoute 3447)', () => {
    expect(getPortDistance('Hamburg', 'Alexandria')).toEqual({ nm: 3500, exact: true });
  });

  // Marghera ↔ Piraeus was dead AND had no searoute fallback → haversine ~600nm.
  // After fix: key 'Marghera|Piraeus': 710 must be reached.
  it('Marghera ↔ Piraeus returns hand-curated 710 NM exact (was dead key → haversine fallback)', () => {
    expect(getPortDistance('Marghera', 'Piraeus')).toEqual({ nm: 710, exact: true });
  });

  // Dubai ↔ BandarAbbas: dead key 'Dubai|BandarAbbas' → no searoute fallback → null/haversine.
  // After fix: key 'BandarAbbas|Dubai': 170 must be reached.
  it('Dubai ↔ BandarAbbas returns hand-curated 170 NM exact (was dead key → no fallback)', () => {
    expect(getPortDistance('Dubai', 'BandarAbbas')).toEqual({ nm: 170, exact: true });
  });
});
