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

const EU_COUNTRIES = new Set([
  'DE', 'FR', 'IT', 'NL', 'BE', 'ES', 'PT', 'GR', 'RO', 'BG', 'PL', 'HR', 'SI',
  'CY', 'MT', 'LU', 'AT', 'IE', 'FI', 'SE', 'DK', 'EE', 'LV', 'LT', 'SK', 'CZ', 'HU',
]);

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

export function checkSanctions(input: SanctionsInput): SanctionsCheck {
  const flagBloc = countryToBloc(input.vesselFlag);
  const countries = routeCountries(input.originPort, input.destinationPort);
  const blocs = new Set(Array.from(countries).map(c => countryToBloc(c)));

  // Vessel's own restrictions (free-text)
  const joinedRestrictions = input.restrictions.join(' ');
  for (const [cc, pat] of Object.entries(RESTRICTED_REGION_PATTERNS)) {
    if (pat.test(joinedRestrictions) && countries.has(cc)) {
      return {
        risk: 'HIGH',
        blocking: true,
        reason: `vessel restriction explicitly excludes ${cc}, route includes ${cc}`,
      };
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
  if (input.vesselFlag?.toUpperCase() === 'IR') {
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
  if (input.vesselFlag?.toUpperCase() === 'BY' && blocs.has('EU')) {
    return {
      risk: 'MEDIUM',
      blocking: false,
      reason: 'BY-flagged vessel on EU route — enhanced due diligence advised (Belarus sanctions in force)',
    };
  }

  // CU flag + US → MEDIUM
  if (input.vesselFlag?.toUpperCase() === 'CU' && blocs.has('US')) {
    return {
      risk: 'MEDIUM',
      blocking: false,
      reason: 'CU-flagged vessel on US route — OFAC embargo concerns',
    };
  }

  // MM flag + EU → MEDIUM
  if (input.vesselFlag?.toUpperCase() === 'MM' && blocs.has('EU')) {
    return {
      risk: 'MEDIUM',
      blocking: false,
      reason: 'MM-flagged vessel on EU route — Myanmar sanctions screening advised',
    };
  }

  return { risk: 'NONE', blocking: false };
}
