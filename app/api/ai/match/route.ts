/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { MATCH_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import {
  Match, MatchLevel, MatchReadiness, MatchHardFilters, MatchSanctions,
  BlockedMatch,
  ParsedCargo, ParsedVessel,
} from '@/lib/types';
import { cfValue } from '@/lib/types';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { applyReadinessScoring, computeScoreBreakdown, deriveMatchLevel } from '@/lib/sailing/match-scoring';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { validateDates } from '@/lib/sailing/date-sanity';
import { checkSanctions } from '@/lib/validation/sanctions';
import { enrichReasons } from '@/lib/matching/reason-enricher';

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
  // Detect spot from raw openDate value (before date-parsing discards the word).
  const rawOpenDate = cfValue(v.openDate);
  const isSpot = detectSpot(rawOpenDate);

  // Readiness gap (sailing time + verdict)
  const readiness = calculateReadinessGap(
    {
      openDate: rawOpenDate,
      openPosition: cfValue(v.openPosition),
      speedLaden: v.speedLaden,
      dwtSummer: cfValue(v.dwtSummer),
      isSpot,
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
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

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

  // Collect blocked pairs as structured records so brokers can see what was rejected and why.
  // This is deterministic (no LLM involved) — every sanctions-blocked pair will appear here.
  const blockedMatches: BlockedMatch[] = analyses
    .filter(a => a.filterOut)
    .map(a => {
      const blocked: BlockedMatch = {
        cargoEmailId: a.cargoEmailId,
        cargoItemIndex: a.cargoItemIndex,
        vesselEmailId: a.vesselEmailId,
        vesselItemIndex: a.vesselItemIndex,
        filterReason: a.filterReason ?? 'filtered',
      };
      if (a.sanctions.blocking) {
        blocked.sanctions = a.sanctions;
      }
      if (a.hardFilters && Object.values(a.hardFilters).some(c => !c.pass)) {
        blocked.hardFilters = a.hardFilters;
      }
      return blocked;
    });

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

  // Post-filter: ensure every matchReason contains at least one number.
  // Reasons without digits are either enriched from structured data or moved to issues.
  for (const match of rawMatches) {
    const cargo = parsedCargos.find(c => c.emailId === match.cargoEmailId && c.itemIndex === match.cargoItemIndex);
    const vessel = parsedVessels.find(v => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex);
    const analysis = analyses.find(a =>
      a.cargoEmailId === match.cargoEmailId &&
      a.cargoItemIndex === match.cargoItemIndex &&
      a.vesselEmailId === match.vesselEmailId &&
      a.vesselItemIndex === match.vesselItemIndex,
    );

    const ctx = {
      vesselDwt: vessel ? (typeof vessel.dwtSummer === 'object' && vessel.dwtSummer !== null && 'value' in vessel.dwtSummer ? (vessel.dwtSummer as { value: number }).value : vessel.dwtSummer as number | null) : null,
      vesselDwcc: vessel ? (typeof vessel.dwcc === 'object' && vessel.dwcc !== null && 'value' in vessel.dwcc ? (vessel.dwcc as { value: number }).value : vessel.dwcc as number | null) : null,
      vesselGrainCapacity: vessel?.grainCapacity ?? null,
      cargoWeightMt: cargo ? (typeof cargo.weightMt === 'object' && cargo.weightMt !== null && 'value' in cargo.weightMt ? (cargo.weightMt as { value: number }).value : cargo.weightMt as number | null) : null,
      distanceNm: analysis?.readiness?.distanceNm ?? null,
      gapDays: analysis?.readiness?.gapDays ?? null,
      craneCapacity: vessel?.craneCapacity ?? null,
      vesselBuilt: vessel?.built ?? null,
      vesselLoa: vessel?.loa ?? null,
    };

    const enriched = enrichReasons(match.matchReasons || [], match.issues || [], ctx);
    match.matchReasons = enriched.reasons;
    match.issues = enriched.issues;
  }

  // === Deterministic sweep: fill in pairs LLM didn't return ===
  // After receiving LLM output we scan every "allowed" pair (passed hard filters)
  // and add any that the LLM silently dropped as weak matches with real deterministic data.
  const matchedKeys = new Set(rawMatches.map((m: Match) =>
    pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
  ));

  const sweepMatches: Match[] = [];
  for (const analysis of analyses) {
    const key = pairKey(analysis.cargoEmailId, analysis.cargoItemIndex, analysis.vesselEmailId, analysis.vesselItemIndex);

    // Skip if already returned by LLM or already blocked deterministically
    if (matchedKeys.has(key) || filteredOutKeys.has(key)) continue;

    // This pair passed all hard filters but LLM did not include it.
    // Build a weak match using only deterministic data — no LLM commentary.
    const cargo = parsedCargos.find(
      c => c.emailId === analysis.cargoEmailId && c.itemIndex === analysis.cargoItemIndex,
    );
    const vessel = parsedVessels.find(
      v => v.emailId === analysis.vesselEmailId && v.itemIndex === analysis.vesselItemIndex,
    );

    // Build concrete reasons from deterministic data (no generic text)
    const sweepReasons: string[] = [];

    // 1. DWT/capacity reason
    const dwtVal = vessel ? cfValue(vessel.dwcc) ?? cfValue(vessel.dwtSummer) : null;
    const cargoWt = cargo ? cfValue(cargo.weightMt) : null;
    if (dwtVal && cargoWt) {
      const util = Math.round((cargoWt / dwtVal) * 100);
      sweepReasons.push(`DWCC ${dwtVal.toLocaleString()} mt vs cargo ${cargoWt.toLocaleString()} mt — ${util}% utilization`);
    } else if (dwtVal) {
      sweepReasons.push(`Vessel ${dwtVal.toLocaleString()} DWT — physical capacity available`);
    }

    // 2. Distance/readiness reason
    const dist = analysis.readiness?.distanceNm;
    const gap = analysis.readiness?.gapDays;
    const verdict = analysis.readiness?.verdict;
    if (dist != null) {
      sweepReasons.push(`~${Math.round(dist)} nm ballast — verdict: ${verdict ?? 'unknown'}`);
    } else if (gap != null) {
      sweepReasons.push(`${Math.abs(Math.round(gap))} days ${gap >= 0 ? 'before' : 'after'} laycan — verdict: ${verdict}`);
    }

    // 3. Score/filters reason — always has a digit
    sweepReasons.push(`Passed all 4 hard filters — not AI-evaluated (score based on deterministic data)`);

    // Fallback if nothing generated with digits
    if (sweepReasons.filter(r => /\d/.test(r)).length === 0) {
      sweepReasons.push('Physically feasible pair — passed all hard filters (no detailed data available)');
    }

    // Compute score breakdown so the sweep match has real physical scoring
    const baseSweepMatch: Match = {
      cargoEmailId: analysis.cargoEmailId,
      cargoItemIndex: analysis.cargoItemIndex,
      vesselEmailId: analysis.vesselEmailId,
      vesselItemIndex: analysis.vesselItemIndex,
      score: 25,
      matchLevel: 'weak',
      matchReasons: sweepReasons,
      issues: [
        'Not selected by AI for detailed evaluation — review manually',
        ...(analysis.dateIssues.length > 0 ? analysis.dateIssues : []),
        ...(analysis.sanctions.risk === 'MEDIUM' && analysis.sanctions.reason
          ? [`Sanctions: ${analysis.sanctions.reason}`]
          : []),
      ],
      readiness: analysis.readiness,
      hardFilters: analysis.hardFilters,
      dateIssues: analysis.dateIssues,
      sanctions: analysis.sanctions,
    };

    // Apply readiness scoring to adjust base score using real sailing gap data
    const withReadiness = applyReadinessScoring(baseSweepMatch, analysis.readiness);

    // Compute full score breakdown if we have cargo+vessel context
    if (cargo && vessel) {
      withReadiness.scoreBreakdown = computeScoreBreakdown({
        match: withReadiness,
        cargo,
        vessel,
        readiness: analysis.readiness,
        sanctions: analysis.sanctions,
      });
      // P0-D1: Use the computed finalScore as the canonical score
      withReadiness.score = Math.max(0, Math.min(100, withReadiness.scoreBreakdown.finalScore));
      // P0-D2: Recalculate matchLevel from the final synced score
      withReadiness.matchLevel = deriveMatchLevel(withReadiness.score);
    }

    sweepMatches.push(withReadiness);
  }

  // Attach structured analysis to each LLM match + apply readiness scoring
  const llmMatches: Match[] = rawMatches.map((m: Match) => {
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
      // P0-D1: sync score to scoreBreakdown.finalScore (LLM path was missing this)
      withReadiness.score = Math.max(0, Math.min(100, withReadiness.scoreBreakdown.finalScore));
      // P0-D2: recalculate matchLevel from the synced final score
      withReadiness.matchLevel = deriveMatchLevel(withReadiness.score);
    }

    return withReadiness;
  });

  // Merge: LLM matches first (richer commentary), sweep matches appended.
  // Sweep matches are already fully enriched (readiness/filters/sanctions/scoreBreakdown
  // computed above) — they must NOT go through the LLM enrichment map again.
  const allMatches: Match[] = [...llmMatches, ...sweepMatches];

  // P1-DUP: dedupe — if a pair appears in both matches and blockedMatches,
  // keep it in blockedMatches (safety) and remove from matches.
  const blockedKeys = new Set(
    blockedMatches.map(b => pairKey(b.cargoEmailId, b.cargoItemIndex, b.vesselEmailId, b.vesselItemIndex)),
  );
  const matches: Match[] = allMatches.filter(
    m => !blockedKeys.has(pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)),
  );

  // Assertion: matches ∩ blockedMatches must be empty
  if (process.env.NODE_ENV !== 'production') {
    for (const m of matches) {
      const key = pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex);
      if (blockedKeys.has(key)) {
        console.error(`[match/route] BUG: pair ${key} found in both matches and blockedMatches after dedup`);
      }
    }
  }

  // Sort by adjusted score descending
  matches.sort((a, b) => b.score - a.score);

  updateSession(sessionId, { matches, blockedMatches });
  return NextResponse.json({ count: matches.length, blockedCount: blockedMatches.length });
}
