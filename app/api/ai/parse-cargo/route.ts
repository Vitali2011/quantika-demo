/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { ParsedCargo } from '@/lib/types';
import { toConfidence } from '@/lib/parsing-utils';

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

      const result = await callAiJson<any>(
        userPrompt,
        CARGO_INQUIRY_PARSER_PROMPT,
        AI_MODEL_LIGHT,
        { items: [] }
      );

      const items = Array.isArray(result.items) ? result.items : [result];

      items.forEach((item: any, idx: number) => {
        allParsed.push({
          emailId: email.id,
          itemIndex: idx,
          originPort: toConfidence<string>(item.origin_port),
          originCountry: item.origin_country || null,
          destinationPort: toConfidence<string>(item.destination_port),
          destinationCountry: item.destination_country || null,
          cargoDescription: toConfidence<string>(item.cargo_description),
          weightMt: toConfidence<number>(item.weight_mt),
          volumeCbm: item.volume_cbm != null ? Number(item.volume_cbm) : null,
          dimensions: item.dimensions || null,
          cargoType: item.cargo_type || 'OTHER',
          containerType: item.container_type || null,
          quantity: item.quantity != null ? Number(item.quantity) : null,
          incoterms: item.incoterms || null,
          preferredDates: toConfidence<string>(item.preferred_dates),
          laycan: item.laycan || null,
          loadingRate: item.loading_rate || null,
          dischargeRate: item.discharge_rate || null,
          commissionPercent: parseFloat(String(item.commission_percent || 0)) || null,
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
