/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { MATCH_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import { Match, MatchLevel } from '@/lib/types';
import { cfValue } from '@/lib/types';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const { parsedCargos, parsedVessels } = session;

  if (parsedCargos.length === 0 || parsedVessels.length === 0) {
    updateSession(sessionId, { matches: [] });
    return NextResponse.json({ count: 0 });
  }

  // Prepare data for AI (extract values from ConfidenceFields)
  const cargoData = parsedCargos.map(c => ({
    email_id: c.emailId,
    item_index: c.itemIndex,
    origin_port: cfValue(c.originPort),
    destination_port: cfValue(c.destinationPort),
    cargo_description: cfValue(c.cargoDescription),
    weight_mt: cfValue(c.weightMt),
    cargo_type: c.cargoType,
    preferred_dates: cfValue(c.preferredDates),
    laycan: c.laycan,
    loading_rate: c.loadingRate,
    discharge_rate: c.dischargeRate,
    special_requirements: c.specialRequirements,
  }));

  const vesselData = parsedVessels.map(v => ({
    email_id: v.emailId,
    item_index: v.itemIndex,
    vessel_name: cfValue(v.vesselName),
    dwt_summer: cfValue(v.dwtSummer),
    dwcc: cfValue(v.dwcc),
    draft_max: cfValue(v.draftMax),
    geared: v.geared,
    vessel_type: v.vesselType,
    open_position: cfValue(v.openPosition),
    open_date: cfValue(v.openDate),
    direction: v.direction,
    restrictions: v.restrictions,
    hold_dimensions: v.holdDimensions,
  }));

  const userPrompt = JSON.stringify({
    cargo_inquiries: cargoData,
    vessel_positions: vesselData,
  });

  const result = await callAiJson<{ matches: any[] }>(
    userPrompt,
    MATCH_PROMPT,
    AI_MODEL_HEAVY,
    { matches: [] }
  );

  const matches: Match[] = (result.matches || []).map((m: any) => ({
    cargoEmailId: m.cargo_email_id || '',
    cargoItemIndex: m.cargo_item_index ?? 0,
    vesselEmailId: m.vessel_email_id || '',
    vesselItemIndex: m.vessel_item_index ?? 0,
    score: m.score ?? 50,
    matchLevel: (m.match_level as MatchLevel) || (m.score > 70 ? 'good' : m.score > 40 ? 'possible' : 'weak'),
    matchReasons: Array.isArray(m.match_reasons) ? m.match_reasons : [],
    issues: Array.isArray(m.issues) ? m.issues : [],
  }));

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  updateSession(sessionId, { matches });
  return NextResponse.json({ count: matches.length });
}
