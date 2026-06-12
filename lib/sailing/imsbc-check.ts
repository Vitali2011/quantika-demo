/**
 * IMSBC Code group lookup — structural per-cargo hazard classification.
 *
 * Group A: liquefaction risk — TML certificate required at loading;
 *          incompatible if vessel explicitly restricts liquefiable/Group A cargoes.
 * Group B: chemical hazard — IMDG class applies, special handling required.
 * Group C: neither Group A nor B — no special bulk-carrier restriction.
 * unknown: cargo not in the IMSBC table — neutral (not a block, not a caution).
 *
 * Design rules (mirror of l5c-matrix.ts):
 *   - Pure functions; no IO, no side effects. JSON loaded lazily once at first call.
 *   - Date-independent: verdict never depends on wall-clock.
 *   - Group alone is NOT an incompatibility (coal, iron ore ship constantly).
 *   - incompatible only when vessel explicitly restricts the cargo's hazard
 *     class: dangerous-goods carriage (Group B) or liquefiable/Group A
 *     cargoes (Group A, audit C.3).
 *   - unknown cargo → ok/neutral (fail-safe: no data ≠ can't carry).
 */

import type imsbcData from '../cargo/imsbc-groups.json';

type ImsbcGroup = 'A' | 'B' | 'C';

interface ImsbcEntry {
  group: ImsbcGroup;
  imoClass?: string;
  requirements?: string[];
}

export interface ImsbcLoadabilityResult {
  group: ImsbcGroup | 'unknown';
  imoClass?: string;
  verdict: 'ok' | 'caution' | 'incompatible';
  requirements: string[];
  rationale: string;
}

export interface VesselImsbcInfo {
  restrictions?: string[];
  specialFeatures?: string[];
}

// ── Taxonomy ──────────────────────────────────────────────────────────────────
// Maps lowercase variant/alias → canonical JSON key.
// Extend here when new cargo names appear in production data.
const TAXONOMY: Record<string, string> = {
  // coal variants
  'coking coal': 'coal',
  'thermal coal': 'coal',
  'steam coal': 'coal',
  'met coal': 'coal',
  'bituminous coal': 'coal',
  'sub-bituminous coal': 'coal',
  'coal fines': 'coal',
  // anthracite is its own entry
  // coke variants
  metcoke: 'met coke',
  'met coke': 'met coke',
  'metallurgical coke': 'met coke',
  coke: 'met coke',
  petcoke: 'petroleum coke',
  'pet coke': 'petroleum coke',
  'petroleum coke': 'petroleum coke',
  'delayed coke': 'petroleum coke',
  // coal tar pitch
  'coal-tar pitch': 'coal tar pitch',
  ctp: 'coal tar pitch',
  // iron ore & pellets
  'iron ore fines': 'iron ore',
  'iron ore concentrate': 'iron ore',
  'fe ore': 'iron ore',
  ironore: 'iron ore',
  'iron ore pellets': 'iron ore pellets',
  'iron pellets': 'iron ore pellets',
  'dr pellets': 'iron ore pellets',
  // DRI / HBI
  'direct reduced iron': 'dri',
  hbi: 'dri',
  'hot briquetted iron': 'dri',
  'sponge iron': 'dri',
  // concentrates
  'copper conc': 'copper concentrate',
  'cu concentrate': 'copper concentrate',
  'zinc conc': 'zinc concentrate',
  'lead conc': 'lead concentrate',
  'laterite nickel ore': 'nickel ore',
  saprolite: 'nickel ore',
  // grain
  maize: 'corn',
  soya: 'soybean',
  soyabean: 'soybean',
  'unpeeled rice': 'rice',
  'bagged rice': 'rice',
  'soya in bulk': 'soybean',
  'soybean meal': 'rapeseed meal', // NOT the same but similarly hazardous → conservative
  // steel & metals
  hrc: 'steel',
  'hr coils': 'steel',
  'cr coils': 'steel',
  billets: 'steel',
  slabs: 'steel',
  rebar: 'steel',
  rebars: 'steel',
  'wire rod': 'steel',
  'steel coils': 'steel',
  'steel plates': 'steel',
  'steel billets': 'steel',
  'steel slabs': 'steel',
  'steel sections': 'steel',
  'steel products': 'steel',
  'structural steel': 'steel',
  'pc strand': 'steel',
  'hot rolled coils': 'steel',
  'hot rolled steel coils': 'steel',
  'steel rebars': 'steel',
  'pig iron': 'pig iron',
  'cast iron': 'pig iron',
  // scrap
  hms: 'scrap',
  'heavy melting scrap': 'scrap',
  'shredded scrap': 'scrap',
  'steel scrap': 'scrap',
  'iron scrap': 'scrap',
  'stainless scrap': 'scrap',
  // cement/clinker
  opc: 'cement',
  'cement clinker': 'clinker',
  'portland cement': 'cement',
  // bauxite/alumina
  'bauxite ore': 'bauxite',
  'raw bauxite': 'bauxite',
  'calcined alumina': 'alumina',
  'aluminium oxide': 'alumina',
  // fertilizers
  fertilizers: 'fertilizer',
  'compound fertilizer': 'fertilizer',
  npk: 'fertilizer',
  'mixed fertilizer': 'fertilizer',
  'urea fertilizer': 'urea',
  'prilled urea': 'urea',
  'granular urea': 'urea',
  an: 'ammonium nitrate',
  can: 'ammonium nitrate',
  'calcium ammonium nitrate': 'ammonium nitrate',
  'ammonium nitrate fertilizer': 'ammonium nitrate',
  mop: 'potash',
  'muriate of potash': 'potash',
  sop: 'potash',
  'potassium chloride': 'potash',
  'dap fertilizer': 'dap',
  'diammonium phosphate': 'dap',
  'map fertilizer': 'map',
  'monoammonium phosphate': 'map',
  // phosphate / minerals
  'phosphate rock': 'rock phosphate',
  'phosphate ore': 'rock phosphate',
  'manganese ore': 'manganese ore',
  'mn ore': 'manganese ore',
  ilmenite: 'ilmenite',
  'titanium ore': 'ilmenite',
  fluorite: 'fluorspar',
  'calcium fluoride': 'fluorspar',
  // sulphur
  sulfur: 'sulphur',
  'elemental sulphur': 'sulphur',
  // rapeseed
  'rapeseed meal': 'rapeseed meal',
  'rapeseed expellers': 'rapeseed meal',
  'canola meal': 'rapeseed meal',
  'canola expellers': 'rapeseed meal',
  'rapeseed meal pellets': 'rapeseed meal',
  // seeds (NOT meal — seeds are Group C)
  canola: 'rapeseed',
  'canola seeds': 'rapeseed',
  'rapeseed seeds': 'rapeseed',
  // sunflower
  'sunflower seed': 'sunflower seeds',
  // olive
  'olive residue': 'olive pomace',
  'olive cake': 'olive pomace',
  // salt
  'dry salt': 'salt',
  'rock salt': 'salt',
  'industrial salt': 'salt',
  'sea salt': 'salt',
  // sugar
  'raw sugar': 'sugar',
  'refined sugar': 'sugar',
  'cane sugar': 'sugar',
  // misc
  'soda ash': 'soda ash',
  'sodium carbonate': 'soda ash',
  'dense soda ash': 'soda ash',
  'light soda ash': 'soda ash',
  'barium sulphate': 'barite',
  baryte: 'barite',
  'marble blocks': 'marble',
  'granite blocks': 'granite',
  'wood chips': 'woodchips',
  'wood pellets': 'wood pellets',
  kaolin: 'kaolin',
  'kaolin clay': 'kaolin',
  bentonite: 'bentonite',
  'calcium carbide': 'calcium carbide',
  ferrosilicon: 'ferrosilicon',
  'ferro silicon': 'ferrosilicon',
  'fish meal': 'fishmeal',
  'fish powder': 'fishmeal',
};

// Lazy-loaded cargo map
let _cargoes: Record<string, ImsbcEntry> | null = null;

function getCargoes(): Record<string, ImsbcEntry> {
  if (!_cargoes) {
     
    const data = require('../cargo/imsbc-groups.json') as typeof imsbcData;
    _cargoes = data.cargoes as unknown as Record<string, ImsbcEntry>;
  }
  return _cargoes;
}

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[,;:!?()\[\]]+/g, ' ')  // strip internal punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve raw cargo description to a canonical JSON key.
 * Tries: TAXONOMY alias → direct JSON key → prefix match on first 2 words.
 */
function resolveKey(desc: string): string | null {
  const norm = normalize(desc);

  // Exact taxonomy alias
  if (TAXONOMY[norm]) return TAXONOMY[norm];

  const cargoes = getCargoes();

  // Direct key match
  if (cargoes[norm]) return norm;

  // Check if any word/phrase in the description matches a taxonomy alias
  // Longest-match first: try 4-word then 3-word then 2-word substrings
  const words = norm.split(' ');
  for (let len = Math.min(4, words.length); len >= 2; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const phrase = words.slice(start, start + len).join(' ');
      if (TAXONOMY[phrase]) return TAXONOMY[phrase];
      if (cargoes[phrase]) return phrase;
    }
  }

  // Single-word match (last resort)
  for (const word of words) {
    if (word.length >= 4) {
      if (TAXONOMY[word]) return TAXONOMY[word];
      if (cargoes[word]) return word;
    }
  }

  return null;
}

// Vessel restriction patterns that indicate DG cargo is prohibited.
const DG_RESTRICTION_RE = /\bno\b.{0,40}(?:dg\b|dangerous\s+goods?\b|hazmat\b|hazardous\b|self[- ]heat(?:ing)?\b|group\s*b\b|class\s*[45]\b)/i;

// Vessel restriction patterns indicating IMSBC Group A (liquefaction-risk)
// cargoes are prohibited: "no concentrates", "no liquefiable cargoes",
// "no Group A", "no nickel ore", "no TML cargoes". (Audit C.3 — Group A
// previously never hard-blocked, even on explicitly restricted vessels.)
const GROUP_A_RESTRICTION_RE = /\bno\b.{0,40}(?:concentrates?\b|liquef\w+|group\s*a\b|nickel\s+ore\b|tml\b)/i;

/**
 * Check whether a cargo is loadable on a vessel per IMSBC Code.
 *
 * - Group C or unknown cargo → ok (no restriction).
 * - Group A → caution (TML certificate required) unless vessel explicitly
 *   restricts liquefiable/Group A cargoes → incompatible.
 * - Group B → caution unless vessel explicitly restricts DG → incompatible.
 */
export function checkImsbcLoadability(
  cargoDescription: string | null | undefined,
  vessel?: VesselImsbcInfo,
): ImsbcLoadabilityResult {
  const nullResult: ImsbcLoadabilityResult = {
    group: 'unknown',
    verdict: 'ok',
    requirements: [],
    rationale: 'cargo not identified — no IMSBC restriction applied',
  };

  if (!cargoDescription?.trim()) return nullResult;

  const key = resolveKey(cargoDescription);
  if (!key) return nullResult;

  const cargoes = getCargoes();
  const entry = cargoes[key];
  if (!entry) return nullResult;

  const { group, imoClass, requirements = [] } = entry;

  if (group === 'C') {
    return {
      group: 'C',
      verdict: 'ok',
      requirements: [],
      rationale: `IMSBC Group C — no special bulk-carrier restriction`,
    };
  }

  if (group === 'A') {
    const restrictions = vessel?.restrictions ?? [];
    if (restrictions.some((r) => GROUP_A_RESTRICTION_RE.test(r))) {
      return {
        group: 'A',
        verdict: 'incompatible',
        requirements,
        rationale: `IMSBC Group A (liquefaction risk) — vessel restrictions prohibit liquefiable/Group A cargoes`,
      };
    }
    return {
      group: 'A',
      verdict: 'caution',
      requirements,
      rationale: `IMSBC Group A (liquefaction risk) — TML certificate required before loading`,
    };
  }

  // Group B
  const restrictions = vessel?.restrictions ?? [];
  const hasDgRestriction = restrictions.some((r) => DG_RESTRICTION_RE.test(r));

  if (hasDgRestriction) {
    return {
      group: 'B',
      imoClass,
      verdict: 'incompatible',
      requirements,
      rationale: `IMSBC Group B (IMDG Class ${imoClass ?? 'chemical hazard'}) — vessel restrictions prohibit dangerous-goods carriage`,
    };
  }

  return {
    group: 'B',
    imoClass,
    verdict: 'caution',
    requirements,
    rationale: `IMSBC Group B (IMDG Class ${imoClass ?? 'chemical hazard'}) — special handling required`,
  };
}
