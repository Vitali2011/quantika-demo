/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { MATCH_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import { Match, MatchLevel, MatchReadiness, ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { calculateReadinessGap } from '@/lib/sailing/readiness-gap';
import { applyReadinessScoring } from '@/lib/sailing/match-scoring';

export const maxDuration = 120;

interface PairReadiness {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  readiness: MatchReadiness;
}

function computeReadinessForAllPairs(
  cargos: ParsedCargo[],
  vessels: ParsedVessel[],
  refYear: number,
  today: Date,
): PairReadiness[] {
  const out: PairReadiness[] = [];
  for (const c of cargos) {
    for (const v of vessels) {
      const readiness = calculateReadinessGap(
        {
          openDate: cfValue(v.openDate),
          openPosition: cfValue(v.openPosition),
          speedLaden: v.speedLaden,
          dwtSummer: cfValue(v.dwtSummer),
        },
        {
          laycan: c.laycan,
          originPort: cfValue(c.originPort),
        },
        { refYear, today },
      );
      out.push({
        cargoEmailId: c.emailId,
        cargoItemIndex: c.itemIndex,
        vesselEmailId: v.emailId,
        vesselItemIndex: v.itemIndex,
        readiness,
      });
    }
  }
  return out;
}

function findReadiness(
  pairs: PairReadiness[],
  cargoEmailId: string,
  cargoItemIndex: number,
  vesselEmailId: string,
  vesselItemIndex: number,
): MatchReadiness | undefined {
  return pairs.find(p =>
    p.cargoEmailId === cargoEmailId &&
    p.cargoItemIndex === cargoItemIndex &&
    p.vesselEmailId === vesselEmailId &&
    p.vesselItemIndex === vesselItemIndex,
  )?.readiness;
}

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

  // Pre-compute readiness for every (cargo, vessel) pair.
  // Reference year comes from sample-data dates (they use 2025) — default to
  // the session creation year, which makes the demo deterministic.
  const refYear = session.createdAt.getUTCFullYear() === new Date().getUTCFullYear()
    ? 2025
    : session.createdAt.getUTCFullYear();
  const today = session.createdAt;
  const pairReadiness = computeReadinessForAllPairs(parsedCargos, parsedVessels, refYear, today);

  // Build a set of "late" pairs to hard-filter from the LLM prompt + final output
  const latePairKeys = new Set(
    pairReadiness
      .filter(p => p.readiness.verdict === 'late')
      .map(p => `${p.cargoEmailId}|${p.cargoItemIndex}|${p.vesselEmailId}|${p.vesselItemIndex}`),
  );

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

  // Pass structured readiness to the LLM so it can use actual numbers in
  // match_reasons instead of hallucinating timing overlap from free-text dates.
  const readinessData = pairReadiness
    .filter(p => !latePairKeys.has(`${p.cargoEmailId}|${p.cargoItemIndex}|${p.vesselEmailId}|${p.vesselItemIndex}`))
    .map(p => ({
      cargo_email_id: p.cargoEmailId,
      cargo_item_index: p.cargoItemIndex,
      vessel_email_id: p.vesselEmailId,
      vessel_item_index: p.vesselItemIndex,
      gap_days: p.readiness.gapDays,
      sailing_days: p.readiness.sailingDays,
      arrival_date: p.readiness.arrivalDate,
      verdict: p.readiness.verdict,
      explanation: p.readiness.explanation,
    }));

  const promptPayload = JSON.stringify({
    cargo_inquiries: cargoData,
    vessel_positions: vesselData,
    readiness: readinessData,
  });

  const result = await callAiJson<{ matches: any[] }>(
    promptPayload,
    MATCH_PROMPT,
    AI_MODEL_HEAVY,
    { matches: [] },
  );

  const rawMatches: Match[] = (result.matches || [])
    .map((m: any) => ({
      cargoEmailId: m.cargo_email_id || '',
      cargoItemIndex: m.cargo_item_index ?? 0,
      vesselEmailId: m.vessel_email_id || '',
      vesselItemIndex: m.vessel_item_index ?? 0,
      score: m.score ?? 50,
      matchLevel: (m.match_level as MatchLevel) || (m.score > 70 ? 'good' : m.score > 40 ? 'possible' : 'weak'),
      matchReasons: Array.isArray(m.match_reasons) ? m.match_reasons : [],
      issues: Array.isArray(m.issues) ? m.issues : [],
    }))
    // Hard filter: drop any match where readiness verdict is 'late' (safety net even if LLM included it)
    .filter((m: Match) => {
      const key = `${m.cargoEmailId}|${m.cargoItemIndex}|${m.vesselEmailId}|${m.vesselItemIndex}`;
      return !latePairKeys.has(key);
    });

  // Attach readiness to each match + apply scoring adjustments
  const matches: Match[] = rawMatches.map((m: Match) => {
    const readiness = findReadiness(pairReadiness, m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex);
    return applyReadinessScoring(m, readiness);
  });

  // Sort by adjusted score descending
  matches.sort((a, b) => b.score - a.score);

  updateSession(sessionId, { matches });
  return NextResponse.json({ count: matches.length });
}
