import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { CargoType, Email, ParsedCargo } from '@/lib/types';
import { toConfidence, extractNum } from '@/lib/parsing-utils';
import { calibrateAll } from '@/lib/validation/confidence-calibration';
import pLimit from 'p-limit';

interface RawCargoItem {
  origin_port?: unknown;
  origin_country?: string | null;
  destination_port?: unknown;
  destination_country?: string | null;
  cargo_description?: unknown;
  weight_mt?: unknown;
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

export function buildCargoPrompts(emails: Email[]): Array<{ emailId: string; prompt: string }> {
  return emails.map(email => ({
    emailId: email.id,
    prompt: `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`,
  }));
}

export function parseCargoAIResponse(raw: string, emailId: string): ParsedCargo[] {
  const result = JSON.parse(raw) as RawCargoItem;
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
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const cargoInquiryIds = session.classifications
    .filter(c => c.category === 'CARGO_INQUIRY')
    .map(c => c.emailId);

  const cargoEmails = session.emails.filter(e => cargoInquiryIds.includes(e.id));

  if (cargoEmails.length === 0) {
    updateSession(sessionId, { parsedCargos: [] });
    return NextResponse.json({ count: 0 });
  }

  const allParsed: ParsedCargo[] = [];
  const limit = pLimit(5);

  await Promise.all(
    cargoEmails.map((email) =>
      limit(async () => {
        const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;

        const result = await callAiJson<RawCargoItem>(
          userPrompt,
          CARGO_INQUIRY_PARSER_PROMPT,
          AI_MODEL_LIGHT,
          { items: [] }
        );

        allParsed.push(...parseCargoAIResponse(JSON.stringify(result), email.id));
      })
    )
  );

  updateSession(sessionId, { parsedCargos: allParsed });
  return NextResponse.json({ count: allParsed.length });
}
