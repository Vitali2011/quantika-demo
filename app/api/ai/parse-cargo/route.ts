import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { CargoType, ParsedCargo } from '@/lib/types';
import { toConfidence, extractNum } from '@/lib/parsing-utils';

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

export const maxDuration = 120;

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

  await Promise.all(
    cargoEmails.map(async (email) => {
      const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;

      const result = await callAiJson<RawCargoItem>(
        userPrompt,
        CARGO_INQUIRY_PARSER_PROMPT,
        AI_MODEL_LIGHT,
        { items: [] }
      );

      const items = Array.isArray(result.items) ? result.items : [result];

      items.forEach((item, idx) => {
        allParsed.push({
          emailId: email.id,
          itemIndex: idx,
          originPort: toConfidence<string>(item.origin_port),
          originCountry: item.origin_country || null,
          destinationPort: toConfidence<string>(item.destination_port),
          destinationCountry: item.destination_country || null,
          cargoDescription: toConfidence<string>(item.cargo_description),
          weightMt: toConfidence<number>(item.weight_mt),
          // extractNum is NaN-safe and preserves a legitimate zero (unlike `x || null`,
          // which nullifies 0). Prior commit introduced a 0-commission bug by using the
          // antipattern — see ROADMAP_MVP.md W1.8.
          volumeCbm: extractNum(item.volume_cbm),
          dimensions: item.dimensions || null,
          cargoType: (item.cargo_type || 'OTHER') as CargoType,
          containerType: item.container_type || null,
          quantity: extractNum(item.quantity),
          incoterms: item.incoterms || null,
          preferredDates: toConfidence<string>(item.preferred_dates),
          laycan: item.laycan || null,
          loadingRate: item.loading_rate || null,
          dischargeRate: item.discharge_rate || null,
          commissionPercent: extractNum(item.commission_percent),
          commissionTerms: item.commission_terms || null,
          specialRequirements: item.special_requirements || null,
          stowageFactor: item.stowage_factor || null,
          missingInfo: Array.isArray(item.missing_info) ? item.missing_info : [],
        });
      });
    })
  );

  updateSession(sessionId, { parsedCargos: allParsed });
  return NextResponse.json({ count: allParsed.length });
}
