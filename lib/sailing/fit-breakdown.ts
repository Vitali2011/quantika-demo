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
import { resolveCargoWeight } from './cargo-weight';
import { breakevenTceByDwt } from '../economics/breakeven-thresholds';
import { computeVesselVetting } from './vessel-vetting';
import { classifyVesselByDwt } from './readiness-gap';
import { BALLAST_GOOD_MAX_NM, isPartCargo } from './match-scoring';
import { portHasShoreCranes, getPortMaster } from './port-master';
import { STOWAGE_FACTORS } from './match-filters';
import { resolvePort } from '@/lib/ports/resolve';
import { isEuCountry } from '@/lib/validation/sanctions';

// ── Weights — sum to 100. Tunable per anchor calibration. ──────────────────
//
// Economics factor added (weight 18). Existing 9 factors scaled ×82/100 and
// rounded so total = 100. Anchor thresholds preserved — LOW pairs hit caps
// before linear sum matters.
//   util 19 · timing 15 · ballast 15 · classFit 9 · cargoType 6 · cranes 6
//   volume 3 · draft 2 · vetting 7 · economics 18 = 100
export const FIT_WEIGHTS: Record<FitFactor, number> = {
  utilisation: 19,
  timing: 15,
  ballast: 15,
  classFit: 9,
  cargoType: 6,
  cranes: 6,
  volume: 3,
  draft: 2,
  vetting: 7,
  economics: 18,
};

const TOTAL_WEIGHT = Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0);

// Charterer credit-tier penalty (founder-calibrated; DEFAULT). Counterparty-side,
// kept OUT of vessel vetting. weak → soft fit hit; second/blue-chip → none.
// STRONGER: { weak: 8, second: 3 }. SOFTER: { weak: 2, second: 0 }.
export const CHARTERER_TIER_PENALTY: Record<'blue-chip' | 'second' | 'weak', number> = {
  'blue-chip': 0,
  second: 0,
  weak: 4,
};

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

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

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
    return unknown('utilisation', 'Size / utilisation', 'Cargo weight or vessel capacity not stated, scored conservatively.');
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
  let utilizationRationale: string;
  if (partCargo) {
    utilizationRationale = `Cargo fills ~${pct}% of the ship — part cargo, deadfreight not charged.`;
  } else if (util >= 0.85 && util <= 1.05) {
    utilizationRationale = `Cargo fills ~${pct}% of the ship — a near-full load, almost no wasted space.`;
  } else if (util > 1.05) {
    utilizationRationale = `Cargo fills ~${pct}% of the ship — over-tonnaged.`;
  } else {
    utilizationRationale = `Cargo fills ~${pct}% of the ship — under-utilised, some deadfreight risk.`;
  }
  return {
    factor: 'utilisation',
    label: 'Size / utilisation',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: utilizationRationale,
    bracketData: `${fmt(cargoWtMax)} / ${fmt(vesselCapacity)} mt`,
  };
}

/** Timing — open-vs-laycan arithmetic, verdict-shaped + gap-scaled.
 *  Brief: "vessel opens AFTER laycan end → fit < 40 OR в корзину" — captured here
 *  by 'late' verdict driving share to 0.05.
 */
export function scoreTiming(readiness: MatchReadiness | undefined): FitBreakdownComponent {
  const w = FIT_WEIGHTS.timing;
  if (!readiness) {
    return unknown('timing', 'Laycan timing', 'No readiness data available, scored conservatively.');
  }
  const { verdict, gapDays } = readiness;
  if (verdict === 'unknown') {
    return unknown('timing', 'Laycan timing', 'Timing unknown — missing dates or port, scored conservatively.');
  }
  let share: number;
  let why: string;
  let timingBracket: string | undefined;
  switch (verdict) {
    case 'ideal':
      share = 1.0;
      why = 'Ship is free and arrives comfortably inside the loading window.';
      break;
    case 'tight':
      share = 0.7;
      why = 'Arrives just in time — cuts it fine but feasible.';
      break;
    case 'idle': {
      // Continuous penalty by idle length: 5d ≈ 0.6, 14d ≈ 0.4, 30d ≈ 0.2, >30d ≈ 0.1.
      const d = Math.abs(gapDays ?? 5);
      share = d <= 5 ? 0.65 : d <= 14 ? 0.45 : d <= 30 ? 0.25 : 0.1;
      why = `Ship would sit idle ~${Math.round(d)} days before laycan — owner carrying-cost risk.`;
      timingBracket = `${Math.round(d)}d idle`;
      break;
    }
    case 'late':
      share = 0.05;
      why = 'Ship arrives after the laycan ends — would miss the window.';
      timingBracket = 'late';
      break;
    default:
      share = UNKNOWN_SHARE;
      why = 'Timing could not be classified, scored conservatively.';
  }
  return {
    factor: 'timing',
    label: 'Laycan timing',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: why,
    bracketData: timingBracket,
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
    return unknown('ballast', 'Ballast distance', 'Distance to load port unknown — vessel position or port not mapped, scored conservatively.');
  }
  if (vesselDwt == null || !Number.isFinite(vesselDwt)) {
    return unknown('ballast', 'Ballast distance', 'Vessel DWT not stated — cannot determine class range, scored conservatively.');
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
  const ballastRationale = distanceNm <= 0
    ? `~0 nm to reposition — practically on the doorstep.`
    : share >= 0.9
      ? `~${Math.round(distanceNm)} nm to reposition to load port — practically on the doorstep.`
      : `~${Math.round(distanceNm)} nm to reposition to load port — within a ${cls}'s range (~${radius} nm) but not on the doorstep.`;
  return {
    factor: 'ballast',
    label: 'Ballast distance',
    weight: w,
    score: Math.round(w * Math.max(0, share) * 10) / 10,
    rationale: ballastRationale,
    bracketData: `~${fmt(distanceNm)} nm`,
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
    return unknown('classFit', 'Class fit', 'Cargo weight or vessel DWT not stated, scored conservatively.');
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
  const classFitSuffix = partCargo
    ? 'normal for part-cargo parcels'
    : ratio < 1.0
      ? 'cargo bigger than ship — overloaded'
      : ratio <= 1.35
        ? 'the right size class for this parcel'
        : ratio <= 2.0
          ? 'slightly oversized for this cargo'
          : 'oversized — some deadfreight likely';
  return {
    factor: 'classFit',
    label: 'Class fit',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: `Ship ${vesselDwt} dwt vs cargo ${cargoWtMax} mt (ratio ${ratio.toFixed(2)}) — ${classFitSuffix}.`,
    bracketData: `${fmt(vesselDwt)} / ${fmt(cargoWtMax)} mt`,
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
    return unknown('cargoType', 'Cargo type quality', 'Cargo or vessel type not stated, scored conservatively.');
  }
  const v = vesselType.toLowerCase();
  const lc = (lastCargoes ?? '').toLowerCase();
  let share = 0.7;
  let why = `Vessel type ${vesselType} — compatibility not classified.`;
  if (cargoType === 'BULK') {
    if (/bulk|handysize|supramax|panamax|capesize|ultramax|handymax/.test(v)) {
      const hasBulkHistory = /grain|wheat|barley|coal|ore|fertilizer|urea|salt|sugar|cement|gypsum/.test(lc);
      share = hasBulkHistory ? 1.0 : 0.85;
      why = hasBulkHistory ? 'Bulk-class ship matched to bulk cargo — confirmed loading history.' : 'Bulk-class ship matched to bulk cargo.';
    } else if (/mpp|multi-?purpose|general/.test(v)) {
      share = 0.55;
      why = 'MPP vessel — fit marginal for bulk cargo.';
    }
  } else if (cargoType === 'BREAK_BULK' || cargoType === 'PROJECT') {
    if (/mpp|multi-?purpose|general|heavy.?lift/.test(v)) {
      const hasBBHistory = /steel|pipe|bagged|breakbulk|project|rebar|lumber|machinery/.test(lc);
      share = hasBBHistory ? 1.0 : 0.85;
      why = hasBBHistory ? 'MPP ship suits breakbulk/project cargo — confirmed loading history.' : 'MPP ship suits breakbulk cargo — small deduction (not a purpose-built carrier).';
    } else if (/bulk/.test(v)) {
      share = 0.5;
      why = 'Bulker carrying breakbulk — geared bulker only, small deduction.';
    }
  } else if (cargoType === 'FCL' || cargoType === 'LCL' || cargoType === 'CONTAINER') {
    if (/container/.test(v)) { share = 1.0; why = 'Container vessel matched to container cargo.'; }
  } else if (cargoType === 'RORO') {
    if (/ro.?ro|car carrier/.test(v)) { share = 1.0; why = 'RORO vessel matched to RORO cargo.'; }
  } else if (cargoType === 'OTHER') {
    share = 0.65;
    why = 'Cargo type unspecified — cannot assess vessel suitability.';
  }
  return {
    factor: 'cargoType',
    label: 'Cargo type quality',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: why,
  };
}

/** Build crane detail clause appended to gearless rationale strings.
 *  Returns empty string if the port has no SWL/operator data (no dangling disclaimer). */
function craneSuffix(portName: string | null): string {
  if (!portName) return '';
  const master = getPortMaster(portName);
  if (!master) return '';
  const { craneSWL, terminalOperator, craneDataAsOf } = master;
  if (craneSWL === undefined && !terminalOperator) return '';
  const parts: string[] = [];
  if (craneSWL !== undefined) parts.push(`SWL ${craneSWL} t`);
  if (terminalOperator) parts.push(`operator ${terminalOperator}`);
  if (craneDataAsOf) parts.push(`data ${craneDataAsOf}`);
  parts.push('confirm with port agent');
  return ` (${parts.join(', ')})`;
}

/** Cranes — geared vessel is always 100%; gearless depends on shore cranes at
 *  EITHER cargo-handling end (load and/or discharge). Names which end has them. */
export function scoreCranes(
  geared: boolean | null | undefined,
  loadPort: string | null,
  dischargePort: string | null,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.cranes;
  if (geared === true) {
    return { factor: 'cranes', label: 'Cranes', weight: w, score: w, rationale: 'Ship is geared — no dependence on shore cranes.', bracketData: 'geared' };
  }
  if (geared === false) {
    const loadCranes = portHasShoreCranes(loadPort);
    const dischCranes = portHasShoreCranes(dischargePort);
    const loadName = loadPort ?? 'load port';
    const dischName = dischargePort ?? 'discharge port';
    if (loadCranes === false && dischCranes === false) {
      return { factor: 'cranes', label: 'Cranes', weight: w, score: 0, rationale: 'Ship is gearless and neither load nor discharge port has cranes — not workable.', bracketData: 'gearless — no cranes' };
    }
    if (loadCranes === true || dischCranes === true) {
      let where: string;
      let cranePort: string | null;
      if (loadCranes === true && dischCranes === true) {
        where = `both ports (${loadName} and ${dischName}) have shore cranes`;
        // Use discharge port for enrichment when both have cranes
        cranePort = dischargePort;
      } else if (dischCranes === true) {
        where = `discharge port (${dischName}) has shore cranes`;
        cranePort = dischargePort;
      } else {
        where = `load port (${loadName}) has shore cranes`;
        cranePort = loadPort;
      }
      const suffix = craneSuffix(cranePort);
      return { factor: 'cranes', label: 'Cranes', weight: w, score: Math.round(w * 0.85 * 10) / 10, rationale: `Ship is gearless, but ${where}${suffix} — workable.`, bracketData: 'gearless — port cranes ✓' };
    }
    return { factor: 'cranes', label: 'Cranes', weight: w, score: Math.round(w * 0.55 * 10) / 10, rationale: 'Ship is gearless; crane availability at load/discharge not yet confirmed.' };
  }
  return unknown('cranes', 'Cranes', 'Vessel gear status not stated, scored conservatively.');
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
    return unknown('volume', 'Volume / hold fit', 'Cargo weight or grain capacity not stated, scored conservatively.');
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
  if (ratio <= 0.7) { share = 0.85; why = `Cargo takes ~${Math.round(ratio * 100)}% of the ship's grain capacity — comfortable fit, room to spare.`; }
  else if (ratio <= 0.9) { share = 1.0; why = `Cargo takes ~${Math.round(ratio * 100)}% of the ship's grain capacity — ideal fill.`; }
  else if (ratio <= 1.0) { share = 0.85; why = `Cargo takes ~${Math.round(ratio * 100)}% of the ship's grain capacity — a tight but workable fit.`; }
  else { share = 0.25; why = `Cargo takes ~${Math.round(ratio * 100)}% of the ship's grain capacity — cargo overflows the holds.`; }
  return {
    factor: 'volume',
    label: 'Volume / hold fit',
    weight: w,
    score: Math.round(w * share * 10) / 10,
    rationale: why,
    bracketData: `${Math.round(ratio * 100)}% of grain`,
  };
}

/** Draft headroom — uses hardFilters.draft pass/fail; pass = full points,
 *  borderline (within 0.5m of port max) = marginal. Hard-gate failures are
 *  already filtered upstream so this only scores survivors. */
export function scoreDraft(hardFilters: MatchHardFilters | undefined): FitBreakdownComponent {
  const w = FIT_WEIGHTS.draft;
  const draftCheck = hardFilters?.draft;
  if (!draftCheck) {
    return unknown('draft', 'Draft / port headroom', 'Draft check not performed, scored conservatively.');
  }
  if (draftCheck.pass) {
    if (draftCheck.estimatedLadenDraftM != null && draftCheck.portLimitM != null) {
      return {
        factor: 'draft', label: 'Draft / port headroom', weight: w, score: w,
        rationale: `Estimated laden draft ~${draftCheck.estimatedLadenDraftM.toFixed(1)}m (approximate, conservative) within port limit ${draftCheck.portLimitM.toFixed(1)}m.`,
      };
    }
    return { factor: 'draft', label: 'Draft / port headroom', weight: w, score: w, rationale: "Vessel's maximum stated draft is within the port's limit. Actual laden draft not computed." };
  }
  return { factor: 'draft', label: 'Draft / port headroom', weight: w, score: 0, rationale: `Ship draws too much for the port${draftCheck.reason ? ` — ${draftCheck.reason}` : ''}.` };
}

/** Vetting — 5-factor soft signal: flag (Paris MoU) / class (IACS) / age / P&I / CII.
 *  Score 0..1 from computeVesselVetting, multiplied by weight.
 *  When refYear is absent and built is set, age falls back to unknown (neutral).
 *  unknown ≠ penalty — consistent with UNKNOWN_SHARE pattern above.
 */
export function scoreVetting(vessel: ParsedVessel, refYear?: number, detentionCount?: number): FitBreakdownComponent {
  const w = FIT_WEIGHTS.vetting;
  // If refYear not provided, treat age as unknown by zeroing built temporarily.
  const effectiveVessel = refYear != null
    ? vessel
    : { ...vessel, built: null };
  const effectiveRefYear = refYear ?? 0;
  const result = computeVesselVetting(effectiveVessel, { refYear: effectiveRefYear, detentionCount });
  const rationale = result.badges.length > 0
    ? `Items to confirm before fixing: ${result.badges.join(', ')}.`
    : result.factors.every((f) => f.verdict === 'unknown')
      ? 'Vetting data unavailable — scored neutral.'
      : 'Vetting clean — no open items.';
  return {
    factor: 'vetting',
    label: 'Vessel vetting',
    weight: w,
    score: Math.round(w * result.score * 10) / 10,
    rationale,
    bracketData: detentionCount != null ? `${detentionCount} detentions` : undefined,
  };
}

/** Economics — smooth gradient based on TCE vs class-normalised breakeven.
 *  Neutral (0.5) at class breakeven; profit above → toward 1; loss below → toward 0.
 *  null/undefined TCE → 0.5 (no reward, no penalty). NOT a binary cap.
 *
 */
function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function economicsNorm(tceUsdPerDay: number | null | undefined, vesselDwt: number): number {
  if (tceUsdPerDay == null || !Number.isFinite(tceUsdPerDay) || !(vesselDwt > 0)) return 0.5;
  const breakeven = breakevenTceByDwt(vesselDwt);
  const scale = Math.max(breakeven, 1);
  return clamp01(0.5 + 0.5 * Math.tanh((tceUsdPerDay - breakeven) / scale));
}

export function scoreEconomics(
  tceUsdPerDay: number | null | undefined,
  vesselDwt: number | null | undefined,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.economics;
  const dwt = vesselDwt ?? 0;
  const norm = economicsNorm(tceUsdPerDay, dwt);
  const score = Math.round(w * norm);
  let rationale: string;
  let economicsBracket: string | undefined;
  if (tceUsdPerDay == null) {
    rationale = 'TCE not available — economics scored neutral.';
  } else if (!(dwt > 0)) {
    rationale = 'Vessel DWT not stated — economics scored neutral.';
  } else {
    const breakeven = breakevenTceByDwt(dwt);
    const diff = tceUsdPerDay - breakeven;
    if (diff >= 0) {
      rationale = `TCE $${Math.round(tceUsdPerDay).toLocaleString('en-US')}/day — $${Math.round(diff).toLocaleString('en-US')}/day above class breakeven.`;
    } else {
      rationale = `TCE $${Math.round(tceUsdPerDay).toLocaleString('en-US')}/day — $${Math.round(Math.abs(diff)).toLocaleString('en-US')}/day below class breakeven.`;
    }
    economicsBracket = `$${fmt(tceUsdPerDay)} / $${fmt(breakeven)} BE`;
  }
  return {
    factor: 'economics',
    label: 'Economics (TCE)',
    weight: w,
    score,
    rationale,
    bracketData: economicsBracket,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level — composes all components, applies sanctions, returns fit-%.
// ────────────────────────────────────────────────────────────────────────────

// EU / near-EU country & range keywords triggering PSC age scrutiny on discharge.
// Substring match on the RAW descriptor (diacritics folded) — works on the vague
// re-parsed strings ("East Coast Greece port (unspecified)") that
// regionMatchesPort cannot resolve. Country names only — ambiguous basin phrases
// ("Western Mediterranean") are intentionally excluded to avoid false positives.
const EU_DISCHARGE_KEYWORDS =
  /\b(greece|greek|italy|italian|romania|romanian|constanta|bulgaria|bulgarian|spain|spanish|france|french|netherlands|dutch|belgium|belgian|germany|german|croatia|croatian|slovenia|slovenian|portugal|portuguese|cyprus|cypriot|malta|maltese|poland|polish|european continent|ara range)\b/i;

// Region-vagueness markers. The country-substring fallback is consulted ONLY for
// descriptors that read as a vague AREA — "East Coast Greece port (unspecified)",
// "Greece (1 port)", "European Continent (ARA range)" — and never for concrete
// place names that merely contain an EU-country word: "Dutch Harbor" (Alaska),
// "New Germany" (Durban), "Poland Spring" (Maine), "Spanish Town", "French
// Guiana". Without this gate the loose substring regex flagged those as EU.
// (Cold QA 2026-06-02.)
const VAGUE_DESCRIPTOR_RX =
  /\b(unspecified|range|coast|ports?|anchorage|area|region|basin|cluster|terminal|continent|gulf)\b|\(/i;

/**
 * EU-discharge detector for the age cap. True when EITHER:
 *   1. the port resolves to Europe via the canonical region map, OR
 *   2. the descriptor is a vague AREA (no concrete port resolves) that names an
 *      EU/near-EU country via EU_DISCHARGE_KEYWORDS.
 *
 * The country-substring fallback (2) is double-gated — `resolvePort` returns null
 * (so it is not a concrete port) AND the text looks like a vague area — so a
 * concrete non-EU port whose name merely contains an EU-country word is not
 * mis-flagged. Isolated from regionMatchesPort so widening detection here does
 * NOT affect the hard voyage-restriction gate (its other consumer).
 */
function isEuropeanDischarge(port: string | null | undefined): boolean {
  if (!port) return false;
  // Primary: a concrete port → EU iff its RESOLVED country is EU/EEA. This catches
  // named EU ports the region map omits (Monfalcone/IT, Gijón/ES, Catania/IT,
  // Thisvi/GR — founder Gate5 2026-06-03) AND correctly rejects non-EU Mediterranean
  // ports (Bejaia/DZ, Alexandria/EG) that the 'europe' region map wrongly swept in
  // via the Mediterranean basin. resolvePort folds diacritics (Constanța→Constanta).
  const resolved = resolvePort(port);
  if (resolved) return isEuCountry(resolved.country);
  // Fallback: vague AREA descriptor (no concrete port resolves) that names an EU
  // country ("East Coast Greece port (unspecified)"). Double-gated so a non-EU
  // place name merely containing an EU-country word ("New Germany") is not flagged.
  if (!VAGUE_DESCRIPTOR_RX.test(port)) return false;
  const folded = port.normalize('NFKD').replace(/\p{Diacritic}/gu, '');
  return EU_DISCHARGE_KEYWORDS.test(folded);
}

export interface FitBreakdownInput {
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  readiness: MatchReadiness | undefined;
  sanctions: MatchSanctions | undefined;
  hardFilters: MatchHardFilters | undefined;
  /** Calendar year used for vessel-age arithmetic. If absent, age is treated as unknown. */
  refYear?: number;
  /** Pre-computed TCE $/day fed into the economics gradient factor. Absent/undefined → no cap (conservative). */
  tceUsdPerDay?: number | null;
  /** PSC detentions in lookback window (resolved upstream where db is in scope). Absent → PSC factor omitted (neutral). */
  detentionCount?: number;
  /** Charterer credit tier (counterparty side). Absent/null → no penalty (unknown = neutral). */
  chartererTier?: 'blue-chip' | 'second' | 'weak' | null;
}

export function computeFitBreakdown(input: FitBreakdownInput): FitBreakdown {
  const { cargo, vessel, readiness, sanctions, hardFilters, refYear, tceUsdPerDay, detentionCount, chartererTier } = input;
  const desc = cfValue(cargo.cargoDescription);
  const partCargo = isPartCargo(desc);

  const cargoWtMax = resolveCargoWeight(cargo);                  // worst-case: caps + overload gate (#792) + transparency
  const cargoWtNominal = cfValue(cargo.weightMt) ?? cargoWtMax;  // nominal: display-facing scoring (#865)
  const dwt = cfValue(vessel.dwtSummer);
  const dwcc = cfValue(vessel.dwcc);
  const capacity = dwcc != null && dwcc > 0 ? dwcc : dwt;

  const components: FitBreakdownComponent[] = [
    scoreUtilisation(cargoWtNominal, capacity, partCargo),
    scoreTiming(readiness),
    scoreBallast(readiness?.distanceNm ?? null, dwt),
    scoreClassFit(cargoWtNominal, dwt, partCargo),
    scoreCargoTypeQuality(cargo.cargoType, vessel.vesselType, vessel.lastCargoes),
    scoreCranes(vessel.geared, cfValue(cargo.originPort), cfValue(cargo.destinationPort)),
    scoreVolume(cargoWtNominal, desc, vessel.grainCapacity, cargo.stowageFactor),
    scoreDraft(hardFilters),
    scoreVetting(vessel, refYear, detentionCount),
    scoreEconomics(tceUsdPerDay, dwt),
  ];

  const rawSum = components.reduce((a, c) => a + c.score, 0);
  // Sanctions adjustment — MEDIUM trims 8 pts off (matches legacy -10 from
  // scoreBreakdown, scaled to the smaller dynamic range broker views).
  const sanctionsPenalty = sanctions?.risk === 'MEDIUM' ? 8 : 0;
  const chartererPenalty = chartererTier ? CHARTERER_TIER_PENALTY[chartererTier] : 0;
  let fit = rawSum - sanctionsPenalty - chartererPenalty;

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
  // EU-discharge age penalty (founder rule 2026-06-02): a 25yr+ vessel
  // discharging at a European port faces PSC scrutiny + charterer reluctance.
  // Soft signal — cap below the main-board floor so it drops off the board but
  // stays visible in Review. NOT a hard knockout (distinct from the explicit
  // cargo max-age hard gate in match-filters, which is a charterer's firm ban).
  const euDischargeAge = refYear != null && vessel.built != null ? refYear - vessel.built : null;
  if (
    euDischargeAge != null &&
    euDischargeAge >= 25 &&
    isEuropeanDischarge(cfValue(cargo.destinationPort))
  ) {
    caps.push({
      reason: `vessel ${euDischargeAge}yr + EU discharge — PSC/charterer age risk`,
      ceiling: 55,
    });
  }
  // NOTE: the binary tce<0 → ceiling 40 cap has been REMOVED (Task 1).
  // Economics is now represented as a smooth gradient via scoreEconomics above.
  // The hard money-loser floor is enforced by pair-analyzer.ts bucket routing.

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
    chartererPenalty,
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
