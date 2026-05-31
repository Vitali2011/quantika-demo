/**
 * Continuous, transparent vessel↔cargo fit-% with per-factor breakdown.
 *
 * Broker-loop mandate (2026-05-31): a senior dry-bulk broker should see WHY a
 * pair scored X% — every factor contributes a labelled, weighted sub-score with
 * a human-readable rationale. No today/wall-clock dependence: timing is judged
 * by open-vs-laycan arithmetic only (the engine sources gapDays/distanceNm from
 * `calculateReadinessGap` upstream, which is itself date-independent).
 *
 * This module is ADDITIVE to the legacy `computeScoreBreakdown` (still used by
 * the LLM pipeline + bucket routing) — it produces a parallel `FitBreakdown`
 * attached to each Match as `fitBreakdown`, with the headline `fitPercent`.
 * Anchors (see LOOP-LOG.md):
 *   HIGH  — slabs util ~99% / ~205nm / geared    → fit ≥ 88
 *   HIGH  — wheat util ~75% / ~580nm             → fit ∈ [70, 85]
 *   LOW   — util ~34% non-part-cargo             → fit < 55
 *   LOW   — ballast ≫ class radius за мелочью    → fit < 55
 *   LOW   — open AFTER laycan end                → fit < 40
 *   PART  — part-cargo util ~5%                  → not zeroed by util
 *   MONO  — improving any factor never lowers fit on a neighbour pair
 */

import type {
  FitBreakdown,
  FitBreakdownComponent,
  FitFactor,
  MatchReadiness,
  MatchSanctions,
  MatchHardFilters,
  ParsedCargo,
  ParsedVessel,
} from '@/lib/types';
import { cfValue } from '@/lib/types';
import { computeVesselVetting } from './vessel-vetting';
import { classifyVesselByDwt } from './readiness-gap';
import { BALLAST_GOOD_MAX_NM, isPartCargo } from './match-scoring';
import { portHasShoreCranes } from './port-master';
import { STOWAGE_FACTORS } from './match-filters';

// ── Weights — sum to 100. Tunable per anchor calibration. ──────────────────
//
// L3 vetting added (weight 9). Existing 8 factors scaled × (91/100) to keep
// total = 100. Anchor thresholds preserved — LOW pairs hit caps before linear
// sum matters; HIGH slabs pair gains 5.4 pts from unknown vetting → still ≥88.
//   util 23 · timing 18 · ballast 18 · classFit 11 · cargoType 7 · cranes 7
//   volume 4 · draft 3 · vetting 9 = 100
export const FIT_WEIGHTS: Record<FitFactor, number> = {
  utilisation: 23,
  timing: 18,
  ballast: 18,
  classFit: 11,
  cargoType: 7,
  cranes: 7,
  volume: 4,
  draft: 3,
  vetting: 9,
};

const TOTAL_WEIGHT = Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0);

// ────────────────────────────────────────────────────────────────────────────
// Component scorers — each returns score normalised to [0, weight].
// Conservative on missing data: returns 60% of weight + "unknown" rationale.
// ────────────────────────────────────────────────────────────────────────────

const UNKNOWN_SHARE = 0.6;

function unknown(factor: FitFactor, label: string, why: string): FitBreakdownComponent {
  return {
    factor,
    label,
    weight: FIT_WEIGHTS[factor],
    score: Math.round(FIT_WEIGHTS[factor] * UNKNOWN_SHARE * 10) / 10,
    rationale: why,
  };
}

/** Utilisation — continuous curve over cargo/vessel-capacity ratio.
 *  Anchor: ~88–98% util = peak. <50% non-part-cargo = sharp drop (deadfreight).
 *  Part-cargo exemption: low util is normal in handysize/breakbulk parcels,
 *  so part-cargo never falls below 65% of the weight irrespective of util.
 */
export function scoreUtilisation(
  cargoWtMax: number | null,
  vesselCapacity: number | null,
  partCargo: boolean,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.utilisation;
  if (cargoWtMax == null || cargoWtMax <= 0 || vesselCapacity == null || vesselCapacity <= 0) {
    return unknown('utilisation', 'Size / utilisation', 'cargo weight or vessel capacity unknown');
  }
  const util = cargoWtMax / vesselCapacity;
  // Piecewise curve, peak at 0.85–1.05:
  //   util ∈ [0.85, 1.05]  → 1.00 (peak — broker says "well-laden")
  //   util ∈ (1.05, 1.20]  → 0.85 (slight overflow risk — possible bunker trim)
  //   util > 1.20          → 0.20 (overload — hard-gate normally catches this)
  //   util ∈ [0.65, 0.85)  → 0.65 (under-utilised but not deadfreight territory)
  //   util ∈ [0.50, 0.65)  → 0.55
  //   util ∈ [0.30, 0.50)  → 0.30 (deadfreight — sharp drop)
  //   util < 0.30          → 0.10 (gross disproportion)
  // Part-cargo override: no penalty for low util — handysize/breakbulk parcels
  // routinely fill a small fraction of the ship, that is the trade. Floor 0.85.
  let share: number;
  if (partCargo) {
    if (util >= 0.85 && util <= 1.05) share = 1.0;
    else if (util > 1.05 && util <= 1.20) share = 0.92;
    else share = 0.85;
  } else {
    if (util >= 0.85 && util <= 1.05) share = 1.0;
    else if (util > 1.05 && util <= 1.20) share = 0.85;
    else if (util > 1.20) share = 0.20;
    else if (util >= 0.65) share = 0.65;
    else if (util >= 0.50) share = 0.55;
    else if (util >= 0.30) share = 0.30;
    else share = 0.10;
  }
  const pct = Math.round(util * 100);
  return {
    factor: 'utilisation',
    label: 'Size / utilisation',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: partCargo
      ? `cargo fills ~${pct}% of vessel — part-cargo (exempt from deadfreight penalty)`
      : `cargo fills ~${pct}% of vessel${share >= 1 ? ' — peak utilisation' : share <= 0.4 ? ' — deadfreight' : ''}`,
  };
}

/** Timing — open-vs-laycan arithmetic, verdict-shaped + gap-scaled.
 *  Brief: "vessel opens AFTER laycan end → fit < 40 OR в корзину" — captured here
 *  by 'late' verdict driving share to 0.05.
 */
export function scoreTiming(readiness: MatchReadiness | undefined): FitBreakdownComponent {
  const w = FIT_WEIGHTS.timing;
  if (!readiness) {
    return unknown('timing', 'Laycan timing', 'no readiness data');
  }
  const { verdict, gapDays } = readiness;
  if (verdict === 'unknown') {
    return unknown('timing', 'Laycan timing', 'timing unknown — missing dates or port');
  }
  let share: number;
  let why: string;
  switch (verdict) {
    case 'ideal':
      share = 1.0;
      why = 'arrives cleanly within laycan window';
      break;
    case 'tight':
      share = 0.7;
      why = 'tight — cuts it fine but feasible';
      break;
    case 'idle': {
      // Continuous penalty by idle length: 5d ≈ 0.6, 14d ≈ 0.4, 30d ≈ 0.2, >30d ≈ 0.1.
      const d = Math.abs(gapDays ?? 5);
      share = d <= 5 ? 0.65 : d <= 14 ? 0.45 : d <= 30 ? 0.25 : 0.1;
      why = `vessel idle ~${Math.round(d)}d before laycan — owner cost risk`;
      break;
    }
    case 'late':
      share = 0.05;
      why = gapDays != null
        ? `vessel arrives ~${Math.abs(Math.round(gapDays))}d after laycan — misses window`
        : 'vessel misses laycan window';
      break;
    default:
      share = UNKNOWN_SHARE;
      why = 'timing not classified';
  }
  return {
    factor: 'timing',
    label: 'Laycan timing',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: why,
  };
}

/** Ballast — class-aware continuous. 0nm = full points; class-radius = 50%;
 *  2× class-radius = 0. Linear in between. Brief: "balalast ≫ class radius за
 *  мелочью" combined with low util drives fit < 55 (size component already low,
 *  so this need not over-penalise on its own). */
export function scoreBallast(
  distanceNm: number | null,
  vesselDwt: number | null,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.ballast;
  if (distanceNm == null || !Number.isFinite(distanceNm)) {
    return unknown('ballast', 'Ballast distance', 'distance unknown (vague position or unmapped port)');
  }
  if (vesselDwt == null || !Number.isFinite(vesselDwt)) {
    return unknown('ballast', 'Ballast distance', 'vessel DWT unknown — cannot pick class radius');
  }
  const cls = classifyVesselByDwt(vesselDwt);
  const radius = BALLAST_GOOD_MAX_NM[cls];
  // Sqrt-shaped decay inside the class radius — penalises medium ballast more
  // than a pure linear curve would (broker intuition: 50% of radius is already
  // a real cost, not just half-bad). Hard zero at 2× radius (uneconomic for class).
  //   d == 0          → 1.0
  //   d == r          → 0.4
  //   d == 2r         → 0.0
  let share: number;
  if (distanceNm <= 0) share = 1.0;
  else if (distanceNm <= radius) share = 1.0 - 0.6 * Math.sqrt(distanceNm / radius);
  else if (distanceNm <= radius * 2) share = 0.4 * (1 - (distanceNm - radius) / radius);
  else share = 0;
  return {
    factor: 'ballast',
    label: 'Ballast distance',
    weight: w,
    score: Math.round(w * Math.max(0, share) * 10) / 10,
    rationale: `${Math.round(distanceNm)}nm ballast vs ${cls} radius ${radius}nm`,
  };
}

/** Class fit — vessel class appropriate for cargo size?
 *  Excellent: cargo fits between half and full class DWT range.
 *  Borderline: vessel class is one tier too big/small.
 */
export function scoreClassFit(
  cargoWtMax: number | null,
  vesselDwt: number | null,
  partCargo: boolean,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.classFit;
  if (cargoWtMax == null || cargoWtMax <= 0 || vesselDwt == null || vesselDwt <= 0) {
    return unknown('classFit', 'Class fit', 'cargo weight or vessel DWT unknown');
  }
  // Ideal: vessel DWT 1.05–1.35× cargo (small headroom for bunkers/stores).
  // 1.0–1.05 OK; 1.35–2.0 acceptable; >2 oversized; <1 cargo bigger than vessel.
  const ratio = vesselDwt / cargoWtMax;
  let share: number;
  if (partCargo) {
    // Part-cargo: vessel is shared across several parcels, so oversized is normal.
    share = ratio >= 0.95 ? 1.0 : 0.7;
  } else if (ratio < 1.0) {
    share = 0.2;
  } else if (ratio <= 1.05) share = 0.95;
  else if (ratio <= 1.35) share = 1.0;
  else if (ratio <= 2.0) share = 0.75;
  else if (ratio <= 3.0) share = 0.5;
  else share = 0.25;
  return {
    factor: 'classFit',
    label: 'Class fit',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: `vessel DWT ${vesselDwt} vs cargo ${cargoWtMax}mt — ratio ${ratio.toFixed(2)}`,
  };
}

/** Cargo-type quality — hard-gate ALREADY filtered impossibles; this scores
 *  whether the vessel has the right pedigree (lastCargoes match, MPP vs bulk
 *  for breakbulk, etc.). */
export function scoreCargoTypeQuality(
  cargoType: string | null | undefined,
  vesselType: string | null | undefined,
  lastCargoes: string | null | undefined,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.cargoType;
  if (!cargoType || !vesselType) {
    return unknown('cargoType', 'Cargo type quality', 'cargo or vessel type unspecified');
  }
  const v = vesselType.toLowerCase();
  const lc = (lastCargoes ?? '').toLowerCase();
  let share = 0.7;
  let why = `vessel: ${vesselType}`;
  if (cargoType === 'BULK') {
    if (/bulk|handysize|supramax|panamax|capesize|ultramax|handymax/.test(v)) {
      const hasBulkHistory = /grain|wheat|barley|coal|ore|fertilizer|urea|salt|sugar|cement|gypsum/.test(lc);
      share = hasBulkHistory ? 1.0 : 0.85;
      why = hasBulkHistory ? 'bulk vessel + confirmed bulk cargo history' : 'bulk-class vessel';
    } else if (/mpp|multi-?purpose|general/.test(v)) {
      share = 0.55;
      why = 'MPP vessel — fit marginal for bulk';
    }
  } else if (cargoType === 'BREAK_BULK' || cargoType === 'PROJECT') {
    if (/mpp|multi-?purpose|general|heavy.?lift/.test(v)) {
      const hasBBHistory = /steel|pipe|bagged|breakbulk|project|rebar|lumber|machinery/.test(lc);
      share = hasBBHistory ? 1.0 : 0.85;
      why = hasBBHistory ? 'MPP + confirmed breakbulk/project history' : 'MPP — ideal for breakbulk';
    } else if (/bulk/.test(v)) {
      share = 0.5;
      why = 'bulker carrying breakbulk — geared bulker only';
    }
  } else if (cargoType === 'FCL' || cargoType === 'LCL' || cargoType === 'CONTAINER') {
    if (/container/.test(v)) { share = 1.0; why = 'container vessel'; }
  } else if (cargoType === 'RORO') {
    if (/ro.?ro|car carrier/.test(v)) { share = 1.0; why = 'RORO vessel'; }
  } else if (cargoType === 'OTHER') {
    share = 0.65;
    why = 'cargo type unspecified — cannot grade';
  }
  return {
    factor: 'cargoType',
    label: 'Cargo type quality',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: why,
  };
}

/** Cranes — geared vessel is always 100%; gearless depends on port crane availability. */
export function scoreCranes(
  geared: boolean | null | undefined,
  loadPort: string | null,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.cranes;
  if (geared === true) {
    return { factor: 'cranes', label: 'Cranes', weight: w, score: w, rationale: 'vessel geared — no shore-crane dependency' };
  }
  if (geared === false) {
    const portCranes = portHasShoreCranes(loadPort);
    if (portCranes === true) {
      return { factor: 'cranes', label: 'Cranes', weight: w, score: Math.round(w * 0.85 * 10) / 10, rationale: 'gearless + shore cranes available' };
    }
    if (portCranes === false) {
      return { factor: 'cranes', label: 'Cranes', weight: w, score: 0, rationale: 'gearless + no shore cranes — incompatible' };
    }
    return { factor: 'cranes', label: 'Cranes', weight: w, score: Math.round(w * 0.55 * 10) / 10, rationale: 'gearless + port crane availability unverified' };
  }
  return unknown('cranes', 'Cranes', 'vessel gear unknown');
}

/** Volume / hold fit — stowage ratio of cargo m³ to vessel grain capacity. */
export function scoreVolume(
  cargoWtMax: number | null,
  cargoDescription: string | null,
  grainCapacity: number | null,
  stowageFactor: string | null,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.volume;
  if (!cargoWtMax || cargoWtMax <= 0 || !grainCapacity || grainCapacity <= 0) {
    return unknown('volume', 'Volume / hold fit', 'cargo weight or vessel grain capacity unknown');
  }
  // Resolve stowage factor (explicit > keyword > default)
  let sf = 1.35;
  if (stowageFactor) {
    const m = stowageFactor.match(/(\d+(?:\.\d+)?)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 10) sf = n;
    }
  } else if (cargoDescription) {
    const desc = cargoDescription.toLowerCase();
    for (const [kw, value] of Object.entries(STOWAGE_FACTORS)) {
      if (desc.includes(kw)) { sf = value; break; }
    }
  }
  const requiredM3 = cargoWtMax * sf;
  const ratio = requiredM3 / grainCapacity;
  let share: number;
  let why: string;
  if (ratio <= 0.7) { share = 0.85; why = `~${Math.round(ratio * 100)}% of grain capacity — comfortable`; }
  else if (ratio <= 0.9) { share = 1.0; why = `~${Math.round(ratio * 100)}% of grain capacity — ideal`; }
  else if (ratio <= 1.0) { share = 0.85; why = `~${Math.round(ratio * 100)}% of grain capacity — tight fit`; }
  else { share = 0.25; why = `~${Math.round(ratio * 100)}% of grain capacity — overflows`; }
  return {
    factor: 'volume',
    label: 'Volume / hold fit',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: why,
  };
}

/** Draft headroom — uses hardFilters.draft pass/fail; pass = full points,
 *  borderline (within 0.5m of port max) = marginal. Hard-gate failures are
 *  already filtered upstream so this only scores survivors. */
export function scoreDraft(hardFilters: MatchHardFilters | undefined): FitBreakdownComponent {
  const w = FIT_WEIGHTS.draft;
  const draftCheck = hardFilters?.draft;
  if (!draftCheck) {
    return unknown('draft', 'Draft / port headroom', 'draft check not performed');
  }
  if (draftCheck.pass) {
    return { factor: 'draft', label: 'Draft / port headroom', weight: w, score: w, rationale: 'vessel within port draft limit' };
  }
  return { factor: 'draft', label: 'Draft / port headroom', weight: w, score: 0, rationale: draftCheck.reason ?? 'vessel exceeds port draft' };
}

/** Vetting — 5-factor soft signal: flag (Paris MoU) / class (IACS) / age / P&I / CII.
 *  Score 0..1 from computeVesselVetting, multiplied by weight.
 *  When refYear is absent and built is set, age falls back to unknown (neutral).
 *  unknown ≠ penalty — consistent with UNKNOWN_SHARE pattern above.
 */
export function scoreVetting(vessel: ParsedVessel, refYear?: number): FitBreakdownComponent {
  const w = FIT_WEIGHTS.vetting;
  // If refYear not provided, treat age as unknown by zeroing built temporarily.
  const effectiveVessel = refYear != null
    ? vessel
    : { ...vessel, built: null };
  const effectiveRefYear = refYear ?? 0;
  const result = computeVesselVetting(effectiveVessel, { refYear: effectiveRefYear });
  const rationale = result.badges.length > 0
    ? `vetting concerns: ${result.badges.join(', ')}`
    : result.factors.every((f) => f.verdict === 'unknown')
      ? 'vetting data unavailable — scored neutral'
      : 'vetting clean — no concerns flagged';
  return {
    factor: 'vetting',
    label: 'Vessel vetting',
    weight: w,
    score: Math.round(w * result.score * 10) / 10,
    rationale,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level — composes all components, applies sanctions, returns fit-%.
// ────────────────────────────────────────────────────────────────────────────

export interface FitBreakdownInput {
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  readiness: MatchReadiness | undefined;
  sanctions: MatchSanctions | undefined;
  hardFilters: MatchHardFilters | undefined;
  /** Calendar year used for vessel-age arithmetic. If absent, age is treated as unknown. */
  refYear?: number;
}

export function computeFitBreakdown(input: FitBreakdownInput): FitBreakdown {
  const { cargo, vessel, readiness, sanctions, hardFilters, refYear } = input;
  const desc = cfValue(cargo.cargoDescription);
  const partCargo = isPartCargo(desc);

  const cargoWtMax = cargo.weightMtMax ?? cfValue(cargo.weightMt);
  const dwt = cfValue(vessel.dwtSummer);
  const dwcc = cfValue(vessel.dwcc);
  const capacity = dwcc != null && dwcc > 0 ? dwcc : dwt;

  const components: FitBreakdownComponent[] = [
    scoreUtilisation(cargoWtMax, capacity, partCargo),
    scoreTiming(readiness),
    scoreBallast(readiness?.distanceNm ?? null, dwt),
    scoreClassFit(cargoWtMax, dwt, partCargo),
    scoreCargoTypeQuality(cargo.cargoType, vessel.vesselType, vessel.lastCargoes),
    scoreCranes(vessel.geared, cfValue(cargo.originPort)),
    scoreVolume(cargoWtMax, desc, vessel.grainCapacity, cargo.stowageFactor),
    scoreDraft(hardFilters),
    scoreVetting(vessel, refYear),
  ];

  const rawSum = components.reduce((a, c) => a + c.score, 0);
  // Sanctions adjustment — MEDIUM trims 8 pts off (matches legacy -10 from
  // scoreBreakdown, scaled to the smaller dynamic range broker views).
  const sanctionsPenalty = sanctions?.risk === 'MEDIUM' ? 8 : 0;
  let fit = rawSum - sanctionsPenalty;

  // ── Gating caps — broker-reality overrides the linear sum. ────────────────
  // A single killing factor (late, gross under-util, uneconomic ballast) makes
  // the call uncallable regardless of how well the remaining factors score.
  // These caps lower fit; they never raise it. Recorded into the breakdown so
  // the broker sees WHY the headline % is below the linear sum.
  const utilisation =
    cargoWtMax != null && capacity != null && capacity > 0 ? cargoWtMax / capacity : null;
  const caps: Array<{ reason: string; ceiling: number }> = [];
  if (readiness?.verdict === 'late') {
    caps.push({ reason: 'vessel arrives after laycan — uncallable', ceiling: 38 });
  }
  if (!partCargo && utilisation != null && utilisation < 0.40) {
    caps.push({ reason: `util ${Math.round(utilisation * 100)}% — deadfreight makes the call uneconomic`, ceiling: 54 });
  }
  if (dwt != null && readiness?.distanceNm != null) {
    const radius = BALLAST_GOOD_MAX_NM[classifyVesselByDwt(dwt)];
    if (readiness.distanceNm > 2 * radius) {
      caps.push({
        reason: `${Math.round(readiness.distanceNm)}nm > 2× ${classifyVesselByDwt(dwt)} radius — uneconomic ballast`,
        ceiling: 54,
      });
    }
  }
  let appliedCap: { reason: string; ceiling: number } | null = null;
  for (const c of caps) {
    if (fit > c.ceiling) {
      fit = c.ceiling;
      appliedCap = c;
    }
  }
  const fitPercent = Math.max(0, Math.min(100, Math.round(fit * 10) / 10));

  return {
    components,
    totalWeight: TOTAL_WEIGHT,
    fitPercent,
    partCargo,
    vesselClass: classifyVesselByDwt(dwt),
    sanctionsPenalty,
    appliedCap,
    inputs: {
      distanceNm: readiness?.distanceNm ?? null,
      gapDays: readiness?.gapDays ?? null,
      verdict: readiness?.verdict ?? 'unknown',
      utilisation,
      vesselDwt: dwt,
      cargoWtMax,
    },
  };
}
