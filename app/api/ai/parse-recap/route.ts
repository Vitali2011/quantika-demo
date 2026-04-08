/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import { ParsedFixtureRecap, ConfidenceField } from '@/lib/types';
import { summarizeCommissions } from '@/lib/commission';

export const maxDuration = 120;

function extractNum(v: any): number | null {  if (v == null) return null;  if (typeof v === "number") return v;  if (typeof v === "string") { const n = parseFloat(v); return isNaN(n) ? null : n; }  if (typeof v === "object" && "value" in v) return extractNum(v.value);  return null;}
function toConfidence<T>(field: any): ConfidenceField<T> | null {
  if (!field) return null;
  if (typeof field === 'object' && 'value' in field) {
    return {
      value: field.value,
      confidence: field.confidence || 'confirmed',
      sourceText: field.source_text || undefined,
    };
  }
  return { value: field as T, confidence: 'confirmed' };
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const fixtureIds = session.classifications
    .filter(c => c.category === 'FIXTURE_RECAP')
    .map(c => c.emailId);

  const fixtureEmails = session.emails.filter(e => fixtureIds.includes(e.id));

  if (fixtureEmails.length === 0) {
    updateSession(sessionId, { parsedFixtureRecaps: [], commissionSummary: null });
    return NextResponse.json({ count: 0 });
  }

  const parsedFixtureRecaps: ParsedFixtureRecap[] = await Promise.all(
    fixtureEmails.map(async (email) => {
      const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;

      const result = await callAiJson<any>(
        userPrompt,
        FIXTURE_RECAP_PARSER_PROMPT,
        AI_MODEL_HEAVY,
        {}
      );

      return {
        emailId: email.id,
        vesselName: toConfidence<string>(result.vessel_name),
        owners: toConfidence<string>(result.owners),
        charterers: toConfidence<string>(result.charterers),
        account: toConfidence<string>(result.account),
        broker: result.broker || null,
        loadPort: toConfidence<string>(result.load_port),
        dischPort: toConfidence<string>(result.disch_port),
        cargoDescription: toConfidence<string>(result.cargo_description),
        cargoQuantityMin: extractNum(result.cargo_quantity_min),
        cargoQuantityMax: extractNum(result.cargo_quantity_max),
        cargoPackaging: result.cargo_packaging || null,
        laycan: toConfidence<string>(result.laycan),
        transitTime: result.transit_time || null,
        freightRate: toConfidence<string>(result.freight_rate),
        freightBasis: result.freight_basis || null,
        freightPayment: result.freight_payment || null,
        loadingRate: toConfidence<string>(result.loading_rate),
        loadingTerms: toConfidence<string>(result.loading_terms),
        loadingWorkingHours: result.loading_working_hours || null,
        dischargingRate: toConfidence<string>(result.discharging_rate),
        dischargingTerms: toConfidence<string>(result.discharging_terms),
        dischargingWorkingHours: result.discharging_working_hours || null,
        demurrageRate: toConfidence<string>(result.demurrage_rate),
        demurragePayment: result.demurrage_payment || null,
        loadPortAgent: result.load_port_agent || null,
        dischPortAgent: result.disch_port_agent || null,
        vesselDwt: extractNum(result.vessel_dwt),
        vesselDraft: extractNum(result.vessel_draft),
        vesselGeared: result.vessel_geared != null ? Boolean(result.vessel_geared) : null,
        cpForm: result.cp_form || null,
        arbitration: result.arbitration || null,
        law: result.law || null,
        commission: result.commission || null,
        commissionPercent: extractNum(result.commission_percent) ?? extractNum(result.commission_pct),
        commissionBase: result.commission_base || null,
        commissionAmount: extractNum(result.commission_amount),
        commissionCurrency: result.commission_currency || null,
        subs: Array.isArray(result.subs) ? result.subs : [],
        confidentiality: result.confidentiality != null ? Boolean(result.confidentiality) : false,
        additionalTerms: Array.isArray(result.additional_terms) ? result.additional_terms : [],
        unknownTerms: Array.isArray(result.unknown_terms) ? result.unknown_terms : [],
      };
    })
  );

  // Calculate commission summary
console.log("[RECAP] commissionPercent values:", parsedFixtureRecaps.map(r => r.commissionPercent));  console.log("[RECAP] freightRate values:", parsedFixtureRecaps.map(r => r.freightRate));
  const commissionSummary = summarizeCommissions(parsedFixtureRecaps);

  updateSession(sessionId, { parsedFixtureRecaps, commissionSummary });
  return NextResponse.json({ count: parsedFixtureRecaps.length });
}
