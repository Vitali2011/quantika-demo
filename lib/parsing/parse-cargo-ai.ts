import { MAX_EMAIL_BODY_CHARS } from '@/lib/parse-cargo-helpers';
import { CargoType, Email, ParsedCargo, Range } from '@/lib/types';
import { toConfidence, extractNum } from '@/lib/parsing-utils';
import { calibrateAll } from '@/lib/validation/confidence-calibration';

export interface RawCargoItem {
  origin_port?: unknown;
  origin_country?: string | null;
  destination_port?: unknown;
  destination_country?: string | null;
  cargo_description?: unknown;
  weight_mt?: unknown;
  weight_mt_min?: number | null;
  weight_mt_max?: number | null;
  volume_cbm?: number | null;
  dimensions?: string | null;
  cargo_type?: string;
  container_type?: string | null;
  quantity?: number | null;
  incoterms?: string | null;
  preferred_dates?: unknown;
  laycan?: string | null;
  loading_rate?: string | null;
  discharge_rate?: string | null;
  commission_percent?: number | string | null;
  commission_terms?: string | null;
  special_requirements?: string | null;
  stowage_factor?: string | null;
  missing_info?: string[];
  origin_port_alternatives?: unknown[] | null;
  origin_port_rotation?: unknown[] | null;
  destination_port_alternatives?: unknown[] | null;
  destination_port_rotation?: unknown[] | null;
  weight_per_port?: unknown[] | null;
  items?: RawCargoItem[];
}

/** Extract plain string from a value that may be a ConfidenceField object or a plain string */
function extractStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value) || null;
  return String(v) || null;
}

/** Truncate raw email body to keep prompts within model budget. */
function truncateBody(body: string): string {
  if (body.length <= MAX_EMAIL_BODY_CHARS) return body;
  return body.slice(0, MAX_EMAIL_BODY_CHARS) + '\n[truncated]';
}

/** Build user prompt strings for a list of cargo inquiry emails. */
export function buildCargoPrompts(emails: Email[]): string[] {
  return emails.map(
    email =>
      `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${truncateBody(email.body)}`
  );
}

/**
 * Parse a raw AI JSON response string into ParsedCargo records.
 * Returns [] on malformed JSON or empty items.
 */
export function parseCargoAIResponse(raw: string, emailId: string): ParsedCargo[] {
  let result: RawCargoItem;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!cleaned) return [];
    result = JSON.parse(cleaned) as RawCargoItem;
  } catch {
    return [];
  }

  const items = Array.isArray(result.items) ? result.items : [result];
  const parsed: ParsedCargo[] = [];

  items.forEach((item, idx) => {
    parsed.push(calibrateAll({
      emailId,
      itemIndex: idx,
      originPort: toConfidence<string>(item.origin_port),
      originCountry: extractStr(item.origin_country),
      destinationPort: toConfidence<string>(item.destination_port),
      destinationCountry: extractStr(item.destination_country),
      cargoDescription: toConfidence<string>(item.cargo_description),
      weightMt: toConfidence<number>(item.weight_mt),
      weightMtMin: extractNum(item.weight_mt_min),
      weightMtMax: extractNum(item.weight_mt_max),
      // extractNum is NaN-safe and preserves a legitimate zero (unlike `x || null`,
      // which nullifies 0). Prior commit introduced a 0-commission bug by using the
      // antipattern — see ROADMAP_MVP.md W1.8.
      volumeCbm: extractNum(item.volume_cbm),
      dimensions: extractStr(item.dimensions),
      cargoType: (() => {
        const ct = item.cargo_type;
        if (!ct) return 'OTHER' as CargoType;
        if (typeof ct === 'object' && 'value' in ct) return (String((ct as { value: unknown }).value) || 'OTHER') as CargoType;
        return (String(ct) || 'OTHER') as CargoType;
      })(),
      containerType: extractStr(item.container_type),
      quantity: (() => {
        const wMin = extractNum(item.weight_mt_min);
        const wMax = extractNum(item.weight_mt_max);
        if (wMin !== null && wMax !== null && wMin !== wMax) {
          return { min: wMin, max: wMax } as Range<number>;
        }
        return extractNum(item.quantity);
      })(),
      incoterms: extractStr(item.incoterms),
      preferredDates: toConfidence<string>(item.preferred_dates),
      laycan: extractStr(item.laycan),
      loadingRate: extractStr(item.loading_rate),
      dischargeRate: extractStr(item.discharge_rate),
      commissionPercent: extractNum(item.commission_percent),
      commissionTerms: extractStr(item.commission_terms),
      specialRequirements: extractStr(item.special_requirements),
      stowageFactor: extractStr(item.stowage_factor),
      missingInfo: Array.isArray(item.missing_info) ? item.missing_info : [],
      originPortAlternatives: Array.isArray(item.origin_port_alternatives)
        ? item.origin_port_alternatives.filter((p) => p != null && p !== '').map((p) => String(p)).filter(Boolean)
        : null,
      originPortRotation: Array.isArray(item.origin_port_rotation)
        ? item.origin_port_rotation.filter((p) => p != null && p !== '').map((p) => String(p)).filter(Boolean)
        : null,
      destinationPortAlternatives: Array.isArray(item.destination_port_alternatives)
        ? item.destination_port_alternatives.filter((p) => p != null && p !== '').map((p) => String(p)).filter(Boolean)
        : null,
      destinationPortRotation: Array.isArray(item.destination_port_rotation)
        ? item.destination_port_rotation.filter((p) => p != null && p !== '').map((p) => String(p)).filter(Boolean)
        : null,
      weightPerPort: Array.isArray(item.weight_per_port)
        ? item.weight_per_port.map((n) => Number(n)).filter((n) => !isNaN(n))
        : null,
    }) as ParsedCargo);
  });

  return parsed;
}
