import { Email, ParsedVessel } from '@/lib/types';
import { extractNum, toConfidence } from '@/lib/parsing-utils';
import { validateImo } from '@/lib/validation/imo';
import { calibrateAll } from '@/lib/validation/confidence-calibration';

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
  items?: RawVesselItem[];
}

/** Extract plain string from a value that may be a ConfidenceField object or a plain string */
function extractStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value) || null;
  return String(v) || null;
}

/** Build the user prompt string for a vessel position email. */
export function buildVesselPrompt(email: Email): string {
  return `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
}

/**
 * Parse a raw AI JSON response string into ParsedVessel records.
 * Returns [] on malformed JSON or empty items.
 */
export function parseVesselAIResponse(raw: string, emailId: string): ParsedVessel[] {
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

  items.forEach((item, idx) => {
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
      built: extractNum(item.built),
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
      restrictions: Array.isArray(item.restrictions) ? item.restrictions : [],
      lastCargoes: (() => {
        let lc = item.last_cargoes;
        if (!lc) return null;
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
      verificationWarning: null,
    }) as ParsedVessel);
  });

  return parsed;
}
