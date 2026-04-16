/**
 * Port-to-port sea distance table (nautical miles) for the demo-scope ports.
 *
 * Source of values: consensus distances from sea-distances.org / searates.com /
 * portworld.com for the main pairs. Figures are approximate, rounded to 5 NM
 * for readability — accurate enough to compute ETA within ±6h for a handysize
 * at 12-13 knots (well within the granularity of a laycan window).
 *
 * Deliberately only includes ports that appear in the demo sample-data. Unknown
 * ports return `null`, which downstream code treats as "unknown readiness" — the
 * match is not filtered, just not credited/penalized. This fails gracefully.
 */

/** Canonical port names used as map keys. */
export const KNOWN_PORTS = [
  // Black Sea
  'Karasu', 'Istanbul', 'Mykolaiv', 'Odesa', 'Chornomorsk', 'Constanta', 'Varna', 'Burgas', 'Novorossiysk',
  // Aegean / Eastern Med
  'Piraeus', 'Aliaga', 'Marmara',
  // Eastern Med / Suez
  'Alexandria', 'Suez',
  // Central / Western Med
  'Ravenna', 'Marghera', 'Skikda', 'Casablanca',
  // Northern Europe
  'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk',
  // Atlantic
  'Bayonne', 'Dakar', 'Lagos', 'Nacala',
  // Americas
  'Veracruz', 'NewOrleans', 'Houston', 'Santos',
  // Asia
  'Singapore', 'Tokyo', 'Shanghai',
] as const;

export type KnownPort = typeof KNOWN_PORTS[number];

/**
 * Aliases map alternative spellings / former names / range phrasing to canonical.
 * Keys must be lowercase; values must be elements of KNOWN_PORTS.
 */
const PORT_ALIASES: Record<string, KnownPort> = {
  // Black Sea
  'karasu': 'Karasu',
  'istanbul': 'Istanbul',
  'ambarli': 'Istanbul',        // port of Istanbul
  'tuzla': 'Istanbul',
  'mykolaiv': 'Mykolaiv',
  'nikolaev': 'Mykolaiv',       // former Russian name
  'mykolayiv': 'Mykolaiv',
  'odesa': 'Odesa',
  'odessa': 'Odesa',            // common English spelling
  'chornomorsk': 'Chornomorsk',
  'chernomorsk': 'Chornomorsk',
  'ilichivsk': 'Chornomorsk',   // former name
  'illichivsk': 'Chornomorsk',
  'constanta': 'Constanta',
  'constantza': 'Constanta',
  'konstanta': 'Constanta',
  'varna': 'Varna',
  'burgas': 'Burgas',
  'bourgas': 'Burgas',
  'novorossiysk': 'Novorossiysk',
  'novorossiisk': 'Novorossiysk',
  // Aegean
  'piraeus': 'Piraeus',
  'pireus': 'Piraeus',
  'aliaga': 'Aliaga',
  'efesan': 'Aliaga',           // Efesan terminal in Aliaga bay
  'izmir': 'Aliaga',            // izmir bay — use Aliaga as proxy
  'marmara': 'Marmara',
  'marmara island': 'Marmara',
  'bandirma': 'Marmara',        // same Sea of Marmara region
  // Eastern Med / Suez
  'alexandria': 'Alexandria',
  'el dekheila': 'Alexandria',  // Alexandria El Dekheila terminal
  'eldekheila': 'Alexandria',
  'dekheila': 'Alexandria',
  'suez': 'Suez',
  'port suez': 'Suez',
  // Mediterranean
  'ravenna': 'Ravenna',
  'marghera': 'Marghera',
  'porto marghera': 'Marghera',
  'venice': 'Marghera',         // Venice/Marghera — same port complex
  'venezia': 'Marghera',
  'skikda': 'Skikda',
  // Atlantic / Northern Europe
  'casablanca': 'Casablanca',
  'antwerp': 'Antwerp',
  'port of antwerp': 'Antwerp',
  'hamburg': 'Hamburg',
  'rotterdam': 'Rotterdam',
  'bremen': 'Bremen',
  'bremerhaven': 'Bremen',      // same port region
  'halsvik': 'Halsvik',
  'gdansk': 'Gdansk',
  'danzig': 'Gdansk',
  'gdynia': 'Gdansk',           // nearby Polish port
  'bayonne': 'Bayonne',
  'bilbao': 'Bayonne',          // same Biscay region
  'biscay': 'Bayonne',
  // West Africa
  'dakar': 'Dakar',
  'lagos': 'Lagos',
  'apapa': 'Lagos',             // Lagos Apapa terminal
  'nacala': 'Nacala',
  // Americas
  'veracruz': 'Veracruz',
  'new orleans': 'NewOrleans',
  'neworleans': 'NewOrleans',
  'houston': 'Houston',
  'santos': 'Santos',
  'sao paulo': 'Santos',        // Santos is SP's port
  // Asia
  'singapore': 'Singapore',
  'tokyo': 'Tokyo',
  'yokohama': 'Tokyo',          // same Tokyo Bay port complex
  'shanghai': 'Shanghai',
};

/**
 * Sparse distance table: key is "PortA|PortB" sorted alphabetically.
 * Missing pairs → null (graceful degradation).
 * Values in nautical miles.
 */
const DISTANCES_NM: Record<string, number> = {
  // ── Black Sea cluster ──
  'Istanbul|Karasu': 95,
  'Karasu|Mykolaiv': 315,
  'Karasu|Odesa': 315,
  'Constanta|Karasu': 260,
  'Karasu|Varna': 205,
  'Burgas|Karasu': 180,
  'Karasu|Novorossiysk': 400,

  'Istanbul|Mykolaiv': 415,
  'Mykolaiv|Odesa': 85,
  'Constanta|Mykolaiv': 260,
  'Mykolaiv|Varna': 330,
  'Burgas|Mykolaiv': 370,
  'Mykolaiv|Novorossiysk': 440,

  'Istanbul|Odesa': 370,
  'Constanta|Odesa': 180,
  'Odesa|Varna': 290,
  'Burgas|Odesa': 330,
  'Novorossiysk|Odesa': 490,

  'Constanta|Istanbul': 200,
  'Constanta|Varna': 90,
  'Burgas|Constanta': 130,
  'Constanta|Novorossiysk': 460,

  'Burgas|Varna': 70,
  'Istanbul|Varna': 185,
  'Burgas|Istanbul': 150,

  'Istanbul|Novorossiysk': 480,
  'Burgas|Novorossiysk': 580,
  'Novorossiysk|Varna': 500,

  // ── Bosphorus → Aegean / Eastern Med ──
  'Istanbul|Piraeus': 430,
  'Aliaga|Istanbul': 275,
  'Alexandria|Istanbul': 870,
  'Istanbul|Ravenna': 1050,
  'Istanbul|Skikda': 1330,
  'Casablanca|Istanbul': 2200,
  'Bayonne|Istanbul': 2900,

  // ── Black Sea → Med (via Bosphorus; approximate transits) ──
  'Karasu|Piraeus': 525,
  'Aliaga|Karasu': 370,
  'Alexandria|Karasu': 965,
  'Karasu|Ravenna': 1145,
  'Karasu|Skikda': 1425,

  'Mykolaiv|Piraeus': 845,
  'Aliaga|Mykolaiv': 690,
  'Alexandria|Mykolaiv': 1285,
  'Mykolaiv|Ravenna': 1465,

  'Odesa|Piraeus': 800,
  'Aliaga|Odesa': 645,
  'Alexandria|Odesa': 1240,

  'Constanta|Piraeus': 630,
  'Aliaga|Constanta': 475,
  'Alexandria|Constanta': 1070,
  'Constanta|Ravenna': 1250,

  // ── Aegean internal ──
  'Aliaga|Piraeus': 185,
  'Alexandria|Piraeus': 560,
  'Piraeus|Ravenna': 700,
  'Piraeus|Skikda': 900,
  'Casablanca|Piraeus': 1750,
  'Bayonne|Piraeus': 2500,

  'Aliaga|Alexandria': 620,
  'Aliaga|Ravenna': 910,
  'Aliaga|Skikda': 1130,

  // ── Mediterranean proper ──
  'Alexandria|Ravenna': 1150,
  'Alexandria|Skikda': 1350,
  'Alexandria|Casablanca': 2100,
  'Alexandria|Bayonne': 2900,

  'Ravenna|Skikda': 770,
  'Casablanca|Ravenna': 1600,
  'Bayonne|Ravenna': 1800,

  'Casablanca|Skikda': 700,
  'Bayonne|Skikda': 1500,

  // ── Atlantic ──
  'Bayonne|Casablanca': 900,

  // ── Chornomorsk (Black Sea, near Odesa) ──
  'Chornomorsk|Odesa': 25,
  'Chornomorsk|Mykolaiv': 75,
  'Chornomorsk|Constanta': 160,
  'Chornomorsk|Karasu': 305,
  'Chornomorsk|Istanbul': 355,
  'Chornomorsk|Varna': 270,
  'Chornomorsk|Burgas': 310,
  'Chornomorsk|Novorossiysk': 470,
  'Chornomorsk|Piraeus': 790,
  'Chornomorsk|Aliaga': 635,
  'Chornomorsk|Alexandria': 1230,
  'Chornomorsk|Ravenna': 1445,
  'Chornomorsk|Skikda': 1700,

  // ── Marmara (Sea of Marmara) ──
  'Istanbul|Marmara': 70,
  'Karasu|Marmara': 160,
  'Marmara|Piraeus': 360,
  'Aliaga|Marmara': 205,
  'Alexandria|Marmara': 800,
  'Marmara|Mykolaiv': 485,
  'Constanta|Marmara': 270,
  'Marmara|Odesa': 440,

  // ── Suez (southern end of Suez Canal) ──
  'Alexandria|Suez': 200,
  'Suez|Piraeus': 760,
  'Aliaga|Suez': 820,
  'Istanbul|Suez': 1070,
  'Karasu|Suez': 1165,
  'Mykolaiv|Suez': 1485,
  'Odesa|Suez': 1440,
  'Constanta|Suez': 1270,
  'Ravenna|Suez': 1350,
  'Marghera|Suez': 1370,
  'Skikda|Suez': 1550,
  'Casablanca|Suez': 2300,

  // ── Marghera / Venice (Northern Adriatic) ──
  'Marghera|Ravenna': 90,
  'Istanbul|Marghera': 1060,
  'Karasu|Marghera': 1155,
  'Mykolaiv|Marghera': 1475,
  'Odesa|Marghera': 1430,
  'Chornomorsk|Marghera': 1455,
  'Constanta|Marghera': 1260,
  'Piraeus|Marghera': 710,
  'Aliaga|Marghera': 920,
  'Alexandria|Marghera': 1160,
  'Casablanca|Marghera': 1650,
  'Bayonne|Marghera': 1830,
  'Skikda|Marghera': 780,

  // ── Northern Europe cluster ──
  'Antwerp|Hamburg': 310,
  'Antwerp|Rotterdam': 80,
  'Bremen|Hamburg': 130,
  'Antwerp|Bremen': 260,
  'Rotterdam|Hamburg': 250,
  'Rotterdam|Bremen': 230,
  'Antwerp|Gdansk': 810,
  'Hamburg|Gdansk': 570,
  'Rotterdam|Gdansk': 760,
  'Antwerp|Halsvik': 930,
  'Hamburg|Halsvik': 700,
  'Rotterdam|Halsvik': 900,
  'Bremen|Gdansk': 510,
  'Gdansk|Halsvik': 840,
  'Bremen|Halsvik': 650,

  // Northern Europe ↔ Med / Atlantic
  'Antwerp|Bayonne': 730,
  'Antwerp|Casablanca': 1400,
  'Hamburg|Casablanca': 1700,
  'Rotterdam|Casablanca': 1450,
  'Antwerp|Skikda': 2100,
  'Antwerp|Ravenna': 2350,
  'Antwerp|Marghera': 2360,
  'Antwerp|Piraeus': 2820,
  'Hamburg|Piraeus': 2950,
  'Antwerp|Alexandria': 3380,
  'Hamburg|Alexandria': 3500,
  'Rotterdam|Piraeus': 2850,
  'Rotterdam|Alexandria': 3400,
  'Antwerp|Suez': 3580,
  'Hamburg|Suez': 3700,

  // Northern Europe ↔ Black Sea
  'Antwerp|Istanbul': 3300,
  'Hamburg|Istanbul': 3430,
  'Rotterdam|Istanbul': 3330,
  'Antwerp|Constanta': 3680,
  'Antwerp|Odesa': 3870,
  'Antwerp|Mykolaiv': 3950,
  'Hamburg|Constanta': 3800,
  'Gdansk|Istanbul': 3050,
  'Halsvik|Istanbul': 3950,

  // ── West Africa ──
  'Casablanca|Dakar': 1400,
  'Bayonne|Dakar': 2000,
  'Antwerp|Dakar': 3300,
  'Hamburg|Dakar': 3600,
  'Dakar|Lagos': 2400,
  'Casablanca|Lagos': 3500,
  'Dakar|Nacala': 5600,
  'Lagos|Nacala': 3800,
  'Alexandria|Dakar': 4500,
  'Piraeus|Dakar': 4100,

  // ── Americas ──
  'Casablanca|Veracruz': 4400,
  'Bayonne|Veracruz': 4900,
  'Antwerp|Veracruz': 5200,
  'Hamburg|Veracruz': 5400,
  'Houston|Veracruz': 680,
  'NewOrleans|Veracruz': 600,
  'Houston|NewOrleans': 400,
  'Houston|Santos': 5700,
  'NewOrleans|Santos': 5400,
  'Santos|Veracruz': 6100,
  'Dakar|Santos': 4200,
  'Casablanca|Santos': 5500,
  'Antwerp|Santos': 5800,
  'Hamburg|Santos': 6000,
  'Dakar|Veracruz': 4700,
  'Dakar|Houston': 5500,
  'Dakar|NewOrleans': 5200,

  // ── Asia ──
  'Singapore|Tokyo': 3300,
  'Shanghai|Tokyo': 1100,
  'Shanghai|Singapore': 2200,
  'Suez|Singapore': 5200,
  'Suez|Shanghai': 7100,
  'Suez|Tokyo': 8200,
  'Antwerp|Singapore': 9800,
  'Hamburg|Singapore': 9900,
  'Rotterdam|Singapore': 9820,
  'Alexandria|Singapore': 5400,
  'Piraeus|Singapore': 5800,
  'Piraeus|Shanghai': 7600,
  'Piraeus|Tokyo': 8700,
  'Nacala|Singapore': 4000,
  'Nacala|Shanghai': 5800,
  'Lagos|Singapore': 7600,
  'Houston|Singapore': 10800,
  'Veracruz|Singapore': 10500,
  'Santos|Singapore': 11500,
};

/**
 * Approximate port coordinates (lat/lon) for haversine fallback.
 * Used when a port pair is not in the static DISTANCES_NM table.
 * Values are representative anchors for the port / port complex.
 */
const PORT_COORDS: Record<KnownPort, { lat: number; lon: number }> = {
  // Black Sea
  Karasu:        { lat: 41.12, lon: 30.68 },
  Istanbul:      { lat: 41.01, lon: 28.98 },
  Mykolaiv:      { lat: 46.97, lon: 31.99 },
  Odesa:         { lat: 46.49, lon: 30.74 },
  Chornomorsk:   { lat: 46.30, lon: 30.66 },
  Constanta:     { lat: 44.18, lon: 28.65 },
  Varna:         { lat: 43.20, lon: 27.92 },
  Burgas:        { lat: 42.49, lon: 27.47 },
  Novorossiysk:  { lat: 44.72, lon: 37.77 },
  // Aegean / Eastern Med
  Piraeus:       { lat: 37.94, lon: 23.62 },
  Aliaga:        { lat: 38.80, lon: 26.97 },
  Marmara:       { lat: 40.62, lon: 27.59 },
  // Eastern Med / Suez
  Alexandria:    { lat: 31.20, lon: 29.89 },
  Suez:          { lat: 29.97, lon: 32.55 },
  // Central / Western Med
  Ravenna:       { lat: 44.42, lon: 12.20 },
  Marghera:      { lat: 45.45, lon: 12.23 },
  Skikda:        { lat: 36.88, lon: 6.90  },
  Casablanca:    { lat: 33.60, lon: -7.62 },
  // Northern Europe
  Antwerp:       { lat: 51.23, lon: 4.40  },
  Hamburg:       { lat: 53.55, lon: 9.99  },
  Rotterdam:     { lat: 51.90, lon: 4.48  },
  Bremen:        { lat: 53.07, lon: 8.80  },
  Halsvik:       { lat: 59.76, lon: 5.44  },
  Gdansk:        { lat: 54.35, lon: 18.65 },
  // Atlantic
  Bayonne:       { lat: 43.49, lon: -1.47 },
  Dakar:         { lat: 14.69, lon: -17.44 },
  Lagos:         { lat: 6.45,  lon: 3.40  },
  Nacala:        { lat: -14.54, lon: 40.67 },
  // Americas
  Veracruz:      { lat: 19.20, lon: -96.13 },
  NewOrleans:    { lat: 29.95, lon: -90.07 },
  Houston:       { lat: 29.75, lon: -95.27 },
  Santos:        { lat: -23.95, lon: -46.33 },
  // Asia
  Singapore:     { lat: 1.26,  lon: 103.82 },
  Tokyo:         { lat: 35.45, lon: 139.77 },
  Shanghai:      { lat: 31.23, lon: 121.47 },
};

/**
 * Haversine great-circle distance in nautical miles between two lat/lon points.
 */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const EARTH_RADIUS_NM = 3440.065;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/** Sea-route multiplier: real ship routes average ~25% longer than great-circle. */
const SEA_ROUTE_MULTIPLIER = 1.25;

function stripCountry(raw: string): string {
  // Remove ", Country" or similar trailing qualifier
  return raw.split(',')[0].trim();
}

function stripParenthetical(raw: string): string {
  // "Bay of Biscay (Bayonne/Bilbao range)" → "Bay of Biscay"
  // Also strips parenthetical country codes like "(EG)" or "(TR)"
  return raw.replace(/\([^)]*\)/g, '').trim();
}

function stripPortPrefix(raw: string): string {
  // "Port of Antwerp" → "Antwerp", "Port Hamburg" → "Hamburg"
  return raw.replace(/^port\s+of\s+/i, '').replace(/^port\s+/i, '').trim();
}

/**
 * Normalize a free-form port name to its canonical form used in the distance table.
 * Returns null if the port is not recognized.
 *
 * Accepts:
 *   - Case variation: "karasu" / "KARASU" / "Karasu"
 *   - Country suffix: "Karasu, Turkey" / "Alexandria Egypt"
 *   - Parenthetical range: "Bay of Biscay (Bayonne/Bilbao range)" → Bayonne via alias
 *   - Parenthetical country codes: "Alexandria (EG)" → Alexandria
 *   - "Port of" prefix: "Port of Antwerp, Belgium" → Antwerp
 *   - Legacy aliases: "Odessa" → "Odesa", "Efesan" → "Aliaga", "Nikolaev" → "Mykolaiv"
 *   - Partial substring fallback: tries longest alias key that appears in the input
 */
export function normalizePortName(raw: string | null | undefined): KnownPort | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = stripPortPrefix(stripCountry(stripParenthetical(raw))).trim();
  if (!s) return null;

  // Direct lowercase alias lookup
  const direct = PORT_ALIASES[s.toLowerCase()];
  if (direct) return direct;

  // Try each word/segment separately (handles "Bay of Biscay Bayonne" or "Izmir/Aliaga")
  const parts = s.split(/[\s/()\-,]+/).filter(Boolean);
  for (const part of parts) {
    const hit = PORT_ALIASES[part.toLowerCase()];
    if (hit) return hit;
  }

  // Partial substring fallback: find the longest alias key that appears in the input
  const lc = s.toLowerCase();
  let bestKey = '';
  let bestPort: KnownPort | null = null;
  for (const [key, port] of Object.entries(PORT_ALIASES)) {
    if (lc.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestPort = port;
    }
  }
  if (bestPort) return bestPort;

  return null;
}

/**
 * Return nautical-mile distance between two ports, or null if either is unknown.
 *
 * Resolution order:
 *   1. Static DISTANCES_NM table (human-curated, accounts for real sea routing).
 *   2. Haversine great-circle × SEA_ROUTE_MULTIPLIER (1.25) using PORT_COORDS.
 *   3. null — if coordinates are missing for either port.
 */
export function getPortDistance(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = normalizePortName(from);
  const b = normalizePortName(to);
  if (!a || !b) return null;
  if (a === b) return 0;

  // 1. Prefer static table (human-curated, accounts for real routing)
  const [first, second] = [a, b].sort();
  const key = `${first}|${second}`;
  const staticDist = DISTANCES_NM[key];
  if (staticDist != null) return staticDist;

  // 2. Fall back to haversine × 1.25 using coordinates
  const coordsA = PORT_COORDS[a];
  const coordsB = PORT_COORDS[b];
  if (!coordsA || !coordsB) return null;
  const greatCircle = haversineNm(coordsA.lat, coordsA.lon, coordsB.lat, coordsB.lon);
  return Math.round(greatCircle * SEA_ROUTE_MULTIPLIER);
}
