/**
 * Post-processor fallbacks for parsed vessel fields.
 *
 * Fixes eight classes of bugs that survive LLM parsing:
 *   B1 — geared=true when email block contains "Gearless" keyword
 *   B2 — grainCapacityUnit returned as uppercase "CBM"/"CBFT" instead of lowercase
 *   B3 — openDate stores ISO date when email says "spot" or "prompt"
 *   B4 — specialFeatures missing IMDG Class annotation when "imo X.X" or "App B" in email (provider artefact)
 *   B5 — specialFeatures missing hold-geometry annotation when "SID"/"BOX"/"box shaped" in email block
 *   B6 — grainCapacity=null when email uses combined "grain/bale X" notation (LLM only populates baleCapacity)
 *   B7 — specialFeatures missing "Great Lakes/Seaway fitted" when "Lakes" token appears in vessel spec (prompt guard fails)
 *   B8 — baleCapacity=null for BOX/SID-shaped holds when grainCapacity is populated (flat floor: bale≈grain)
 */

import type { ParsedVessel } from '../types';

const GEARLESS_RE = /\bgearless\b/i;
const SPOT_PROMPT_RE = /\b(spot|prompt)\b/i;
const SOURCE_TEXT_MAX = 120;
const IMO_IMDG_RE = /\bimo\s+(\d+\.\d+)/gi;
// "imo 1" / "imo 2" (integer, no decimal) on dry cargo vessels = IMDG Class (not MARPOL)
const IMO_IMDG_INT_RE = /\bimo\s+(\d+)\b(?!\.\d)/gi;
const APP_B_RE = /\bapp(?:endix)?\s*b\b/i;
// B5: BOX/SID hold geometry — "SID" + "BOX" (adjacent or comma-separated), or "box shaped"
const SID_BOX_RE = /\bSID\b.*?\bBOX\b|\bBOX\b.*?\bSID\b/i;
const BOX_SHAPED_RE = /\bbox[-\s]?shaped\b/i;
// B6: combined "grain/bale X" notation — both grain and bale are the same value
const GRAIN_BALE_COMBINED_RE = /\bgrain\s*[/\\]\s*bale\b/i;
// B7: "Lakes" token in vessel spec → "Great Lakes/Seaway fitted" (prompt guard fails — code-level fix)
const GREAT_LAKES_RE = /\bLakes\b/i;

/**
 * Derive the text fragment most likely belonging to a specific vessel.
 * For multi-vessel pipe-compact emails, locate the vessel name and take
 * a 500-char window from that position. Falls back to the whole body.
 */
function vesselFragment(body: string, vesselName: string | null | undefined): string {
  if (!vesselName) return body;
  const idx = body.toLowerCase().indexOf(vesselName.toLowerCase());
  if (idx < 0) return body;
  // Take window: from vesselName start to next vessel separator or 1000 chars
  // 1000-char window covers pipe-compact multi-vessel emails where "Gearless" can appear
  // far from the vessel name header (B1 fix requires broad window for such formats).
  return body.substring(idx, idx + 1000);
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

    // ── B4: IMO annotation (provider artefact — Gemini drops annotations after disambiguation fix) ──
    // Handles both IMDG subdivisions (decimal: imo 1.1) and IMDG integer classes (imo 1, imo 2).
    // "imo 1" on a dry cargo vessel = IMDG Class 1 (not MARPOL — MARPOL uses Roman numerals).
    const fragment2 = vesselFragment(emailBody, vessel.vesselName?.value);
    const existingFeatures = vessel.specialFeatures ?? [];
    const extraFeatures: string[] = [];
    for (const m of fragment2.matchAll(IMO_IMDG_RE)) {
      const label = `IMDG Class ${m[1]} certified`;
      if (!existingFeatures.includes(label) && !extraFeatures.includes(label)) extraFeatures.push(label);
    }
    for (const m of fragment2.matchAll(IMO_IMDG_INT_RE)) {
      const label = `IMDG Class ${m[1]} certified`;
      if (!existingFeatures.includes(label) && !extraFeatures.includes(label)) extraFeatures.push(label);
    }
    if (APP_B_RE.test(fragment2)) {
      const label = 'Appendix B fitted';
      if (!existingFeatures.includes(label) && !extraFeatures.includes(label)) extraFeatures.push(label);
    }
    if (extraFeatures.length > 0) {
      vessel = { ...vessel, specialFeatures: [...existingFeatures, ...extraFeatures] };
    }

    // ── B5: BOX/SID hold geometry (LLM drops this annotation despite prompt rule) ──
    // "SID, BOX" or "SID BOX" → "SID box-shaped hold"
    // "box shaped [N] single hold" → "box-shaped single hold"
    // "box shaped hold" / "box-shaped hold" → "box-shaped hold"
    const fragment3 = vesselFragment(emailBody, vessel.vesselName?.value);
    const currentFeatures = vessel.specialFeatures ?? [];
    const holdFeatures: string[] = [];
    if (SID_BOX_RE.test(fragment3)) {
      const label = 'SID box-shaped hold';
      if (!currentFeatures.includes(label) && !holdFeatures.includes(label)) holdFeatures.push(label);
    } else if (BOX_SHAPED_RE.test(fragment3)) {
      // "box shaped 1 single hold" / "box-shaped single hold" → "box-shaped single hold"
      const isSingle = /\bsingle\b/i.test(fragment3);
      const label = isSingle ? 'box-shaped single hold' : 'box-shaped hold';
      if (!currentFeatures.includes(label) && !holdFeatures.includes(label)) holdFeatures.push(label);
    }
    if (holdFeatures.length > 0) {
      vessel = { ...vessel, specialFeatures: [...currentFeatures, ...holdFeatures] };
    }

    // ── B6: GRAIN_BALE_COMBINED ──
    // "hold cap. grain/bale abt X cbft" — LLM only populates baleCapacity; copy to grainCapacity.
    if (vessel.grainCapacity == null && vessel.baleCapacity != null) {
      const fragment4 = vesselFragment(emailBody, vessel.vesselName?.value);
      if (GRAIN_BALE_COMBINED_RE.test(fragment4)) {
        vessel = { ...vessel, grainCapacity: vessel.baleCapacity };
      }
    }

    // ── B7: GREAT_LAKES_SEAWAY ──
    // "Lakes" token in vessel spec block → "Great Lakes/Seaway fitted" annotation.
    // Prompt guard fails — Gemini drops the annotation despite explicit rule.
    // Guard: only run when vesselName is present (camelCase production path).
    // Harness passes snake_case objects where vesselName is undefined → skip here,
    // handled in addImoAnnotationFromBody with vessel-fragment logic.
    if (vessel.vesselName?.value != null) {
      const fragment5 = vesselFragment(emailBody, vessel.vesselName.value);
      const featuresAfterB6 = vessel.specialFeatures ?? [];
      if (GREAT_LAKES_RE.test(fragment5) && !featuresAfterB6.includes('Great Lakes/Seaway fitted')) {
        vessel = { ...vessel, specialFeatures: [...featuresAfterB6, 'Great Lakes/Seaway fitted'] };
      }
    }

    // ── B8: BOX_HOLD_BALE_CAPACITY ──
    // BOX/SID-shaped holds have flat floors — bale_capacity ≈ grain_capacity (no bilge waste).
    // When LLM populates grainCapacity but leaves baleCapacity null for a BOX hold, fill it in.
    if (vessel.baleCapacity == null && vessel.grainCapacity != null) {
      const fragment6 = vesselFragment(emailBody, vessel.vesselName?.value);
      if (SID_BOX_RE.test(fragment6) || BOX_SHAPED_RE.test(fragment6)) {
        vessel = { ...vessel, baleCapacity: vessel.grainCapacity };
      }
    }

    return vessel;
  });
}
