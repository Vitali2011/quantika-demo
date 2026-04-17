/**
 * Post-processor fallbacks for parsed vessel fields.
 *
 * Fixes three classes of bugs that survive LLM parsing:
 *   B1 — geared=true when email block contains "Gearless" keyword
 *   B2 — grainCapacityUnit returned as uppercase "CBM"/"CBFT" instead of lowercase
 *   B3 — openDate stores ISO date when email says "spot" or "prompt"
 */

import type { ParsedVessel } from '../types';

const GEARLESS_RE = /\bgearless\b/i;
const SPOT_PROMPT_RE = /\b(spot|prompt)\b/i;
const SOURCE_TEXT_MAX = 120;

/**
 * Derive the text fragment most likely belonging to a specific vessel.
 * For multi-vessel pipe-compact emails, locate the vessel name and take
 * a 500-char window from that position. Falls back to the whole body.
 */
function vesselFragment(body: string, vesselName: string | null | undefined): string {
  if (!vesselName) return body;
  const idx = body.toLowerCase().indexOf(vesselName.toLowerCase());
  if (idx < 0) return body;
  // Take window: from vesselName start to next vessel separator or 500 chars
  return body.substring(idx, idx + 500);
}

/**
 * Apply post-processing fallbacks to a list of parsed vessels.
 *
 * @param vessels - Array of vessels as returned by parseVesselAIResponse
 * @param emailBody - Raw email body text used for regex checks
 * @returns New array with corrections applied (original objects are mutated in-place
 *          for simplicity — callers should treat result as the authoritative copy)
 */
export function applyGearedFallback(vessels: ParsedVessel[], emailBody: string): ParsedVessel[] {
  return vessels.map((vessel) => {
    const fragment = vesselFragment(emailBody, vessel.vesselName?.value);

    // ── B1: Geared correction ──
    // If the vessel's text block contains "gearless" (case-insensitive) but LLM
    // set geared=true, override to false.
    if (vessel.geared === true && GEARLESS_RE.test(fragment)) {
      vessel = { ...vessel, geared: false };
    }

    // ── B2: grainCapacityUnit normalization ──
    // LLM sometimes returns "CBM" or "CBFT" (uppercase). Type requires lowercase.
    if (vessel.grainCapacityUnit != null) {
      const normalized = vessel.grainCapacityUnit.toLowerCase() as 'cbm' | 'cbft';
      if (normalized !== vessel.grainCapacityUnit) {
        vessel = { ...vessel, grainCapacityUnit: normalized };
      }
    }

    // ── B3: openDate spot detection ──
    // If the open-date source text (or the vessel fragment) contains "spot" or
    // "prompt", the vessel is immediately available — store "spot" as the value.
    const openDate = vessel.openDate;
    if (openDate != null) {
      const sourceText = openDate.sourceText ?? '';

      // Check for spot/prompt in sourceText first, then fall back to fragment
      const textToCheck = sourceText || fragment;

      let updatedOpenDate = openDate;

      if (SPOT_PROMPT_RE.test(textToCheck) && openDate.value !== 'spot') {
        updatedOpenDate = {
          value: 'spot',
          confidence: 'interpreted',
          sourceText: updatedOpenDate.sourceText,
        };
      }

      // Truncate sourceText to max 120 chars (trim at char limit)
      const currentSource = updatedOpenDate.sourceText;
      if (currentSource && currentSource.length > SOURCE_TEXT_MAX) {
        updatedOpenDate = {
          ...updatedOpenDate,
          sourceText: currentSource.substring(0, SOURCE_TEXT_MAX),
        };
      }

      if (updatedOpenDate !== openDate) {
        vessel = { ...vessel, openDate: updatedOpenDate };
      }
    }

    return vessel;
  });
}
