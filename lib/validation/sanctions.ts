/**
 * Hardcoded sanctions matrix for the 2026 freight industry reality.
 *
 * This is a deliberately conservative *screening* layer, not legal advice —
 * it flags combinations the broker should double-check against OFAC/EU/UK
 * sanctions lists before fixing. False positives are acceptable; false
 * negatives are not (we'd rather a broker checks twice than skips a check).
 *
 * Design rules:
 *   - Any null input → NONE (graceful; we don't block matches we can't evaluate)
 *   - Symmetric — origin port OR destination port can trigger the match
 *   - Vessel restrictions (free-form text from the vessel email) are also
 *     honoured: "no russia" + route includes RU = HIGH blocking
 */

export type SanctionsRisk = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface SanctionsCheck {
  risk: SanctionsRisk;
  reason?: string;
  blocking: boolean;  // true = hard filter out
}

export interface SanctionsInput {
  vesselFlag: string | null;           // ISO-2 flag code, e.g. "RU", "MH", "TR"
  originPort: string | null;            // free-form port name
  destinationPort: string | null;
  restrictions: string[];               // vessel owner's stated restrictions, free-form
}

// ────────────────────────────────────────────────────────────────────────────
// Flag → ISO-2 normalization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map of free-form flag strings (uppercased) → ISO-2 codes.
 * The LLM often returns full country names ("Russian Federation", "Cyprus")
 * instead of ISO-2 codes. This table normalizes them before sanctions lookup.
 */
const FLAG_ALIASES: Record<string, string> = {
  // Sanctioned / high-risk
  'RUSSIA': 'RU', 'RUSSIAN FEDERATION': 'RU', 'RF': 'RU',
  'UKRAINE': 'UA', 'UKRAINIAN': 'UA',
  'BELARUS': 'BY', 'BELARUSIAN': 'BY', 'BYELORUSSIA': 'BY',
  'IRAN': 'IR', 'IRANIAN': 'IR', 'ISLAMIC REPUBLIC OF IRAN': 'IR',
  'CUBA': 'CU', 'CUBAN': 'CU',
  'MYANMAR': 'MM', 'BURMA': 'MM',
  // Common open-registry / trading flags
  'CYPRUS': 'CY', 'CYPRIOT': 'CY',
  'MARSHALL ISLANDS': 'MH',
  'PANAMA': 'PA', 'PANAMANIAN': 'PA',
  'LIBERIA': 'LR', 'LIBERIAN': 'LR',
  'MALTA': 'MT', 'MALTESE': 'MT',
  'GREECE': 'GR', 'GREEK': 'GR',
  'TURKEY': 'TR', 'TURKISH': 'TR', 'TÜRKIYE': 'TR', 'TURKIYE': 'TR',
  'GERMANY': 'DE', 'GERMAN': 'DE',
  'NETHERLANDS': 'NL', 'DUTCH': 'NL', 'HOLLAND': 'NL',
  'ITALY': 'IT', 'ITALIAN': 'IT',
  'UNITED KINGDOM': 'GB', 'UK': 'GB', 'BRITAIN': 'GB', 'BRITISH': 'GB',
  'UNITED STATES': 'US', 'USA': 'US', 'AMERICAN': 'US',
  'CHINA': 'CN', 'CHINESE': 'CN', "PEOPLE'S REPUBLIC OF CHINA": 'CN',
  'SINGAPORE': 'SG', 'SINGAPOREAN': 'SG',
  'JAPAN': 'JP', 'JAPANESE': 'JP',
  'NORWAY': 'NO', 'NORWEGIAN': 'NO',
  'BAHAMAS': 'BS', 'BAHAMIAN': 'BS',
  'ANTIGUA AND BARBUDA': 'AG', 'ANTIGUA': 'AG',
  'BELIZE': 'BZ',
  'CAMBODIA': 'KH', 'CAMBODIAN': 'KH',
  'COMOROS': 'KM',
  'COOK ISLANDS': 'CK',
  'TUVALU': 'TV',
  'VANUATU': 'VU',
  'PALAU': 'PW',
  'PORTUGAL': 'PT', 'PORTUGUESE': 'PT',
  'DENMARK': 'DK', 'DANISH': 'DK',
  'SWEDEN': 'SE', 'SWEDISH': 'SE',
  'FINLAND': 'FI', 'FINNISH': 'FI',
  'BELGIUM': 'BE', 'BELGIAN': 'BE',
  'FRANCE': 'FR', 'FRENCH': 'FR',
  'SPAIN': 'ES', 'SPANISH': 'ES',
  'ROMANIA': 'RO', 'ROMANIAN': 'RO',
  'BULGARIA': 'BG', 'BULGARIAN': 'BG',
  'CROATIA': 'HR', 'CROATIAN': 'HR',
  'INDIA': 'IN', 'INDIAN': 'IN',
  'SOUTH KOREA': 'KR', 'KOREA': 'KR', 'KOREAN': 'KR',
  'HONG KONG': 'HK',
  'INDONESIA': 'ID', 'INDONESIAN': 'ID',
  'THAILAND': 'TH', 'THAI': 'TH',
  'VIETNAM': 'VN', 'VIETNAMESE': 'VN',
  'PHILIPPINES': 'PH', 'PHILIPPINE': 'PH', 'FILIPINO': 'PH',
  'BANGLADESH': 'BD', 'BANGLADESHI': 'BD',
  'PAKISTAN': 'PK', 'PAKISTANI': 'PK',
  'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE',
  'SAUDI ARABIA': 'SA', 'SAUDI': 'SA',
  'EGYPT': 'EG', 'EGYPTIAN': 'EG',
  'MOROCCO': 'MA', 'MOROCCAN': 'MA',
  'ALGERIA': 'DZ', 'ALGERIAN': 'DZ',
  'NIGERIA': 'NG', 'NIGERIAN': 'NG',
  'SOUTH AFRICA': 'ZA',
  'BRAZIL': 'BR', 'BRAZILIAN': 'BR',
  'ARGENTINA': 'AR', 'ARGENTINIAN': 'AR', 'ARGENTINE': 'AR',
  'MEXICO': 'MX', 'MEXICAN': 'MX',
  'CANADA': 'CA', 'CANADIAN': 'CA',
  'AUSTRALIA': 'AU', 'AUSTRALIAN': 'AU',
  'NEW ZEALAND': 'NZ',
};

/**
 * Normalize a free-form flag string to an ISO-2 country code.
 *
 * The LLM typically returns values like "Russian Federation" or "Cyprus"
 * while `checkSanctions` expects ISO-2 codes ("RU", "CY"). This function
 * bridges the gap so sanctions screening works regardless of LLM output format.
 *
 * @returns ISO-2 code (uppercase), or null if input is blank/unrecognized
 */
export function normalizeFlagToISO2(flag: string | null | undefined): string | null {
  if (!flag || typeof flag !== 'string') return null;
  const cleaned = flag.trim().toUpperCase().replace(/[.,;:!?']+$/, '');
  if (!cleaned) return null;
  // Already a valid 2-letter code — return as-is
  if (/^[A-Z]{2}$/.test(cleaned)) return cleaned;
  // Exact match in alias table
  if (FLAG_ALIASES[cleaned] !== undefined) return FLAG_ALIASES[cleaned];
  // Prefix/substring match — handle cases like "RUSSIAN" matching "RUSSIA"
  for (const [alias, iso2] of Object.entries(FLAG_ALIASES)) {
    if (cleaned === alias || cleaned.startsWith(alias + ' ') || alias.startsWith(cleaned + ' ')) {
      return iso2;
    }
  }
  // Unknown — return cleaned value (may be a 3-letter or other code)
  return cleaned;
}

// ────────────────────────────────────────────────────────────────────────────
// Port → ISO-2 country mapping
// ────────────────────────────────────────────────────────────────────────────

const PORT_COUNTRY: Record<string, string> = {
  // UA
  'mykolaiv': 'UA', 'mykolayiv': 'UA', 'nikolaev': 'UA', 'odesa': 'UA', 'odessa': 'UA', 'chornomorsk': 'UA',
  // RU
  'novorossiysk': 'RU', 'novorossisk': 'RU', 'taman': 'RU', 'tuapse': 'RU', 'st petersburg': 'RU',
  // TR
  'karasu': 'TR', 'istanbul': 'TR', 'aliaga': 'TR', 'efesan': 'TR', 'derince': 'TR', 'izmit': 'TR',
  'marmara': 'TR', 'iskenderun': 'TR',
  // RO
  'constanta': 'RO', 'constantza': 'RO',
  // EG
  'alexandria': 'EG', 'damietta': 'EG', 'port said': 'EG',
  // GR
  'piraeus': 'GR', 'thessaloniki': 'GR',
  // IT
  'ravenna': 'IT', 'trieste': 'IT', 'livorno': 'IT', 'genoa': 'IT',
  // DZ
  'skikda': 'DZ', 'algiers': 'DZ', 'oran': 'DZ',
  // MA
  'casablanca': 'MA', 'tanger': 'MA', 'agadir': 'MA',
  // FR
  'bayonne': 'FR', 'marseille': 'FR', 'le havre': 'FR', 'dunkirk': 'FR',
  // BG
  'varna': 'BG', 'burgas': 'BG',
  // ES
  'bilbao': 'ES', 'valencia': 'ES', 'barcelona': 'ES',
  // NL / BE
  'rotterdam': 'NL', 'amsterdam': 'NL', 'antwerp': 'BE',
  // DE
  'hamburg': 'DE', 'bremen': 'DE',
  // NO (not EU)
  'halsvik': 'NO', 'haugesund': 'NO',
};

export function portToCountry(port: string | null | undefined): string | null {
  if (!port || typeof port !== 'string') return null;
  const normalized = port.toLowerCase()
    .replace(/\([^)]*\)/g, ' ')   // strip parenthetical aliases
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Direct match
  if (PORT_COUNTRY[normalized]) return PORT_COUNTRY[normalized];
  // Partial — try each known port as a substring of the normalized name
  for (const [k, v] of Object.entries(PORT_COUNTRY)) {
    if (normalized.includes(k)) return v;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Country → bloc mapping
// ────────────────────────────────────────────────────────────────────────────

export const EU_COUNTRIES = new Set([
  'DE', 'FR', 'IT', 'NL', 'BE', 'ES', 'PT', 'GR', 'RO', 'BG', 'PL', 'HR', 'SI',
  'CY', 'MT', 'LU', 'AT', 'IE', 'FI', 'SE', 'DK', 'EE', 'LV', 'LT', 'SK', 'CZ', 'HU',
]);

export function isEuCountry(cc: string | null | undefined): boolean {
  if (!cc) return false;
  return EU_COUNTRIES.has(cc.toUpperCase());
}

export type Bloc = 'EU' | 'UK' | 'US' | 'UA' | 'RU' | 'OTHER';

export function countryToBloc(cc: string | null): Bloc {
  if (!cc) return 'OTHER';
  const up = cc.toUpperCase();
  if (up === 'UA') return 'UA';
  if (up === 'RU') return 'RU';
  if (up === 'GB' || up === 'UK') return 'UK';
  if (up === 'US') return 'US';
  if (EU_COUNTRIES.has(up)) return 'EU';
  return 'OTHER';
}

// ────────────────────────────────────────────────────────────────────────────
// Main check
// ────────────────────────────────────────────────────────────────────────────

// Soft-text patterns for forward-looking voyage restrictions.
// Each pattern key is an ISO-2 country code; the regex covers common
// broker phrasings that implicitly exclude a region without using the
// canonical "no russia" / "no ukraine" form.
//
// Negative-lookahead `(?!.*\b(last|previous|formerly|used to)\b)` on
// the joined string prevents past-tense references from triggering a
// block (e.g. "no Russian cargo last year").
const SOFT_RESTRICTION_PATTERNS: Record<string, RegExp> = {
  // "avoid Ukraine", "avoiding Ukraine"
  // "Ukraine off-trade", "UA off-hire" etc.
  // "not prefer ukraine ...", "prefers no ukraine"
  UA: /\b(avoid\s+ukr|avoid\s+ukraine|ukraine\s+off.trade|ukr\s+off.trade|not\s+prefer\s+ukr|not\s+prefer\s+ukraine|prefer\s+no\s+ukraine)\b/i,
  RU: /\b(avoid\s+rus|avoid\s+russia|russia\s+off.trade|rus\s+off.trade|not\s+prefer\s+rus|not\s+prefer\s+russia|prefer\s+no\s+russia)\b/i,
  IR: /\b(avoid\s+iran|iran\s+off.trade|not\s+prefer\s+iran)\b/i,
  BY: /\b(avoid\s+belarus|belarus\s+off.trade|not\s+prefer\s+belarus)\b/i,
};

// Past-tense markers that indicate a restriction is historical, not forward-looking.
// If present in the full restriction string, soft patterns should not fire.
const PAST_TENSE_MARKER = /\b(last\s+year|last\s+month|previously|formerly|used\s+to|before\s+sanctions|prior\s+to)\b/i;

const RESTRICTED_REGION_PATTERNS: Record<string, RegExp> = {
  RU: /\b(no\s+rus|no\s+russia|not\s+russia|anti.?russia|except\s+russia)\b/i,
  UA: /\b(no\s+ukr|no\s+ukraine|not\s+ukraine)\b/i,
  IR: /\b(no\s+iran|not\s+iran)\b/i,
  BY: /\b(no\s+belarus|not\s+belarus)\b/i,
};

function routeCountries(originPort: string | null, destinationPort: string | null): Set<string> {
  const countries = new Set<string>();
  const o = portToCountry(originPort);
  const d = portToCountry(destinationPort);
  if (o) countries.add(o);
  if (d) countries.add(d);
  return countries;
}

/**
 * Normalize a single restriction entry that may be either a plain string or
 * a ConfidenceField-like object `{ value: string, ... }` (as returned by the
 * LLM parser and stored in the eval corpus).  Returns the string value.
 */
function restrictionToString(r: unknown): string {
  if (typeof r === 'string') return r;
  if (r !== null && typeof r === 'object' && 'value' in (r as object)) {
    return String((r as { value: unknown }).value);
  }
  return String(r);
}

export function checkSanctions(input: SanctionsInput): SanctionsCheck {
  // Normalize free-form flag string (e.g. "Russian Federation") to ISO-2 ("RU")
  // before any comparison — the LLM may return full country names.
  const normalizedFlag = normalizeFlagToISO2(input.vesselFlag);
  const flagBloc = countryToBloc(normalizedFlag);
  const countries = routeCountries(input.originPort, input.destinationPort);
  const blocs = new Set(Array.from(countries).map(c => countryToBloc(c)));

  // Vessel's own restrictions (free-text).
  // Restrictions may arrive as plain strings OR as ConfidenceField objects
  // {value, confidence, source_text} when loaded directly from the eval corpus;
  // normalize each entry before joining.
  const joinedRestrictions = input.restrictions.map(restrictionToString).join(' ');
  for (const [cc, pat] of Object.entries(RESTRICTED_REGION_PATTERNS)) {
    if (pat.test(joinedRestrictions) && countries.has(cc)) {
      return {
        risk: 'HIGH',
        blocking: true,
        reason: `vessel restriction explicitly excludes ${cc}, route includes ${cc}`,
      };
    }
  }

  // Soft-text restrictions: "avoid Ukraine", "<country> off-trade", "not prefer <country>" etc.
  // Only fires when the restriction is forward-looking (no past-tense markers).
  if (!PAST_TENSE_MARKER.test(joinedRestrictions)) {
    for (const [cc, pat] of Object.entries(SOFT_RESTRICTION_PATTERNS)) {
      if (pat.test(joinedRestrictions) && countries.has(cc)) {
        return {
          risk: 'HIGH',
          blocking: true,
          reason: `vessel soft restriction excludes ${cc} voyages, route includes ${cc}`,
        };
      }
    }
  }

  // RU flag + EU/UK/US/UA port → HIGH/blocking
  if (flagBloc === 'RU') {
    for (const b of ['EU', 'UK', 'US', 'UA']) {
      if (blocs.has(b as Bloc)) {
        return {
          risk: 'HIGH',
          blocking: true,
          reason: `RU-flagged vessel on ${b} route — sanctions risk (EU/UK/US restrictions on Russian tonnage)`,
        };
      }
    }
  }

  // IR flag + US/EU port → HIGH/blocking
  if (normalizedFlag === 'IR') {
    for (const b of ['EU', 'US', 'UK']) {
      if (blocs.has(b as Bloc)) {
        return {
          risk: 'HIGH',
          blocking: true,
          reason: `IR-flagged vessel on ${b} route — OFAC/EU sanctions apply`,
        };
      }
    }
  }

  // BY flag + EU → MEDIUM (enhanced screening recommended)
  if (normalizedFlag === 'BY' && blocs.has('EU')) {
    return {
      risk: 'MEDIUM',
      blocking: false,
      reason: 'BY-flagged vessel on EU route — enhanced due diligence advised (Belarus sanctions in force)',
    };
  }

  // CU flag + US → MEDIUM
  if (normalizedFlag === 'CU' && blocs.has('US')) {
    return {
      risk: 'MEDIUM',
      blocking: false,
      reason: 'CU-flagged vessel on US route — OFAC embargo concerns',
    };
  }

  // MM flag + EU → MEDIUM
  if (normalizedFlag === 'MM' && blocs.has('EU')) {
    return {
      risk: 'MEDIUM',
      blocking: false,
      reason: 'MM-flagged vessel on EU route — Myanmar sanctions screening advised',
    };
  }

  return { risk: 'NONE', blocking: false };
}
