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
import { applyReadinessScoring, computeScoreBreakdown, deriveMatchLevel, applyBallastSizeCap } from '@/lib/sailing/match-scoring';
import { computeFitBreakdown } from '@/lib/sailing/fit-breakdown';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { checkImsbcLoadability } from '@/lib/sailing/imsbc-check';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { validateDates, isLaycanValid } from '@/lib/sailing/date-sanity';
import { checkSanctions } from '@/lib/validation/sanctions';
import { enrichReasons } from '@/lib/matching/reason-enricher';
import { applyHoldCleanliness } from '@/lib/matching/hold-cleanliness';
import { buildMatchEconomics, estimateFreightRate, computeEstimatedTce, parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';
import { resolveFreightRate } from '@/lib/matching/freight-resolver';
import { getBalticDayRate } from '@/lib/market/baltic-freight';
import type Database from 'better-sqlite3';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { formatNumber } from '@/lib/utils';
import { LLMTimeoutError } from '@/lib/openai';
import { now } from '@/lib/clock';

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

/**
 * Idle hard-exclusion threshold (handover 2026-05-30, lever 2).
 *
 * An evaluable pair whose vessel must sit idle MORE than this many days before
 * the laycan opens is moved out of the main match list (→ lowConfidenceMatches),
 * the same way `late` is already hard-filtered. Owners don't hold a vessel idle
 * for 3+ weeks for a single cargo.
 *
 * Relationship to SPOT_IDEAL_MAX_GAP_DAYS (30, lib/sailing/readiness-gap.ts):
 * that constant governs the verdict *classification* boundary (when a spot vessel
 * flips ideal→idle). This one governs the *exclusion* boundary (when an idle pair
 * is too idle to surface). 21 < 30 ⇒ any spot vessel already classified idle
 * (gap > 30) is also excluded here, while a non-spot vessel idle 6–21 days stays
 * (penalised, possibly weak) and ≥3-week idle is bucketed.
 */
export const IDLE_HARD_MAX_GAP_DAYS = 21;

/** Outcome of the matching pipeline: the main "worth calling" list plus the
 *  preserved side-buckets (no pair is ever dropped — see the partition below). */
export interface AnalyzePairsResult {
  /** Main list — good/possible, evaluable, meaningful timing. */
  matches: Match[];
  /** "Manual review" — weak score OR idle with a large date gap (levers 1 + 2). */
  lowConfidenceMatches: Match[];
  /** "Not enough data" — unknown verdict, engine couldn't evaluate (lever 5). */
  insufficientData: Match[];
  /** Hard-filter / date / late / sanctions blocks (unchanged). */
  blockedMatches: BlockedMatch[];
}

interface PairAnalysis {
  cargoEmailId: string;
  cargoItemIndex: number;
  vesselEmailId: string;
  vesselItemIndex: number;
  readiness: MatchReadiness;
  hardFilters: MatchHardFilters;
  sanctions: MatchSanctions;
  dateIssues: string[];
  imsbcIssues: string[];
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
      : resolveCargoWeight(c),
    cargoDescription: cfValue(c.cargoDescription),
    stowageFactor: c.stowageFactor,
    vesselType: v.vesselType,
    geared: v.geared,
    draftMax: cfValue(v.draftMax),
    grainCapacity: v.grainCapacity,
    dwtSummer: cfValue(v.dwtSummer),
    dwcc: cfValue(v.dwcc),
    vesselRestrictions: v.restrictions ?? [],
    // Layer B gates
    vesselBuilt: v.built ?? null,
    refYear,
    cargoMaxVesselAgeYrs: c.maxVesselAgeYrs ?? null,
    vesselBeam: v.beam ?? null,
    vesselLoa: v.loa ?? null,
    cargoMaxBeamM: c.maxBeamM ?? null,
    cargoMaxLoaM: c.maxLoaM ?? null,
    cargoGearRequired: c.gearRequired ?? null,
    vesselFlag: v.flag ?? null,
    vesselClassSociety: v.classSociety ?? null,
    cargoFlagRequired: c.flagRequired ?? null,
    cargoClassRequired: c.classRequired ?? null,
    vesselOpenPosition: cfValue(v.openPosition) ?? null,
  });

  const hardFilters: MatchHardFilters = {
    draft: hf.checks.draft,
    crane: hf.checks.crane,
    volume: hf.checks.volume,
    cargoVessel: hf.checks.cargoVessel,
    destDraft: hf.checks.destDraft,
    destCrane: hf.checks.destCrane,
    cargoWeight: hf.checks.cargoWeight,
    imsbc: hf.checks.imsbc,
    vesselAge: hf.checks.vesselAge,
    dimensions: hf.checks.dimensions,
    gearRequired: hf.checks.gearRequired,
    voyage: hf.checks.voyage,
    flagClass: hf.checks.flagClass,
    warPositionVoyage: hf.checks.warPositionVoyage,
  };

  const imsbcCheck = checkImsbcLoadability(cfValue(c.cargoDescription), { restrictions: v.restrictions ?? [] });
  const imsbcIssues: string[] =
    imsbcCheck.verdict === 'caution'
      ? imsbcCheck.requirements.map((r) => `IMSBC Group ${imsbcCheck.group}: ${r}`)
      : [];

  const parsedLaycan = parseLaycan(c.laycan, refYear);
  const parsedOpen = parseVesselOpenDate(cfValue(v.openDate), refYear, today);
  // Kept for cosmetic issue display (stale-position note, expired-laycan note).
  // filterOut intentionally does NOT use dateValidation.valid — that depends on
  // wall-clock today and would re-introduce a date-dependence in отсев. The
  // broker-loop mandate (2026-05-31) requires the matcher to judge timing only
  // by open-vs-laycan arithmetic (readiness.verdict='late' if arrival > laycanStart
  // by > 1d). Structural inversion (laycan.end < laycan.start, typo) STILL filters.
  const dateValidation = validateDates({
    openDate: parsedOpen,
    laycan: parsedLaycan,
    today,
    staleThresholdDays: 5,
  });
  const structuralLaycan = isLaycanValid(parsedLaycan);
  const structurallyInvalid = !structuralLaycan.valid;

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
  } else if (structurallyInvalid) {
    filterOut = true;
    filterReason = `Laycan: ${structuralLaycan.reason ?? 'structurally invalid'}`;
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
    imsbcIssues,
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
  options?: { refYear?: number; today?: Date; db?: Database.Database },
): Promise<AnalyzePairsResult> {
  if (cargos.length === 0 || vessels.length === 0) {
    return { matches: [], lowConfidenceMatches: [], insufficientData: [], blockedMatches: [] };
  }

  const today = options?.today ?? now();
  const currentYear = today.getUTCFullYear();
  const refYear = options?.refYear ?? currentYear;
  const db = options?.db;

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
      // Only tag sanctions when it was the primary block cause — hard-filter / date / readiness failures take priority.
      const hfFailed = Object.values(a.hardFilters).some((c) => c != null && !c.pass);
      if (a.sanctions.blocking && !hfFailed && a.dateIssues.length === 0 && a.readiness.verdict !== 'late') {
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
    // Timeout errors must propagate so route.ts can return HTTP 504 with retryable signal.
    if (aiErr instanceof LLMTimeoutError) {
      throw aiErr;
    }
    // Transient LLM errors (JSON parse, refusal text, etc.) — return hard-filter
    // blockedMatches so sanctions-blocked vessels reach the session and UI.
    console.warn(
      '[pair-analyzer] aiScorer failed — returning hard-filter blockedMatches without AI-scored matches:',
      aiErr instanceof Error ? aiErr.message : String(aiErr),
    );
    return { matches: [], lowConfidenceMatches: [], insufficientData: [], blockedMatches };
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
      // Reject matches where LLM returned null/undefined IDs — empty-string cargoEmailId
      // causes "Quote requires session data" on /match/[id] (panel checks !cargoEmailId).
      if (!m.cargoEmailId || !m.vesselEmailId) return false;
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
        ...(analysis.imsbcIssues.length > 0 ? analysis.imsbcIssues : []),
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
    if (analysis.imsbcIssues.length > 0) {
      withReadiness.issues = [...(withReadiness.issues ?? []), ...analysis.imsbcIssues];
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

  // ── Ballast + size realism cap (Wave C, levers 3 + 4) ──────────────────────
  // Scores are now final. Demote any 'good' match whose vessel must ballast
  // beyond its class radius (lever 3) or whose cargo fills too little of the
  // vessel — deadfreight (lever 4) — to 'possible'. Part-cargo loads are exempt
  // from the size cut. Runs BEFORE the realism partition so a capped match stays
  // in the main list as 'possible' (it still shows, flagged), never bucketed by
  // this step. Only ever lowers the tier (see applyBallastSizeCap).
  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    if (m.matchLevel !== 'good') continue;
    const analysis = analysisMap.get(
      pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
    );
    const capCargo = cargos.find(
      (c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex,
    );
    const capVessel = vessels.find(
      (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
    );
    allMatches[i] = applyBallastSizeCap({
      match: m,
      distanceNm: analysis?.readiness?.distanceNm ?? null,
      vesselDwt: capVessel ? cfValue(capVessel.dwtSummer) : null,
      vesselDwcc: capVessel ? cfValue(capVessel.dwcc) : null,
      cargoWeightMax: capCargo ? (capCargo.weightMtMax ?? cfValue(capCargo.weightMt)) : null,
      cargoDescription: capCargo ? cfValue(capCargo.cargoDescription) : null,
    });
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
    // ── Broker-facing fit-% + breakdown (fit-loop 2026-05-31) ───────────────
    // Continuous, per-factor, date-independent. Additive — does not replace
    // legacy `score`/`matchLevel`, only surfaces a transparent broker view.
    if (cargo && vessel) {
      const analysis = analysisMap.get(
        pairKey(m.cargoEmailId, m.cargoItemIndex, m.vesselEmailId, m.vesselItemIndex),
      );
      // Pre-fit TCE for economic cap (C3 #783): cheap arithmetic, no LLM.
      // Missing distance → undefined → no cap (conservative).
      let preFitTce: number | undefined;
      const preFitLoadPort = cfValue(cargo.originPort);
      const preFitDischargePort = cfValue(cargo.destinationPort);
      const preFitDist = preFitLoadPort && preFitDischargePort
        ? getPortDistance(preFitLoadPort, preFitDischargePort) : null;
      if (preFitDist && preFitDist.nm > 0) {
        const preFitCargoType =
          typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
            ? (cargo.cargoType as unknown as { value: string }).value
            : (cargo.cargoType as string | null);
        const preFitDwt = cfValue(vessel.dwtSummer) ?? 0;
        const preFitQty = cfValue(cargo.weightMt) ?? 0;
        const preFitSpeed = parseLeadingNumber(vessel.speedLaden);
        const preFitCons = parseConsumption(vessel.consumption);
        const freightEst = estimateFreightRate(preFitCargoType, preFitDist.nm, preFitDwt);
        preFitTce = computeEstimatedTce(
          freightEst, preFitDist.nm, preFitDwt, preFitQty, preFitSpeed, preFitCons,
        ).tce_usd_per_day;
      }
      const fb = computeFitBreakdown({
        cargo,
        vessel,
        readiness: analysis?.readiness,
        sanctions: analysis?.sanctions,
        hardFilters: analysis?.hardFilters,
        refYear,
        tceUsdPerDay: preFitTce,
      });
      m.fitPercent = fb.fitPercent;
      m.fitBreakdown = fb;
    }
    // ── Hold cleanliness (L5C-matrix) ─────────────────────────────────────────
    if (cargo && vessel) {
      applyHoldCleanliness(m, cargo, vessel);
    }
  }

  matches.sort((a, b) => b.score - a.score);

  // ── Realism partition (handover 2026-05-30, levers 1 + 2 + 5) ──────────────
  // Split the scored, non-blocked pairs into three buckets so the main list
  // surfaces only "worth calling" candidates. No data is dropped — every pair
  // lands in exactly one bucket (conservation tested in match-realism-buckets).
  //   5. unknown verdict → insufficientData. Checked FIRST: an unknown pair still
  //      scores ≥40 ("possible"), so a pure score cutoff would not remove it.
  //   2. idle with a large date gap → lowConfidence. Checked before the score
  //      cutoff: a high-utilisation idle pair can still score ≥40. The 'idle'
  //      verdict is only assigned for gapDays > 5 (see classifyVerdict), so this
  //      condition always fires on a positive "vessel waits" gap, never a negative one.
  //   1. weak score → lowConfidence. Trims the un-cutoff sweep residue.
  const mainMatches: Match[] = [];
  const lowConfidenceMatches: Match[] = [];
  const insufficientData: Match[] = [];
  for (const m of matches) {
    const verdict = m.readiness?.verdict;
    const gapDays = m.readiness?.gapDays;
    if (verdict === 'unknown') {
      insufficientData.push(m);
    } else if (verdict === 'idle' && gapDays != null && gapDays > IDLE_HARD_MAX_GAP_DAYS) {
      lowConfidenceMatches.push(m);
    } else if (m.matchLevel === 'weak') {
      lowConfidenceMatches.push(m);
    } else {
      mainMatches.push(m);
    }
  }

  // ── Economics enrichment (spec L2 #5 + #6) ─────────────────────────────────
  // Display-only: computed AFTER the realism partition so it can never affect
  // score, ranking, or bucketing. Only good/possible main matches get economics.
  // Distance is the laden voyage (load → discharge) via getPortDistance — the same
  // source compute-matches.ts uses to persist tce_usd_per_day, so the per-day
  // figure here equals the persisted column. JWC war-risk (#6) is folded in by
  // buildMatchEconomics. No data → economics stays undefined (never throws).
  const economicsCalcAt = new Date().toISOString();
  for (const m of mainMatches) {
    const cargo = cargos.find(
      (c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex,
    );
    const vessel = vessels.find(
      (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
    );
    if (!cargo || !vessel) continue;

    const loadPort = cfValue(cargo.originPort);
    const dischargePort = cfValue(cargo.destinationPort);
    const distanceResult =
      loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
    if (!distanceResult || !(distanceResult.nm > 0)) continue;

    const cargoType =
      typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
        ? (cargo.cargoType as unknown as { value: string }).value
        : (cargo.cargoType as string | null);

    const ecoDwt = cfValue(vessel.dwtSummer) ?? 0;
    const ecoQty = resolveCargoWeight(cargo) ?? 0;
    const ecoSpeed = parseLeadingNumber(vessel.speedLaden);
    const resolvedFreight = resolveFreightRate({
      cargoType,
      parsedFreightRateUsdPerMt: cargo.freightRateUsd ?? null,
      vesselDwt: ecoDwt,
      quantityMt: ecoQty,
      distanceNm: distanceResult.nm,
      speedKts: ecoSpeed,
      balticDayRate: db ? getBalticDayRate(db, ecoDwt) : null,
    });
    // Ballast reposition distance: open position → load port (overhaul step 2).
    // Used by buildMatchEconomics for single-voyage span + ballast-leg Suez detection.
    const openPosition = cfValue(vessel.openPosition);
    const ballastResult = openPosition && loadPort
      ? getPortDistance(openPosition, loadPort)
      : null;
    const ballastDistanceNm = ballastResult?.nm ?? null;

    const econ = buildMatchEconomics({
      cargoType,
      distanceNm: distanceResult.nm,
      vesselDwt: ecoDwt,
      quantityMt: ecoQty,
      speedKts: ecoSpeed,
      consumptionMt: parseConsumption(vessel.consumption),
      loadPort,
      dischargePort,
      vesselOpenPosition: openPosition,
      calculatedAt: economicsCalcAt,
      resolvedFreight: {
        rate: resolvedFreight.value,
        source: resolvedFreight.source,
        confidence: resolvedFreight.confidence,
      },
      ballastDistanceNm,
    });
    if (econ) m.economics = econ;
  }

  // ── Economic realism floor (founder profit rule; golden-set GS-longballast-kandla) ──
  // A surfaced ("worth calling") match must clear its vessel-class cash breakeven.
  // With reposition-aware TCE (overhaul steps 1-3 landed), the $/day figure now
  // includes ballast leg bunkers + Suez canal dues — making below-breakeven long-ballast
  // voyages visible. A pair whose true-voyage TCE < class breakeven is demoted to
  // manual review (never dropped).
  // Breakevens (conservative floor, $/day): coaster/small ≤$1.5k, handysize ≤$3k,
  // supra/handymax ≤$5.5k, panamax ≤$7.5k. Unknown DWT → skip floor (conservative).
  // Legacy: if economics not computed (distance unknown), skip the floor.
  const mainKept: Match[] = [];
  for (const m of mainMatches) {
    const deadfreight = (m.issues ?? []).some((i) => i.startsWith('SIZE:'));
    if (deadfreight) {
      m.matchLevel = 'weak'; // a deadfreight pair is commercially weak → manual review
      m.issues = [...(m.issues ?? []), 'Below-scale utilisation (deadfreight) — manual review'];
      lowConfidenceMatches.push(m);
      continue;
    }
    const floorTce = m.economics?.tceUsdPerDay;
    if (typeof floorTce === 'number') {
      const floorVessel = vessels.find(
        (v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
      );
      const floorDwt = floorVessel ? (cfValue(floorVessel.dwtSummer) ?? 0) : 0;
      if (floorDwt > 0) {
        const breakeven = floorDwt <= 15_000 ? 1_500
          : floorDwt <= 40_000 ? 3_000
          : floorDwt <= 65_000 ? 5_500
          : 7_500;
        if (floorTce < breakeven) {
          m.matchLevel = 'weak';
          m.issues = [...(m.issues ?? []), 'Below-breakeven economics (true-voyage TCE) — manual review'];
          lowConfidenceMatches.push(m);
          continue;
        }
      }
    }
    mainKept.push(m);
  }

  return { matches: mainKept, lowConfidenceMatches, insufficientData, blockedMatches };
}
