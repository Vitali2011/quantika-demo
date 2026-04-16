/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { MATCH_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import {
  Match, MatchLevel, MatchReadiness, MatchHardFilters, MatchSanctions,
  ParsedCargo, ParsedVessel,
} from '@/lib/types';
import { cfValue } from '@/lib/types';
import { calculateReadinessGap } from '@/lib/sailing/readiness-gap';
import { applyReadinessScoring, computeScoreBreakdown } from '@/lib/sailing/match-scoring';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { validateDates } from '@/lib/sailing/date-sanity';
import { checkSanctions } from '@/lib/validation/sanctions';

export const maxDuration = 120;

interface PairAnalysis {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  readiness: MatchReadiness;
  hardFilters: MatchHardFilters;
  sanctions: MatchSanctions;
  dateIssues: string[];
  /** True if pair is physically or temporally impossible and must be dropped before the LLM sees it. */
  filterOut: boolean;
  filterReason?: string;
}

/**
 * Single pair analysis: run all deterministic checks (hard filters, date
 * validation, readiness-gap) for one cargo-vessel pair.
 */
function analyzePair(c: ParsedCargo, v: ParsedVessel, refYear: number, today: Date): PairAnalysis {
  // Readiness gap (sailing time + verdict)
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

  // Hard filters (draft / crane / volume / cargo-vessel compatibility)
  const hf = runHardFilters({
    cargoType: c.cargoType,
    originPort: cfValue(c.originPort),
    weightMt: cfValue(c.weightMt),
    cargoDescription: cfValue(c.cargoDescription),
    stowageFactor: c.stowageFactor,
    vesselType: v.vesselType,
    geared: v.geared,
    draftMax: cfValue(v.draftMax),
    grainCapacity: v.grainCapacity,
  });

  const hardFilters: MatchHardFilters = {
    draft: hf.checks.draft,
    crane: hf.checks.crane,
    volume: hf.checks.volume,
    cargoVessel: hf.checks.cargoVessel,
  };

  // Date sanity (inverted laycan, stale position)
  const parsedLaycan = parseLaycan(c.laycan, refYear);
  const parsedOpen = parseVesselOpenDate(cfValue(v.openDate), refYear, today);
  const dateValidation = validateDates({
    openDate: parsedOpen,
    laycan: parsedLaycan,
    today,
    staleThresholdDays: 5,
  });

  // Sanctions screening (flag × route × vessel restrictions)
  const sanctions: MatchSanctions = checkSanctions({
    vesselFlag: v.flag,
    originPort: cfValue(c.originPort),
    destinationPort: cfValue(c.destinationPort),
    restrictions: v.restrictions ?? [],
  });

  // Decide whether to filter out ahead of the LLM call.
  // We filter on: hard-impossible physics, inverted laycan, late arrival, HIGH sanctions.
  // Staleness and graceful "unknown" cases are NOT filtered — they're warnings.
  let filterOut = false;
  let filterReason: string | undefined;

  if (!hf.pass) {
    filterOut = true;
    filterReason = hf.failures.join('; ');
  } else if (!dateValidation.valid) {
    filterOut = true;
    filterReason = dateValidation.issues.join('; ');
  } else if (readiness.verdict === 'late') {
    filterOut = true;
    filterReason = readiness.explanation;
  } else if (sanctions.blocking) {
    filterOut = true;
    filterReason = sanctions.reason ?? 'sanctions risk';
  }

  return {
    cargoEmailId: c.emailId,
    cargoItemIndex: c.itemIndex,
    vesselEmailId: v.emailId,
    vesselItemIndex: v.itemIndex,
    readiness,
    hardFilters,
    sanctions,
    dateIssues: dateValidation.issues,
    filterOut,
    filterReason,
  };
}

function pairKey(cargoEmailId: string, cargoItemIndex: number, vesselEmailId: string, vesselItemIndex: number): string {
  return `${cargoEmailId}|${cargoItemIndex}|${vesselEmailId}|${vesselItemIndex}`;
}

function findAnalysis(
  pairs: PairAnalysis[],
  cargoEmailId: string,
  cargoItemIndex: number,
  vesselEmailId: string,
  vesselItemIndex: number,
): PairAnalysis | undefined {
  return pairs.find(p =>
    p.cargoEmailId === cargoEmailId &&
    p.cargoItemIndex === cargoItemIndex &&
    p.vesselEmailId === vesselEmailId &&
    p.vesselItemIndex === vesselItemIndex,
  );
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

  // Reference year: take the current calendar year dynamically so date parsing
  // never drifts into the wrong year when the session crosses a year boundary.
  const sessionYear = session.createdAt.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const refYear = sessionYear < currentYear ? sessionYear : currentYear;
  const today = session.createdAt;

  // Run all deterministic checks for every (cargo, vessel) pair
  const analyses: PairAnalysis[] = [];
  for (const c of parsedCargos) {
    for (const v of parsedVessels) {
      analyses.push(analyzePair(c, v, refYear, today));
    }
  }

  // Keys of pairs we drop BEFORE the LLM sees them (physically impossible / late)
  const filteredOutKeys = new Set(
    analyses.filter(a => a.filterOut).map(a => pairKey(a.cargoEmailId, a.cargoItemIndex, a.vesselEmailId, a.vesselItemIndex)),
  );

  // Prepare data for AI (extract values from ConfidenceFields)
  const cargoData = parsedCargos.map(c => ({
    email_id: c.emailId,
    item_index: c.itemIndex,
    origin_port: cfValue(c.originPort),
    destination_port: cfValue(c.destinationPort),
    cargo_description: cfValue(c.cargoDescription),
    weight_mt: cfValue(c.weightMt),
    cargo_type: typeof c.cargoType === 'object' && c.cargoType !== null && 'value' in c.cargoType
      ? (c.cargoType as unknown as { value: string }).value
      : c.cargoType,
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

  // Pass structured readiness + date warnings to the LLM (only for pairs that
  // survived pre-filtering) so reasons cite real numbers, not hallucinations.
  const readinessData = analyses
    .filter(a => !filteredOutKeys.has(pairKey(a.cargoEmailId, a.cargoItemIndex, a.vesselEmailId, a.vesselItemIndex)))
    .map(a => ({
      cargo_email_id: a.cargoEmailId,
      cargo_item_index: a.cargoItemIndex,
      vessel_email_id: a.vesselEmailId,
      vessel_item_index: a.vesselItemIndex,
      gap_days: a.readiness.gapDays,
      sailing_days: a.readiness.sailingDays,
      arrival_date: a.readiness.arrivalDate,
      verdict: a.readiness.verdict,
      explanation: a.readiness.explanation,
      date_issues: a.dateIssues,
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
    // Safety net: drop any match the LLM returned that we already filtered out pre-flight
    .filter((m: Match) => {
      const key = pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex);
      return !filteredOutKeys.has(key);
    });

  // Attach structured analysis to each match + apply readiness scoring
  const matches: Match[] = rawMatches.map((m: Match) => {
    const analysis = findAnalysis(analyses, m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex);
    if (!analysis) return m;
    const withReadiness = applyReadinessScoring(m, analysis.readiness);
    withReadiness.hardFilters = analysis.hardFilters;
    withReadiness.dateIssues = analysis.dateIssues;
    withReadiness.sanctions = analysis.sanctions;
    // Fold date warnings (stale position, long laycan) into issues so they show in UI
    if (analysis.dateIssues.length > 0) {
      withReadiness.issues = [...(withReadiness.issues ?? []), ...analysis.dateIssues];
    }
    // Non-blocking sanctions risk becomes a visible warning
    if (analysis.sanctions.risk === 'MEDIUM' && analysis.sanctions.reason) {
      withReadiness.issues = [...(withReadiness.issues ?? []), `Sanctions: ${analysis.sanctions.reason}`];
    }

    // Compute structured score breakdown (Task 3.3)
    const cargo = parsedCargos.find(c => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex);
    const vessel = parsedVessels.find(v => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex);
    if (cargo && vessel) {
      withReadiness.scoreBreakdown = computeScoreBreakdown({
        match: withReadiness,
        cargo,
        vessel,
        readiness: analysis.readiness,
        sanctions: analysis.sanctions,
      });
    }

    return withReadiness;
  });

  // Sort by adjusted score descending
  matches.sort((a, b) => b.score - a.score);

  updateSession(sessionId, { matches });
  return NextResponse.json({ count: matches.length });
}
