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
  'Karasu', 'Istanbul', 'Mykolaiv', 'Odesa', 'Constanta', 'Varna', 'Burgas', 'Novorossiysk',
  // Aegean / Eastern Med
  'Piraeus', 'Aliaga',
  // Central / Western Med
  'Alexandria', 'Ravenna', 'Skikda', 'Casablanca',
  // Atlantic
  'Bayonne',
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
  'odesa': 'Odesa',
  'odessa': 'Odesa',            // common English spelling
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
  // Mediterranean
  'alexandria': 'Alexandria',
  'ravenna': 'Ravenna',
  'skikda': 'Skikda',
  // Atlantic
  'casablanca': 'Casablanca',
  'bayonne': 'Bayonne',
  'bilbao': 'Bayonne',          // same Biscay region
  'biscay': 'Bayonne',
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
};

function stripCountry(raw: string): string {
  // Remove ", Country" or similar trailing qualifier
  return raw.split(',')[0].trim();
}

function stripParenthetical(raw: string): string {
  // "Bay of Biscay (Bayonne/Bilbao range)" → "Bay of Biscay"
  return raw.replace(/\([^)]*\)/g, '').trim();
}

function stripPortPrefix(raw: string): string {
  // "Port of Rotterdam" → "Rotterdam", "Pt. Klang" → "Klang"
  return raw.replace(/^(port of|port|pt\.?)\s+/i, '').trim();
}

function stripCountryCodeSuffix(raw: string): string {
  // "Novorossiysk RU" / "Rotterdam NL" → drop trailing 2-letter ISO code
  return raw.replace(/\s+[A-Z]{2}$/i, '').trim();
}

/**
 * Fuzzy fallback corpus: lazily built from PORT_ALIASES + KNOWN_PORTS so the
 * existing alias coverage is reused. Phase 5 will extend this corpus from
 * the JSON-backed port master (loadPortMasterFromJson exposes all canonical
 * names).
 */
let _fuzzyCorpus: { lookup: string; canonical: string }[] | null = null;

function getFuzzyCorpus(): { lookup: string; canonical: string }[] {
  if (_fuzzyCorpus) return _fuzzyCorpus;
  const seen = new Map<string, string>();
  for (const [alias, canonical] of Object.entries(PORT_ALIASES)) {
    seen.set(alias, canonical);
  }
  for (const p of KNOWN_PORTS) {
    seen.set(p.toLowerCase(), p);
  }
  _fuzzyCorpus = Array.from(seen.entries()).map(([lookup, canonical]) => ({ lookup, canonical }));
  return _fuzzyCorpus;
}

/** Test/runtime hook: allow Phase 5 to inject the JSON-loaded port-master corpus. */
export function _setFuzzyCorpusForTest(entries: Array<{ lookup: string; canonical: string }> | null): void {
  _fuzzyCorpus = entries;
}

// Lazy import of fuzzysort — avoid the eslint require ban while keeping the
// dependency optional at type-check time (Phase 5 will move to a real import).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fuzzysort = require('fuzzysort') as {
  go<T>(target: string, candidates: T[], opts: { key: keyof T; threshold?: number; limit?: number }): Array<{ obj: T; score: number }>;
};

/**
 * Normalize a free-form port name to its canonical form used in the distance table.
 * Returns null if the port is not recognized.
 *
 * Accepts:
 *   - Case variation: "karasu" / "KARASU" / "Karasu"
 *   - Country suffix: "Karasu, Turkey" / "Alexandria Egypt"
 *   - Parenthetical range: "Bay of Biscay (Bayonne/Bilbao range)" → Bayonne via alias
 *   - Legacy aliases: "Odessa" → "Odesa", "Efesan" → "Aliaga"
 */
export function normalizePortName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = stripCountry(stripParenthetical(raw)).trim();
  s = stripCountryCodeSuffix(s);
  s = stripPortPrefix(s);
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

  // Fuzzy fallback (typos, casing) — uses fuzzysort over alias + canonical
  // names. Threshold tuned empirically: -200 is conservative (rejects garbage
  // like "xyz123") while still catching single-letter typos in port names.
  const corpus = getFuzzyCorpus();
  const cleaned = s.toLowerCase();
  const results = fuzzysort.go(cleaned, corpus, { key: 'lookup', threshold: -200, limit: 1 });
  if (results.length > 0) {
    return results[0].obj.canonical;
  }

  return null;
}

/** Result of a port-pair distance lookup. */
export interface PortDistanceResult {
  /** Distance in nautical miles (rounded). */
  nm: number;
  /** True if from the hand-curated sea-route matrix; false if great-circle (haversine) fallback. */
  exact: boolean;
}

/**
 * Return nautical-mile distance between two ports.
 *
 * Resolution order:
 *   1. Same canonical port → { nm: 0, exact: true }
 *   2. Hardcoded sea-route matrix → { nm, exact: true }
 *   3. Haversine great-circle from getPortMaster lat/lon → { nm, exact: false }
 *   4. null (unknown port or no coords available)
 */
export function getPortDistance(
  from: string | null | undefined,
  to: string | null | undefined,
): PortDistanceResult | null {
  const a = normalizePortName(from);
  const b = normalizePortName(to);
  if (!a || !b) return null;
  if (a === b) return { nm: 0, exact: true };

  const [first, second] = [a, b].sort();
  const matrix = DISTANCES_NM[`${first}|${second}`];
  if (matrix != null) return { nm: matrix, exact: true };

  // Haversine fallback — needs lat/lon from port-master. Lazy import to avoid
  // a circular dependency between port-master.ts (which imports normalizePortName
  // from us) and this file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPortMaster } = require('./port-master') as typeof import('./port-master');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { haversineDistanceNm } = require('./haversine') as typeof import('./haversine');

  const pa = getPortMaster(a);
  const pb = getPortMaster(b);
  if (!pa || !pb) return null;
  if (pa.lat == null || pa.lon == null || pb.lat == null || pb.lon == null) return null;

  return { nm: haversineDistanceNm(pa.lat, pa.lon, pb.lat, pb.lon), exact: false };
}
