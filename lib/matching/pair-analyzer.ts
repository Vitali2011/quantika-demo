import type {
  Match,
  MatchLevel,
  MatchReadiness,
  MatchHardFilters,
  MatchSanctions,
  BlockedMatch,
  ParsedCargo,
  ParsedVessel,
} from '@/lib/types';
import { cfValue, isRange } from '@/lib/types';
import { computeMatchConfidence } from '@/lib/confidence';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { applyReadinessScoring, computeScoreBreakdown, deriveMatchLevel } from '@/lib/sailing/match-scoring';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { validateDates } from '@/lib/sailing/date-sanity';
import { checkSanctions } from '@/lib/validation/sanctions';
import { enrichReasons } from '@/lib/matching/reason-enricher';
import { formatNumber } from '@/lib/utils';

export interface RawMatch {
  cargo_email_id?: string;
  cargo_item_index?: number;
  vessel_email_id?: string;
  vessel_item_index?: number;
  score?: number;
  match_level?: string;
  match_reasons?: string[];
  issues?: string[];
}

export type AiScorer = (payload: {
  cargoData: object[];
  vesselData: object[];
  readinessData: object[];
}) => Promise<RawMatch[]>;

interface PairAnalysis {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  readiness: MatchReadiness;
  hardFilters: MatchHardFilters;
  sanctions: MatchSanctions;
  dateIssues: string[];
  filterOut: boolean;
  filterReason?: string;
}

function analyzePair(c: ParsedCargo, v: ParsedVessel, refYear: number, today: Date): PairAnalysis {
  const rawOpenDate = cfValue(v.openDate);
  const isSpot = detectSpot(rawOpenDate);

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

  const hf = runHardFilters({
    cargoType: c.cargoType,
    originPort: cfValue(c.originPort),
    destinationPort: cfValue(c.destinationPort),
    weightMt: (c.weightMtMin !== null && c.weightMtMax !== null && c.weightMtMin !== c.weightMtMax)
      ? { min: c.weightMtMin, max: c.weightMtMax }
      : cfValue(c.weightMt),
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
    destDraft: hf.checks.destDraft,
    destCrane: hf.checks.destCrane,
  };

  const parsedLaycan = parseLaycan(c.laycan, refYear);
  const parsedOpen = parseVesselOpenDate(cfValue(v.openDate), refYear, today);
  const dateValidation = validateDates({
    openDate: parsedOpen,
    laycan: parsedLaycan,
    today,
    staleThresholdDays: 5,
  });

  const sanctions: MatchSanctions = checkSanctions({
    vesselFlag: v.flag,
    originPort: cfValue(c.originPort),
    destinationPort: cfValue(c.destinationPort),
    restrictions: v.restrictions ?? [],
  });

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

function pairKey(
  cargoEmailId: string,
  cargoItemIndex: number,
  vesselEmailId: string,
  vesselItemIndex: number,
): string {
  return `${cargoEmailId}|${cargoItemIndex}|${vesselEmailId}|${vesselItemIndex}`;
}

function buildAnalysisMap(pairs: PairAnalysis[]): Map<string, PairAnalysis> {
  const map = new Map<string, PairAnalysis>();
  for (const p of pairs) {
    map.set(pairKey(p.cargoEmailId, p.cargoItemIndex, p.vesselEmailId, p.vesselItemIndex), p);
  }
  return map;
}

/**
 * Analyzes all cargo-vessel pairs deterministically, calls aiScorer for LLM scoring,
 * enriches results, and returns matches sorted by score descending.
 */
export async function analyzePairs(
  cargos: ParsedCargo[],
  vessels: ParsedVessel[],
  aiScorer: AiScorer,
  options?: { refYear?: number; today?: Date },
): Promise<{ matches: Match[]; blockedMatches: BlockedMatch[] }> {
  if (cargos.length === 0 || vessels.length === 0) {
    return { matches: [], blockedMatches: [] };
  }

  const today = options?.today ?? new Date();
  const currentYear = today.getUTCFullYear();
  const refYear = options?.refYear ?? currentYear;

  // O(n²) pair analysis loop
  const analyses: PairAnalysis[] = [];
  for (const c of cargos) {
    for (const v of vessels) {
      analyses.push(analyzePair(c, v, refYear, today));
    }
  }

  const filteredOutKeys = new Set(
    analyses
      .filter((a) => a.filterOut)
      .map((a) => pairKey(a.cargoEmailId, a.cargoItemIndex, a.vesselEmailId, a.vesselItemIndex)),
  );

  const blockedMatches: BlockedMatch[] = analyses
    .filter((a) => a.filterOut)
    .map((a) => {
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
      if (a.hardFilters && Object.values(a.hardFilters).some((c) => c != null && !c.pass)) {
        blocked.hardFilters = a.hardFilters;
      }
      return blocked;
    });

  const cargoData = cargos.map((c) => ({
    email_id: c.emailId,
    item_index: c.itemIndex,
    origin_port: cfValue(c.originPort),
    destination_port: cfValue(c.destinationPort),
    cargo_description: cfValue(c.cargoDescription),
    weight_mt: cfValue(c.weightMt),
    weight_mt_min: c.weightMtMin,
    weight_mt_max: c.weightMtMax,
    weight_mt_is_range: isRange(c.quantity) || (c.weightMtMin !== null && c.weightMtMax !== null && c.weightMtMin !== c.weightMtMax),
    cargo_type:
      typeof c.cargoType === 'object' && c.cargoType !== null && 'value' in c.cargoType
        ? (c.cargoType as unknown as { value: string }).value
        : c.cargoType,
    preferred_dates: cfValue(c.preferredDates),
    laycan: c.laycan,
    loading_rate: c.loadingRate,
    discharge_rate: c.dischargeRate,
    special_requirements: c.specialRequirements,
  }));

  const vesselData = vessels.map((v) => ({
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

  const readinessData = analyses
    .filter(
      (a) =>
        !filteredOutKeys.has(
          pairKey(a.cargoEmailId, a.cargoItemIndex, a.vesselEmailId, a.vesselItemIndex),
        ),
    )
    .map((a) => ({
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

  // Pre-build O(1) lookup map for analyses — replaces O(n²) Array.find scans
  const analysisMap = buildAnalysisMap(analyses);

  // Resilient aiScorer call: hard-filter + sanctions blockedMatches are already computed above
  // and must reach the session even if LLM scoring fails (e.g. JSON parse error from refusal).
  let rawAiMatches: RawMatch[];
  try {
    rawAiMatches = await aiScorer({ cargoData, vesselData, readinessData });
  } catch (aiErr) {
    console.warn(
      '[pair-analyzer] aiScorer failed — returning hard-filter blockedMatches without AI-scored matches:',
      aiErr instanceof Error ? aiErr.message : String(aiErr),
    );
    return { matches: [], blockedMatches };
  }

  const rawMatches: Match[] = rawAiMatches
    .map((m: RawMatch) => ({
      cargoEmailId: m.cargo_email_id || '',
      cargoItemIndex: m.cargo_item_index ?? 0,
      vesselEmailId: m.vessel_email_id || '',
      vesselItemIndex: m.vessel_item_index ?? 0,
      score: m.score ?? 50,
      matchLevel:
        (m.match_level as MatchLevel) ||
        ((m.score ?? 50) > 70 ? 'good' : (m.score ?? 50) > 40 ? 'possible' : 'weak'),
      matchReasons: Array.isArray(m.match_reasons) ? m.match_reasons : [],
      issues: Array.isArray(m.issues) ? m.issues : [],
    }))
    .filter((m: Match) => {
      const key = pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex);
      return !filteredOutKeys.has(key);
    });

  // Reason enrichment
  for (const match of rawMatches) {
    const cargo = cargos.find(
      (c) => c.emailId === match.cargoEmailId && c.itemIndex === match.cargoItemIndex,
    );
    const vessel = vessels.find(
      (v) => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex,
    );
    const analysis = analysisMap.get(
      pairKey(match.cargoEmailId, match.cargoItemIndex, match.vesselEmailId, match.vesselItemIndex),
    );

    const ctx = {
      vesselDwt: vessel
        ? typeof vessel.dwtSummer === 'object' &&
          vessel.dwtSummer !== null &&
          'value' in vessel.dwtSummer
          ? (vessel.dwtSummer as { value: number }).value
          : (vessel.dwtSummer as number | null)
        : null,
      vesselDwcc: vessel
        ? typeof vessel.dwcc === 'object' && vessel.dwcc !== null && 'value' in vessel.dwcc
          ? (vessel.dwcc as { value: number }).value
          : (vessel.dwcc as number | null)
        : null,
      vesselGrainCapacity: vessel?.grainCapacity ?? null,
      cargoWeightMt: cargo
        ? typeof cargo.weightMt === 'object' &&
          cargo.weightMt !== null &&
          'value' in cargo.weightMt
          ? (cargo.weightMt as { value: number }).value
          : (cargo.weightMt as number | null)
        : null,
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

  // Sweep: add pairs that passed filters but LLM didn't return
  const matchedKeys = new Set(
    rawMatches.map((m: Match) =>
      pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
    ),
  );

  const sweepMatches: Match[] = [];
  for (const analysis of analyses) {
    const key = pairKey(
      analysis.cargoEmailId,
      analysis.cargoItemIndex,
      analysis.vesselEmailId,
      analysis.vesselItemIndex,
    );

    if (matchedKeys.has(key) || filteredOutKeys.has(key)) continue;

    const cargo = cargos.find(
      (c) => c.emailId === analysis.cargoEmailId && c.itemIndex === analysis.cargoItemIndex,
    );
    const vessel = vessels.find(
      (v) => v.emailId === analysis.vesselEmailId && v.itemIndex === analysis.vesselItemIndex,
    );

    const sweepReasons: string[] = [];

    const dwtVal = vessel ? cfValue(vessel.dwcc) ?? cfValue(vessel.dwtSummer) : null;
    const cargoWt = cargo ? cfValue(cargo.weightMt) : null;
    if (dwtVal && cargoWt) {
      const util = Math.round((cargoWt / dwtVal) * 100);
      sweepReasons.push(
        `DWCC ${formatNumber(dwtVal)} mt vs cargo ${formatNumber(cargoWt)} mt — ${util}% utilization`,
      );
    } else if (dwtVal) {
      sweepReasons.push(`Vessel ${formatNumber(dwtVal)} DWT — physical capacity available`);
    }

    const dist = analysis.readiness?.distanceNm;
    const gap = analysis.readiness?.gapDays;
    const verdict = analysis.readiness?.verdict;
    if (dist != null) {
      sweepReasons.push(`~${Math.round(dist)} nm ballast — verdict: ${verdict ?? 'unknown'}`);
    } else if (gap != null) {
      sweepReasons.push(
        `${Math.abs(Math.round(gap))} days ${gap >= 0 ? 'before' : 'after'} laycan — verdict: ${verdict}`,
      );
    }

    sweepReasons.push(
      `Passed all 4 hard filters — not AI-evaluated (score based on deterministic data)`,
    );

    if (sweepReasons.filter((r) => /\d/.test(r)).length === 0) {
      sweepReasons.push(
        'Physically feasible pair — passed all hard filters (no detailed data available)',
      );
    }

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

    const withReadiness = applyReadinessScoring(baseSweepMatch, analysis.readiness, cargo, vessel);

    if (cargo && vessel) {
      withReadiness.scoreBreakdown = computeScoreBreakdown({
        match: withReadiness,
        cargo,
        vessel,
        readiness: analysis.readiness,
        sanctions: analysis.sanctions,
      });
      withReadiness.score = Math.max(0, Math.min(100, withReadiness.scoreBreakdown.finalScore));
      withReadiness.matchLevel = deriveMatchLevel(withReadiness.score);
    }

    sweepMatches.push(withReadiness);
  }

  // Attach structured analysis + apply readiness scoring to LLM matches
  const llmMatches: Match[] = rawMatches.map((m: Match) => {
    const analysis = analysisMap.get(
      pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
    );
    if (!analysis) return m;
    const cargo = cargos.find(
      (c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex,
    );
    const vessel = vessels.find(
      (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
    );
    const withReadiness = applyReadinessScoring(m, analysis.readiness, cargo, vessel);
    withReadiness.hardFilters = analysis.hardFilters;
    withReadiness.dateIssues = analysis.dateIssues;
    withReadiness.sanctions = analysis.sanctions;
    if (analysis.dateIssues.length > 0) {
      withReadiness.issues = [...(withReadiness.issues ?? []), ...analysis.dateIssues];
    }
    if (analysis.sanctions.risk === 'MEDIUM' && analysis.sanctions.reason) {
      withReadiness.issues = [
        ...(withReadiness.issues ?? []),
        `Sanctions: ${analysis.sanctions.reason}`,
      ];
    }

    if (cargo && vessel) {
      withReadiness.scoreBreakdown = computeScoreBreakdown({
        match: withReadiness,
        cargo,
        vessel,
        readiness: analysis.readiness,
        sanctions: analysis.sanctions,
      });
      withReadiness.score = Math.max(0, Math.min(100, withReadiness.scoreBreakdown.finalScore));
      withReadiness.matchLevel = deriveMatchLevel(withReadiness.score);
    }

    return withReadiness;
  });

  const allMatches: Match[] = [...llmMatches, ...sweepMatches];

  // Final score/level sync for any match with a scoreBreakdown
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    if (m.scoreBreakdown && typeof m.scoreBreakdown.finalScore === 'number') {
      m.score = Math.max(0, Math.min(100, m.scoreBreakdown.finalScore));
      m.matchLevel = deriveMatchLevel(m.score);
      // Re-apply DWCC overload guard: breakdown finalScore can override the guard
      // set in applyReadinessScoring. Pass existing readiness (null-safe) so the
      // guard runs without altering readiness adjustments again.
      const matchCargo = cargos.find(
        (c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex,
      );
      const matchVessel = vessels.find(
        (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
      );
      allMatches[i] = applyReadinessScoring(m, undefined, matchCargo, matchVessel);
    }
  }

  // Dedupe: pairs in blockedMatches must not appear in matches
  const blockedKeys = new Set(
    blockedMatches.map((b) =>
      pairKey(b.cargoEmailId, b.cargoItemIndex, b.vesselEmailId, b.vesselItemIndex),
    ),
  );
  const matches: Match[] = allMatches.filter(
    (m) =>
      !blockedKeys.has(pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex)),
  );

  if (process.env.NODE_ENV !== 'production') {
    for (const m of matches) {
      const key = pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex);
      if (blockedKeys.has(key)) {
        console.error(
          `[pair-analyzer] BUG: pair ${key} found in both matches and blockedMatches after dedup`,
        );
      }
    }
  }

  // Attach confidence summary to each match (spec α-02)
  for (const m of matches) {
    const cargo = cargos.find(
      (c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex,
    );
    const vessel = vessels.find(
      (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
    );
    if (cargo) {
      m.confidence = computeMatchConfidence(cargo, vessel ?? null);
    }
  }

  matches.sort((a, b) => b.score - a.score);

  return { matches, blockedMatches };
}
