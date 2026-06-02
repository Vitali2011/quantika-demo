/**
 * Voyage/trading restriction parser and checker.
 *
 * Parses free-text vessel restrictions for region exclusions and determines
 * whether a port falls within an excluded region.
 * Hard exclusions ("no X", "X excl") block the match.
 * Soft preferences ("not prefer X", "prefer not X") surface as flags, not blocks.
 */

import { normalizePortName } from './port-distances';
import { getPortRegion, PortRegion } from './port-regions';

export interface VoyageExclusion {
  region: string;
  hard: boolean;
}

/**
 * Region keyword normalization — maps common abbreviations/variants to canonical keys.
 * Case-insensitive matching is applied before lookup.
 */
const REGION_ALIASES: Record<string, string> = {
  'european': 'europe',
  'europe': 'europe',
  'ukraine': 'ukraine',
  'ukrainian': 'ukraine',
  'russia': 'russia',
  'russian': 'russia',
  'black sea': 'black sea',
  'blacksea': 'black sea',
  'black-sea': 'black sea',
  'mediterranean': 'mediterranean',
  'med': 'mediterranean',
  'africa': 'africa',
  'african': 'africa',
};

/**
 * Region → set of canonical port names.
 * Ports are KnownPort values (from port-distances.ts).
 */
const REGION_PORTS: Record<string, string[]> = {
  'europe': [
    // Northern Europe
    'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk', 'Bayonne',
    'Felixstowe', 'Southampton', 'Liverpool', 'LeHavre', 'Dunkirk', 'Zeebrugge',
    'Aarhus', 'Goteborg', 'Helsinki', 'Tallinn', 'Haugesund', 'Birkenhead', 'Greenore',
    // Mediterranean (European / near-European)
    'Piraeus', 'Aliaga', 'Marmara', 'Derince', 'Antalya', 'Mersin', 'Iskenderun',
    'Ravenna', 'Marghera', 'Genoa', 'LaSpezia', 'Livorno', 'Naples', 'Trieste',
    'Barcelona', 'Valencia', 'Algeciras', 'Gibraltar', 'Marseille',
    'Izmir', 'Vasto', 'Savona', 'Vado Ligure',
    // Black Sea — European / Western countries
    'Istanbul', 'Karasu',                         // Turkey (straddles Europe/Asia; excluded from route by "european" restriction)
    'Mykolaiv', 'Odesa', 'Chornomorsk', 'Izmail', 'Yuzhny',  // Ukraine
    'Constanta',                                  // Romania
    'Varna', 'Burgas',                            // Bulgaria
    // Atlantic European
    'Casablanca', 'Tangier', 'Figueira da Foz',
  ],
  'ukraine': [
    'Mykolaiv', 'Odesa', 'Chornomorsk', 'Izmail', 'Yuzhny',
  ],
  'russia': [
    'Novorossiysk', 'Taman', 'Tuapse',
  ],
  'black sea': [
    'Karasu', 'Istanbul', 'Mykolaiv', 'Odesa', 'Chornomorsk', 'Constanta',
    'Varna', 'Burgas', 'Novorossiysk', 'Taman', 'Tuapse', 'Izmail', 'Yuzhny',
  ],
  'mediterranean': [
    'Piraeus', 'Aliaga', 'Marmara', 'Derince', 'Antalya', 'Mersin', 'Iskenderun',
    'Alexandria', 'Tartus', 'Ravenna', 'Marghera', 'Skikda', 'Genoa', 'LaSpezia',
    'Livorno', 'Naples', 'Trieste', 'Barcelona', 'Valencia', 'Algeciras', 'Gibraltar',
    'Marseille', 'Tunis', 'Izmir', 'Damietta', 'Bizerte', 'Bejaia', 'Vasto',
    'Trapani', 'Pozzallo', 'Savona', 'Vado Ligure',
  ],
  'africa': [
    'Skikda', 'Alexandria', 'Tunis', 'Damietta', 'Bizerte', 'Bejaia',
    'Casablanca', 'Tangier', 'Dakar', 'Lagos', 'Nacala', 'Abidjan', 'Lome',
    'Durban', 'CapeTown', 'Mombasa', 'Conakry', 'Djibouti', 'Aden',
  ],
};

/**
 * Patterns for hard exclusions: "no <region>", "<region> excl", "no <region> ports/voyage".
 * Case-insensitive.
 */
const HARD_PATTERNS = [
  /\bno\s+(\w[\w\s-]*?)\s+(?:ports?|voyage|voyages?|trade|trading|area)\b/i,
  /\bno\s+(\w[\w\s-]*?)\s*$/i,    // "no ukraine" at end
  /\b(\w[\w\s-]*?)\s+excl(?:uded|usion)?\b/i,
];

/**
 * Patterns for soft preferences: "not prefer", "prefer not", "try to avoid".
 * Case-insensitive.
 */
const SOFT_PATTERNS = [
  /\bnot\s+prefer\s+(\w[\w\s-]*?)\s+(?:ports?|voyage|voyages?|trade|trading|area)\b/i,
  /\bprefer\s+not\s+(\w[\w\s-]*?)\s+(?:ports?|voyage|voyages?)\b/i,
  /\btry\s+(?:to\s+)?avoid\s+(\w[\w\s-]*?)\s*(?:ports?|voyage|area)?\b/i,
];

function normalizeRegionKeyword(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (REGION_ALIASES[s]) return REGION_ALIASES[s];
  // Try two-word phrases
  for (const [alias, canonical] of Object.entries(REGION_ALIASES)) {
    if (s.includes(alias)) return canonical;
  }
  return null;
}

/**
 * Parse free-text vessel restrictions into structured voyage exclusions.
 * Returns only entries where we can identify a recognized region.
 * Non-voyage restrictions (DG, gear, etc.) are silently skipped.
 */
export function parseVoyageExclusions(restrictions: unknown[]): VoyageExclusion[] {
  const results: VoyageExclusion[] = [];
  for (const r of restrictions) {
    // Guard: skip non-string entries (ConfidenceField objects, nulls, etc. from dirty data)
    if (typeof r !== 'string') continue;
    const s = r.toLowerCase();

    // Try hard patterns first
    let found = false;
    for (const pat of HARD_PATTERNS) {
      const m = s.match(pat);
      if (m) {
        const region = normalizeRegionKeyword(m[1]);
        if (region) {
          results.push({ region, hard: true });
          found = true;
          break;
        }
      }
    }
    if (found) continue;

    // Try soft patterns
    for (const pat of SOFT_PATTERNS) {
      const m = s.match(pat);
      if (m) {
        const region = normalizeRegionKeyword(m[1]);
        if (region) {
          results.push({ region, hard: false });
          break;
        }
      }
    }
  }
  return results;
}

/**
 * Checks whether a port name falls within an excluded region.
 * Uses canonical port name lookup + port region map.
 */
export function regionMatchesPort(region: string, port: string | null | undefined): boolean {
  if (!port) return false;

  // First try canonical port name lookup from REGION_PORTS
  const canonical = normalizePortName(port);
  const regionPorts = REGION_PORTS[region];
  if (canonical && regionPorts) {
    if (regionPorts.includes(canonical)) return true;
  }

  // Fallback: check port region from port-regions.ts
  const portRegion = getPortRegion(port);
  if (!portRegion) return false;

  const regionToPortRegions: Record<string, PortRegion[]> = {
    'europe': ['NorthernEurope', 'Mediterranean', 'BlackSea'],
    'black sea': ['BlackSea'],
    'mediterranean': ['Mediterranean'],
    'africa': ['WestAfrica', 'Africa'],
  };

  const mapped = regionToPortRegions[region];
  return mapped ? mapped.includes(portRegion) : false;
}

export interface VoyageRestrictionResult {
  pass: boolean;
  reason?: string;
  softExclusions?: VoyageExclusion[];
}

/**
 * Check voyage restriction gate.
 * Hard exclusions: block if origin OR destination port matches excluded region.
 * Soft exclusions: pass but return softExclusions for UI flagging.
 * Conservative on missing data: null port → cannot verify → pass.
 */
export function checkVoyageRestriction(input: {
  vesselRestrictions: string[] | unknown[];
  originPort: string | null | undefined;
  destinationPort: string | null | undefined;
}): VoyageRestrictionResult {
  const exclusions = parseVoyageExclusions(input.vesselRestrictions as unknown[]);
  if (exclusions.length === 0) return { pass: true };

  const softExclusions: VoyageExclusion[] = [];

  for (const excl of exclusions) {
    const loadMatch = regionMatchesPort(excl.region, input.originPort);
    const dischMatch = regionMatchesPort(excl.region, input.destinationPort);

    if (loadMatch || dischMatch) {
      if (excl.hard) {
        const matchedPort = loadMatch ? input.originPort : input.destinationPort;
        return {
          pass: false,
          reason: `vessel excludes ${excl.region} ports; ${matchedPort} is in that region`,
        };
      } else {
        softExclusions.push(excl);
      }
    }
  }

  return { pass: true, softExclusions: softExclusions.length > 0 ? softExclusions : undefined };
}
