import { Email, ParsedVessel } from '@/lib/types';
import { extractNum, toConfidence } from '@/lib/parsing-utils';
import { validateImo } from '@/lib/validation/imo';
import { calibrateAll } from '@/lib/validation/confidence-calibration';
import { extractLastCargoesFromBody } from '@/lib/parsing/lastcargoes-fallback';

interface RawVesselItem {
  vessel_name?: unknown;
  imo?: string | null;
  flag?: string | null;
  built?: number | string | null;
  class_society?: string | null;
  p_and_i?: string | null;
  dwt_summer?: unknown;
  dwcc?: unknown;
  draft_max?: unknown;
  loa?: number | string | null;
  beam?: number | string | null;
  grt?: number | string | null;
  nrt?: number | string | null;
  holds_count?: number | string | null;
  hatches_count?: number | string | null;
  grain_capacity?: number | string | null;
  grain_capacity_unit?: 'cbm' | 'cbft' | null;
  bale_capacity?: number | string | null;
  hold_dimensions?: string | null;
  hatch_dimensions?: string | null;
  tank_top_strength?: string | null;
  geared?: boolean | null;
  crane_capacity?: string | null;
  hatch_type?: string | null;
  vessel_type?: string | null;
  open_position?: unknown;
  open_date?: unknown;
  direction?: string | null;
  restrictions?: string[];
  last_cargoes?: unknown;
  speed_laden?: string | null;
  speed_ballast?: string | null;
  consumption?: string | null;
  deck_capacity?: string | null;
  special_features?: string[];
  cii_rating?: string | null;
  items?: RawVesselItem[];
}

// ─── Provider artefact normalizers (Gemini-specific) ────────────────────────
// See .progong/gemini-quirks.md for full documentation.

const MONTH_NAME_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

function isConfField(v: unknown): v is { value: unknown; confidence?: unknown; source_text?: unknown } {
  return v !== null && typeof v === 'object' && 'value' in (v as object);
}

function nullIfNullString(v: unknown): unknown {
  if (isConfField(v) && (v.value === 'null' || v.value === null)) return null;
  return v;
}

function nullIfZeroNumeric(v: unknown): unknown {
  if (isConfField(v) && v.value === 0 && (!v.source_text || v.source_text === '')) return null;
  return v;
}

function nullBuiltIfCalendarDate(v: unknown): unknown {
  if (!isConfField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (MONTH_NAME_RE.test(src)) return null;
  return v;
}

const SQM_OR_CM_PROD_RE = /sqm|sq\.?m\b|\bcm\b|cbm/i;
const SPEED_UNIT_PROD_RE = /\bknts?\b|\bknots?\b|\bkts?\b/i;
const THREE_DIM_PROD_RE = /\d+\s*[Xx×]\s*\d+\s*[Xx×]\s*\d+/;
const CBFT_PROD_RE = /\bcbft\b|\bcuft\b|ft³|ft3/i;
const CBFT_TO_CBM_PROD = 35.314667;

function nullIfSqmOrCmDimension(v: unknown): unknown {
  if (!isConfField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (SQM_OR_CM_PROD_RE.test(src) || THREE_DIM_PROD_RE.test(src)) return null;
  return v;
}

function nullIfSpeedAsDraft(v: unknown): unknown {
  if (!isConfField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (SPEED_UNIT_PROD_RE.test(src)) return null;
  return v;
}

function convertCbftToCbm(v: unknown): unknown {
  if (!isConfField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (CBFT_PROD_RE.test(src) && typeof v.value === 'number' && v.value > 0) {
    return { ...v, value: Math.round(v.value / CBFT_TO_CBM_PROD), confidence: 'interpreted' };
  }
  return v;
}

const FLAG_PROD_RE = /\bflag\b/i;
// FLAG_INFERRED: vessel_flag uncertain without "flag" keyword in source_text → null
function nullIfVesselFlagInferred(v: unknown): unknown {
  if (!isConfField(v)) return v;
  const src = typeof v.source_text === 'string' ? v.source_text : '';
  if (v.confidence === 'uncertain' && !FLAG_PROD_RE.test(src)) return null;
  return v;
}

function preNormalizeRawVessel(item: RawVesselItem): RawVesselItem {
  const out = { ...item } as Record<string, unknown>;

  // NULL_STRING: all keys
  for (const k of Object.keys(out)) out[k] = nullIfNullString(out[k]);

  // ZERO_NUMERIC: vessel dimension/capacity ConfidenceFields
  for (const k of ['loa', 'beam', 'draft_max', 'grt', 'nrt', 'grain_capacity', 'bale_capacity', 'dwt_summer', 'dwcc']) {
    if (k in out) out[k] = nullIfZeroNumeric(out[k]);
  }

  // SQM/CM/CBM GUARD: deck area, bag dims, volume must not become loa/beam/draft_max
  for (const k of ['loa', 'beam', 'draft_max']) {
    if (k in out) out[k] = nullIfSqmOrCmDimension(out[k]);
  }

  // SPEED_AS_DRAFT: draft_max from speed source (e.g. "13 knts") → null
  if ('draft_max' in out) out['draft_max'] = nullIfSpeedAsDraft(out['draft_max']);

  // CBFT→CBM: grain/bale capacity unit conversion from source_text.
  for (const k of ['grain_capacity', 'bale_capacity']) {
    if (k in out) {
      const before = out[k];
      out[k] = convertCbftToCbm(out[k]);
      // If ConfidenceField was converted, the value is now CBM → relabel unit defensively
      if (k === 'grain_capacity' && out[k] !== before && isConfField(out[k])) {
        out['grain_capacity_unit'] = 'cbm';
      }
    }
  }

  // CBFT→CBM via the EXPLICIT grain_capacity_unit field — CODE is the single
  // owner of the conversion. Prod LLM emits the RAW cbft number + unit='cbft'
  // (it does NOT pre-convert), so convert the VALUE here and relabel unit→cbm.
  // The single unit governs both grain and bale. Runs AFTER the source_text
  // pass (so an already-relabelled 'cbm' is skipped — no double-convert) and
  // BEFORE the CAPACITY_PLAUSIBILITY clamp below, which otherwise nulls a legit
  // ~6247 cbm hidden as a raw ~220577 cbft (reads as >2.5x DWT).
  const unitRaw = out['grain_capacity_unit'];
  const unitStr = (isConfField(unitRaw)
    ? (typeof unitRaw.value === 'string' ? unitRaw.value : '')
    : (typeof unitRaw === 'string' ? unitRaw : '')).toLowerCase();
  if (unitStr === 'cbft') {
    for (const k of ['grain_capacity', 'bale_capacity']) {
      const cf = out[k];
      if (isConfField(cf) && typeof cf.value === 'number' && cf.value > 0) {
        out[k] = { ...cf, value: Math.round(cf.value / CBFT_TO_CBM_PROD), confidence: 'interpreted' };
      } else if (typeof cf === 'number' && cf > 0) {
        out[k] = Math.round(cf / CBFT_TO_CBM_PROD);
      }
    }
    out['grain_capacity_unit'] = 'cbm';
  }

  // CAPACITY_PLAUSIBILITY: null grain/bale capacity outside 0.5x-2.5x DWT range (#793/#976).
  // Both bounds fire only when capacity and DWT are present and positive.
  const dwtRaw = out['dwt_summer'];
  const dwt = isConfField(dwtRaw)
    ? (typeof dwtRaw.value === 'number' ? dwtRaw.value : null)
    : (typeof dwtRaw === 'number' ? dwtRaw : null);
  if (dwt !== null && dwt > 0) {
    for (const capKey of ['grain_capacity', 'bale_capacity']) {
      const capRaw = out[capKey];
      const cbm = isConfField(capRaw)
        ? (typeof capRaw.value === 'number' ? capRaw.value : null)
        : (typeof capRaw === 'number' ? capRaw : null);
      if (cbm !== null && cbm > 0 && (cbm < 0.5 * dwt || cbm > 2.5 * dwt)) {
        out[capKey] = null;
      }
    }
  }

  // BUILT_FROM_DATE: null out when source_text contains a month name
  if ('built' in out) out['built'] = nullBuiltIfCalendarDate(out['built']);

  // FLAG_INFERRED: vessel_flag uncertain without "flag" keyword in source → null
  if ('vessel_flag' in out) out['vessel_flag'] = nullIfVesselFlagInferred(out['vessel_flag']);

  return out as RawVesselItem;
}
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extract IMO CII rating (A-E) from a subject line.
 * Patterns: "CII Grade D", "CII D", "Grade D" (when in CII context).
 * Returns uppercase letter or null.
 */
export function extractCiiFromSubject(subject: string | null | undefined): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (!subject) return null;
  // Require "CII" to disambiguate from other "Grade X" usages.
  const m = subject.match(/CII\s*(?:Grade\s*)?([A-E])\b/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D' || letter === 'E') {
    return letter;
  }
  return null;
}

/** Extract plain string from a value that may be a ConfidenceField object or a plain string */
function extractStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value) || null;
  return String(v) || null;
}

// Regex patterns for common "built year" phrasing in vessel position emails.
// "blt 1997", "BLT 1996", "built 2008-08 china", "1989 BLT", "YOB 2005", etc.
// Must NOT match: "LAYCAN: 23-26 FEB 2021", "Ocean7 — 21 May 2025" (no blt/built label).
const BLT_LABEL_YEAR_RX = /\b(?:blt|built|yob|yr\.?\s*built|year[\s-]of[\s-]build)\s+(\d{4})\b/i;
const YEAR_BLT_LABEL_RX = /\b(\d{4})\s+(?:blt|built)\b/i;

/**
 * Extract vessel build year from free-form text using regex patterns.
 * Used as a fallback when the LLM returns built=null but the email clearly states a year.
 * Returns null when no labeled build year is found — never invents a year.
 */
export function extractBuiltYearFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(BLT_LABEL_YEAR_RX) ?? text.match(YEAR_BLT_LABEL_RX);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  // Sanity range: no vessel built before 1950 or more than a year from now (2030 ceiling)
  if (year < 1950 || year > 2030) return null;
  return year;
}

/** Build the user prompt string for a vessel position email. */
export function buildVesselPrompt(email: Email): string {
  return `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
}

/** Normalise an LLM-provided cii_rating value to A-E or null. */
function normaliseCii(v: unknown): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (v == null) return null;
  let s: string;
  if (typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value;
    if (inner == null) return null;
    s = String(inner);
  } else {
    s = String(v);
  }
  const upper = s.trim().toUpperCase();
  if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D' || upper === 'E') {
    return upper;
  }
  return null;
}

/**
 * Parse a raw AI JSON response string into ParsedVessel records.
 * Returns [] on malformed JSON or empty items.
 *
 * @param subject — optional email subject. When provided, the parser
 *   falls back to a regex extraction of CII rating from the subject line
 *   if the LLM did not return one. LLM-provided value always wins.
 */
export function parseVesselAIResponse(raw: string, emailId: string, subject?: string | null, emailBody?: string | null): ParsedVessel[] {
  let result: RawVesselItem;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!cleaned) return [];
    result = JSON.parse(cleaned) as RawVesselItem;
  } catch {
    return [];
  }

  const items = Array.isArray(result.items) ? result.items : [result];
  const parsed: ParsedVessel[] = [];

  items.forEach((rawItem, idx) => {
    const item = preNormalizeRawVessel(rawItem);
    parsed.push(calibrateAll({
      emailId,
      itemIndex: idx,
      vesselName: toConfidence<string>(item.vessel_name),
      imo: (() => {
        const raw = typeof item.imo === 'string' ? item.imo : item.imo != null ? String(item.imo) : null;
        if (!raw) return null;
        const v = validateImo(raw);
        return v.valid ? v.normalized! : null;
      })(),
      flag: (() => {
        const f = item.flag;
        if (!f) return null;
        if (typeof f === 'object' && 'value' in f) return String((f as { value: unknown }).value) || null;
        return String(f) || null;
      })(),
      built: extractNum(item.built) ?? (emailBody ? extractBuiltYearFromText(emailBody) : null),
      classSociety: extractStr(item.class_society),
      pandi: extractStr(item.p_and_i),
      dwtSummer: toConfidence<number>(item.dwt_summer),
      dwcc: toConfidence<number>(item.dwcc),
      draftMax: toConfidence<number>(item.draft_max),
      loa: extractNum(item.loa),
      beam: extractNum(item.beam),
      grt: extractNum(item.grt),
      nrt: extractNum(item.nrt),
      holdsCount: extractNum(item.holds_count),
      hatchesCount: extractNum(item.hatches_count),
      grainCapacity: extractNum(item.grain_capacity),
      grainCapacityUnit: (() => {
        const u = extractStr(item.grain_capacity_unit);
        if (!u) return null;
        const lower = u.toLowerCase();
        if (lower === 'cbm') return 'cbm';
        if (lower === 'cbft' || lower === 'cf') return 'cbft';
        return null;
      })(),
      baleCapacity: extractNum(item.bale_capacity),
      holdDimensions: extractStr(item.hold_dimensions),
      hatchDimensions: extractStr(item.hatch_dimensions),
      tankTopStrength: extractStr(item.tank_top_strength),
      geared: (() => {
        if (item.geared === false) return false;
        const feats = JSON.stringify(item.special_features ?? '').toLowerCase();
        if (feats.includes('gearless')) return false;
        return item.geared != null ? Boolean(item.geared) : null;
      })(),
      craneCapacity: extractStr(item.crane_capacity),
      hatchType: extractStr(item.hatch_type),
      vesselType: extractStr(item.vessel_type),
      openPosition: toConfidence<string>(item.open_position),
      openDate: toConfidence<string>(item.open_date),
      direction: extractStr(item.direction),
      restrictions: Array.isArray(item.restrictions) ? item.restrictions.filter((x) => typeof x === 'string') : [],
      lastCargoes: (() => {
        let lc = item.last_cargoes;
        // audit D: regex fallback feeds hold-cleanliness + pedigree scoring
        if (!lc) return emailBody ? extractLastCargoesFromBody(emailBody) : null;
        if (typeof lc === 'object' && 'value' in lc) lc = lc.value;
        if (Array.isArray(lc)) {
          return lc
            .map((entry: unknown) =>
              entry !== null && typeof entry === 'object' && 'value' in (entry as object)
                ? String((entry as { value: unknown }).value)
                : String(entry)
            )
            .filter(Boolean)
            .join(', ');
        }
        if (typeof lc === 'string') {
          try { const parsed = JSON.parse(lc); if (Array.isArray(parsed)) return parsed.join(', '); } catch {}
          return lc;
        }
        return String(lc);
      })(),
      speedLaden: item.speed_laden || null,
      speedBallast: item.speed_ballast || null,
      consumption: item.consumption || null,
      deckCapacity: item.deck_capacity || null,
      specialFeatures: Array.isArray(item.special_features) ? item.special_features : [],
      ciiRating: normaliseCii(item.cii_rating) ?? extractCiiFromSubject(subject),
      verificationWarning: null,
    }) as ParsedVessel);
  });

  return parsed;
}
