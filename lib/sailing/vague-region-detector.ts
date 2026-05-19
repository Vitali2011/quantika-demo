/**
 * Vague-region detector for readiness-gap UX.
 *
 * When a vessel.openPosition or cargo.originPort is a broad geographic
 * descriptor (e.g. "East Coast Greece", "Red Sea", "Aegean Sea", "Tunisia")
 * rather than a specific port, distance lookup returns null and readiness
 * verdict becomes 'unknown' with a generic "insufficient data" explanation.
 *
 * Brokers hate that — they don't know whether to push for more info or move
 * on. This detector identifies such regions and produces an actionable
 * suggestion ("ask owner for specific anchorage").
 *
 * IMPORTANT: detection MUST NOT trip on anything already resolved by
 * normalizePortName (PORT_ALIASES + fuzzy fallback). The caller checks
 * `distanceNm == null` before calling this — so if the input resolved, the
 * caller never enters this branch in the first place.
 */

import { normalizePortName } from './port-distances';

export interface VagueRegionResult {
  vague: boolean;
  /** Short label for the detected pattern (e.g. "coast descriptor", "sea name"). */
  pattern?: string;
  /** Actionable hint to surface to the broker. */
  suggestion?: string;
}

/** Generic sea-basin names (alone or with "Sea"/"Ocean" suffix) — too broad. */
const SEA_NAMES = [
  'red sea', 'black sea', 'aegean sea', 'aegean', 'adriatic sea', 'adriatic',
  'caspian sea', 'caspian', 'baltic sea', 'baltic', 'north sea',
  'mediterranean sea', 'mediterranean', 'med',
  'atlantic ocean', 'atlantic', 'pacific ocean', 'pacific', 'indian ocean',
  'arabian sea', 'persian gulf', 'arabian gulf',
  'east china sea', 'south china sea', 'yellow sea', 'sea of japan',
  'norwegian sea', 'barents sea', 'irish sea', 'celtic sea',
  'tyrrhenian sea', 'ionian sea', 'ligurian sea', 'alboran sea',
];

/** Country names that brokers often use as "loose origin" without a port. */
const VAGUE_COUNTRIES = [
  'tunisia', 'greece', 'italy', 'turkey', 'turkiye', 'spain', 'france',
  'morocco', 'algeria', 'libya', 'egypt', 'israel', 'lebanon', 'syria',
  'russia', 'ukraine', 'romania', 'bulgaria', 'georgia',
  'germany', 'netherlands', 'belgium', 'denmark', 'sweden', 'norway', 'finland',
  'poland', 'estonia', 'latvia', 'lithuania', 'uk', 'united kingdom', 'ireland', 'portugal',
  'usa', 'united states', 'us', 'canada', 'mexico', 'brazil', 'argentina', 'chile',
  'china', 'japan', 'korea', 'south korea', 'taiwan', 'vietnam', 'thailand',
  'malaysia', 'indonesia', 'philippines', 'india', 'pakistan', 'sri lanka',
  'south africa', 'kenya', 'tanzania', 'nigeria', 'ghana', 'senegal',
  'saudi arabia', 'uae', 'oman', 'yemen', 'iran', 'iraq', 'jordan',
  'australia', 'new zealand',
];

/** Regex patterns for compass + coast / range / area descriptors. */
const COAST_RX = /\b(east|west|north|south|north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|ne|nw|se|sw)\s+coast\b/i;
const RANGE_RX = /\b(range|cluster|area|region|basin|gulf)\b/i;
const GULF_OF_RX = /\bgulf of\b/i;

function lcTrim(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Detect whether `portName` is a vague geographic region rather than a port.
 *
 * Pre-conditions:
 *   - Caller has already tried normalizePortName() and got null (distance
 *     unknown). This function is only meaningful in that branch.
 *
 * Returns vague=false when:
 *   - input is null/empty
 *   - input resolves via normalizePortName (legitimate hint — should never
 *     reach here, but guarded for safety)
 *
 * Returns vague=true with pattern + suggestion when input matches one of:
 *   1. Compass + Coast      — "East Coast Greece"
 *   2. Sea name             — "Red Sea", "Aegean Sea", "Sea of X"
 *   3. Country alone        — "Tunisia", "Greece"
 *   4. Region descriptor    — "X Range", "X Cluster", "X Area"
 *   5. Gulf of X (generic)  — "Gulf of Aden" (unless aliased)
 */
export function isVagueRegion(portName: string | null | undefined): VagueRegionResult {
  if (!portName || typeof portName !== 'string') return { vague: false };
  const trimmed = portName.trim();
  if (!trimmed) return { vague: false };

  // Safety: if it resolves to a known port via the existing pipeline, NOT vague.
  // This protects "Marmara", "Marmara Sea", "Bay of Biscay", "Biscay" etc.
  if (normalizePortName(trimmed)) return { vague: false };

  const lc = lcTrim(trimmed);

  // Pattern 1: Compass + Coast (e.g. "East Coast Greece", "West Coast Africa")
  if (COAST_RX.test(lc)) {
    return {
      vague: true,
      pattern: 'coast descriptor',
      suggestion: `'${trimmed}' is a coastal range, not a specific port. Ask for a specific anchorage or load port.`,
    };
  }

  // Pattern 2: Sea names — exact match or "Sea of X" / "X Sea"
  if (SEA_NAMES.includes(lc)) {
    return {
      vague: true,
      pattern: 'sea name',
      suggestion: `'${trimmed}' is a sea/basin, not a port. Ask for a specific load/discharge port.`,
    };
  }
  if (/\bsea of\b/i.test(lc)) {
    return {
      vague: true,
      pattern: 'sea name',
      suggestion: `'${trimmed}' is a sea/basin, not a port. Ask for a specific load/discharge port.`,
    };
  }
  // Trailing "Sea" or "Ocean" not handled above (e.g. "Tasman Sea", "Solomon Sea")
  if (/\b(sea|ocean)\b\s*$/i.test(lc) && !normalizePortName(trimmed)) {
    return {
      vague: true,
      pattern: 'sea name',
      suggestion: `'${trimmed}' looks like a sea/basin, not a port. Ask for a specific load/discharge port.`,
    };
  }

  // Pattern 3: Country alone (no further qualifier)
  if (VAGUE_COUNTRIES.includes(lc)) {
    return {
      vague: true,
      pattern: 'country only',
      suggestion: `'${trimmed}' is a country, not a port. Ask for the specific load/discharge port.`,
    };
  }

  // Pattern 4: Region descriptors — "X Range", "X Cluster", "X Area", "X Region", "X Basin"
  if (RANGE_RX.test(lc)) {
    return {
      vague: true,
      pattern: 'region descriptor',
      suggestion: `'${trimmed}' is a region, not a specific port. Ask for the specific anchorage or load port.`,
    };
  }

  // Pattern 5: Generic "Gulf of X" without resolution
  if (GULF_OF_RX.test(lc)) {
    return {
      vague: true,
      pattern: 'gulf descriptor',
      suggestion: `'${trimmed}' is a gulf, not a port. Ask for the specific port within the gulf.`,
    };
  }

  return { vague: false };
}
