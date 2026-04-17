import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import { ParsedFixtureRecap } from '@/lib/types';
import { summarizeCommissions } from '@/lib/commission';
import { extractNum, toConfidence } from '@/lib/parsing-utils';
import { calibrateAll } from '@/lib/validation/confidence-calibration';
import pLimit from 'p-limit';

interface RawFixtureRecap {
  vessel_name?: unknown;
  owners?: unknown;
  charterers?: unknown;
  account?: unknown;
  broker?: string | null;
  load_port?: unknown;
  disch_port?: unknown;
  cargo_description?: unknown;
  cargo_quantity_min?: number | string | null;
  cargo_quantity_max?: number | string | null;
  cargo_packaging?: string | null;
  laycan?: unknown;
  transit_time?: string | null;
  freight_rate?: unknown;
  freight_basis?: string | null;
  freight_payment?: string | null;
  loading_rate?: unknown;
  loading_terms?: unknown;
  loading_working_hours?: string | null;
  discharging_rate?: unknown;
  discharging_terms?: unknown;
  discharging_working_hours?: string | null;
  demurrage_rate?: unknown;
  demurrage_payment?: string | null;
  load_port_agent?: string | null;
  disch_port_agent?: string | null;
  vessel_dwt?: number | string | null;
  vessel_draft?: number | string | null;
  vessel_geared?: boolean | null;
  cp_form?: string | null;
  arbitration?: string | null;
  law?: string | null;
  commission?: string | null;
  commission_percent?: number | string | null;
  commission_pct?: number | string | null;
  commission_base?: string | null;
  commission_amount?: number | string | null;
  commission_currency?: string | null;
  subs?: string[];
  confidentiality?: boolean | null;
  additional_terms?: string[];
  unknown_terms?: Array<{ term: string; note: string }>;
}

export const maxDuration = 120;

export function parseRecapAIResponse(raw: string, emailId: string): ParsedFixtureRecap {
  const result = JSON.parse(raw) as RawFixtureRecap;
  return calibrateAll({
    emailId,
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
  }) as ParsedFixtureRecap;
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

  const limit = pLimit(5);

  const parsedFixtureRecaps: ParsedFixtureRecap[] = await Promise.all(
    fixtureEmails.map((email) =>
      limit(async () => {
        const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;

        const result = await callAiJson<RawFixtureRecap>(
          userPrompt,
          FIXTURE_RECAP_PARSER_PROMPT,
          AI_MODEL_HEAVY,
          {}
        );

        return parseRecapAIResponse(JSON.stringify(result), email.id);
      })
    )
  );

  // Calculate commission summary
  const commissionSummary = summarizeCommissions(parsedFixtureRecaps);

  updateSession(sessionId, { parsedFixtureRecaps, commissionSummary });
  return NextResponse.json({ count: parsedFixtureRecaps.length });
}
