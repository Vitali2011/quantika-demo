import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { CargoType, Email, ParsedCargo } from '@/lib/types';
import { toConfidence, extractNum } from '@/lib/parsing-utils';
import { calibrateAll } from '@/lib/validation/confidence-calibration';
import { applyCargoRateFallback, applyCargoTypeFallback } from '@/lib/parsing/cargo-rate-fallback';
import pLimit from 'p-limit';

interface RawCargoItem {
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
  items?: RawCargoItem[];
}

/** Extract plain string from a value that may be a ConfidenceField object or a plain string */
function extractStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value) || null;
  return String(v) || null;
}

export const maxDuration = 120;

/** Build user prompt strings for a list of cargo inquiry emails. */
function buildCargoPrompts(emails: Email[]): string[] {
  return emails.map(
    email => `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`
  );
}

/**
 * Parse a raw AI JSON response string into ParsedCargo records.
 * Returns [] on malformed JSON or empty items.
 */
function parseCargoAIResponse(raw: string, emailId: string): ParsedCargo[] {
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
      quantity: extractNum(item.quantity),
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
    }) as ParsedCargo);
  });

  return parsed;
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

  const cargoInquiryIds = session.classifications
    .filter(c => c.category === 'CARGO_INQUIRY')
    .map(c => c.emailId);

  const cargoEmails = session.emails.filter(e => cargoInquiryIds.includes(e.id));

  if (cargoEmails.length === 0) {
    updateSession(sessionId, { parsedCargos: [] });
    return NextResponse.json({ count: 0 });
  }

  const allParsed: ParsedCargo[] = [];
  const limit = pLimit(3);
  const prompts = buildCargoPrompts(cargoEmails);

  await Promise.all(
    cargoEmails.map((email, i) => limit(async () => {
      const result = await callAiJson<RawCargoItem>(
        prompts[i],
        CARGO_INQUIRY_PARSER_PROMPT,
        AI_MODEL_LIGHT,
        { items: [] }
      );
      const items = parseCargoAIResponse(JSON.stringify(result), email.id);
      // Apply regex fallbacks: populate rates/cargoType that LLM missed
      const enriched = items
        .map(c => applyCargoRateFallback(c, email.body))
        .map(c => applyCargoTypeFallback(c));
      allParsed.push(...enriched);
    }))
  );

  updateSession(sessionId, { parsedCargos: allParsed });
  return NextResponse.json({ count: allParsed.length });
}
