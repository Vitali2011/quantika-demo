/**
 * Regex-based fallback for cargo loading/discharge rate extraction.
 * Scans raw email body for FIO/CQD/SHINC patterns that LLM missed.
 *
 * Applied AFTER the LLM call — only populates fields that are still null.
 */

import { ParsedCargo } from '../types';

/**
 * Patterns that match laytime / rate terms.
 * Groups capture the canonical match text to store as the rate value.
 */
const RATE_PATTERNS: Array<{ pattern: RegExp; bothEnds: boolean }> = [
  // "FIO SHINC" / "FIO SHEX" / "FIO" standalone
  {
    pattern: /\b(FIO\s*(?:SHINC|SHEX|SSHINC|SSHEX)?)\b/i,
    bothEnds: false,
  },
  // "FIOST" — Free In Out Stowed Trimmed (applies to both ends)
  {
    pattern: /\b(FIOST)\b/i,
    bothEnds: true,
  },
  // "CQD both ends" / "CQD b/e" / "CQD BENDS"
  {
    pattern: /\b(CQD\s*(?:both\s+ends?|b\/e|bends?)?)\b/i,
    bothEnds: true,
  },
  // Numeric rate: "5,000 MT SHINC" / "5000mts SHINC" / "5.000 MT/day SHINC"
  {
    pattern: /\b(\d[\d,.\s]*\d?\s*(?:mt|mts|MT)\s*(?:\/\s*day)?\s*(?:SHINC|SHEX|SSHINC|SSHEX))\b/i,
    bothEnds: false,
  },
];

/**
 * Detect if the matched text implies "both ends" (loading AND discharge).
 */
function isBothEnds(text: string): boolean {
  return /both\s+ends?|b\/e\b|bends?\b/i.test(text);
}

/**
 * Scan body text for rate patterns.
 * Returns { loadMatch, dischargeMatch } — each is the matched string or null.
 */
function detectRates(
  body: string
): { loadMatch: string | null; dischargeMatch: string | null } {
  let loadMatch: string | null = null;
  let dischargeMatch: string | null = null;

  for (const { pattern, bothEnds } of RATE_PATTERNS) {
    // Use global flag clone to iterate all occurrences in the body
    const globalPattern = new RegExp(pattern.source, 'gi');
    let m: RegExpExecArray | null;

    while ((m = globalPattern.exec(body)) !== null) {
      const matchedText = m[1].replace(/\s+/g, ' ').trim();
      const appliesBothEnds = bothEnds || isBothEnds(matchedText);

      if (appliesBothEnds) {
        loadMatch = loadMatch ?? matchedText;
        dischargeMatch = dischargeMatch ?? matchedText;
      } else {
        // Try to determine which end based on context preceding the match
        const idx = m.index;
        const context = body.substring(Math.max(0, idx - 80), idx).toLowerCase();

        // Check for the NEAREST directional keyword (last occurrence wins)
        const lastDischIdx = Math.max(
          context.lastIndexOf('disch'),
          context.lastIndexOf('discharge'),
          context.lastIndexOf('unloading')
        );
        const lastLoadIdx = Math.max(
          context.lastIndexOf('loading'),
          context.lastIndexOf('load:')
        );

        if (lastDischIdx > lastLoadIdx) {
          // Discharge context is closer / more recent
          dischargeMatch = dischargeMatch ?? matchedText;
        } else if (lastLoadIdx >= 0) {
          loadMatch = loadMatch ?? matchedText;
        } else {
          // No directional context — assign to whichever is still null
          loadMatch = loadMatch ?? matchedText;
          dischargeMatch = dischargeMatch ?? matchedText;
        }
      }

      // Once both are populated we're done
      if (loadMatch && dischargeMatch) break;
    }

    if (loadMatch && dischargeMatch) break;
  }

  return { loadMatch, dischargeMatch };
}

/**
 * Post-processor: populate loadingRate / dischargeRate if LLM left them null.
 * Does NOT override values that LLM already extracted.
 */
export function applyCargoRateFallback(
  cargo: ParsedCargo,
  emailBody: string
): ParsedCargo {
  // Early exit if both already populated
  if (cargo.loadingRate && cargo.dischargeRate) return cargo;

  const { loadMatch, dischargeMatch } = detectRates(emailBody);

  return {
    ...cargo,
    loadingRate: cargo.loadingRate ?? loadMatch,
    dischargeRate: cargo.dischargeRate ?? dischargeMatch,
  };
}

/**
 * Post-processor: fix cargo type when LLM classified "loose" bulk material as BREAK_BULK.
 * "Steel scrap loose", "loose grain", etc. are BULK (free-flowing), not break-bulk (packaged).
 */
export function applyCargoTypeFallback(cargo: ParsedCargo): ParsedCargo {
  if (cargo.cargoType !== 'BREAK_BULK') return cargo;

  const desc =
    typeof cargo.cargoDescription === 'object' && cargo.cargoDescription !== null
      ? cargo.cargoDescription.value
      : null;

  if (desc && /\bloose\b/i.test(desc)) {
    return { ...cargo, cargoType: 'BULK' };
  }

  return cargo;
}
