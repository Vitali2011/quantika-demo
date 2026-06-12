import type {
  ConfidenceField,
  Match, MatchLevel, MatchReadiness, MatchSanctions,
  ParsedCargo, ParsedVessel, ScoreBreakdown, ScoreBreakdownComponent,
} from '@/lib/types';
import { cfValue } from '@/lib/types';
import { resolveCargoWeight } from './cargo-weight';

// ────────────────────────────────────────────────────────────────────────────
// Confidence multipliers (Spec-05)
// Maps ParseConfidence values → scoring weight.
// ────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  confirmed:   1.0,
  interpreted: 0.7,
  uncertain:   0.4,
};

function getMinMultiplier(...fields: (ConfidenceField<unknown> | null | undefined)[]): number {
  let min = 1.0;
  for (const f of fields) {
    if (f != null) {
      const m = CONFIDENCE_MULTIPLIERS[f.confidence];
      if (m < min) min = m;
    }
  }
  return min;
}
import { portHasShoreCranes } from './port-master';
import { STOWAGE_FACTORS, checkCargoVesselCompat } from './match-filters';
import { isVagueRegion } from './vague-region-detector';
import { classifyVesselByDwt } from './readiness-gap';
import type { VesselClassName } from '@/lib/constants';

// ────────────────────────────────────────────────────────────────────────────
// Cargo history keyword sets for scoring quality within compatible pairs
// ────────────────────────────────────────────────────────────────────────────

const BULK_KEYWORDS = [
  'grain', 'wheat', 'barley', 'corn', 'maize', 'soybean', 'rice',
  'coal', 'iron ore', 'bauxite', 'fertilizer', 'urea', 'potash',
  'salt', 'sugar', 'cement', 'gypsum', 'scrap',
];

const BREAK_BULK_KEYWORDS = [
  'steel', 'pipe', 'bagged', 'bags', 'breakbulk', 'break-bulk',
  'project', 'rebar', 'lumber', 'timber', 'plywood', 'machinery',
];

const CONTAINER_KEYWORDS = ['container', 'box', 'teu'];

// Re-export the vessel categorizer from match-filters via a local wrapper so we
// can import it without duplicating regex logic.  The function is not exported
// from match-filters, so we replicate the exact same logic here (kept in sync).
function categorizeVesselLocal(raw: string | null | undefined): 'bulk' | 'mpp' | 'tanker' | 'container' | 'roro' | 'unknown' {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (/tanker|oil|chemical|product/.test(s)) return 'tanker';
  if (/mpp|multi-?purpose|general cargo|gc|break.?bulk|heavy.?lift/.test(s)) return 'mpp';
  if (/container|containership/.test(s)) return 'container';
  if (/ro.?ro|roro|car carrier/.test(s)) return 'roro';
  if (/bulk|handysize|supramax|panamax|capesize|handymax|ultramax/.test(s)) return 'bulk';
  return 'unknown';
}

interface CargoTypeScoreInput {
  cargoType: string | null | undefined;
  vesselType: string | null | undefined;
  lastCargoes: string | null | undefined;
  geared: boolean | null | undefined;
  grainCapacity: number | null | undefined;
}

function scoreCargoTypeMatch(input: CargoTypeScoreInput): { points: number; reason: string } {
  const { cargoType, vesselType, lastCargoes, geared, grainCapacity } = input;

  if (!cargoType || !vesselType) {
    return { points: 4, reason: 'cargo or vessel type unspecified' };
  }

  const cat = categorizeVesselLocal(vesselType);
  const lcLower = (lastCargoes ?? '').toLowerCase();

  switch (cargoType) {
    case 'BULK': {
      if (cat === 'bulk' && BULK_KEYWORDS.some(k => lcLower.includes(k))) {
        return { points: 20, reason: 'bulk vessel with confirmed bulk cargo history' };
      }
      if (cat === 'bulk') {
        return { points: 16, reason: 'bulk-class vessel, cargo history unclear' };
      }
      if (cat === 'mpp' && grainCapacity && grainCapacity > 3000) {
        return { points: 12, reason: 'MPP vessel with sufficient grain capacity for bulk' };
      }
      if (cat === 'mpp') {
        return { points: 8, reason: 'MPP fit marginal for bulk' };
      }
      return { points: 4, reason: `bulk cargo on ${cat} vessel — not primary fit` };
    }

    case 'BREAK_BULK':
    case 'PROJECT': {
      if (cat === 'mpp' && BREAK_BULK_KEYWORDS.some(k => lcLower.includes(k))) {
        return { points: 20, reason: 'MPP with confirmed breakbulk/project cargo history' };
      }
      if (cat === 'mpp') {
        return { points: 16, reason: 'MPP vessel — ideal for breakbulk/project' };
      }
      if (cat === 'bulk' && geared === true) {
        return { points: 12, reason: 'geared bulker can handle bagged/breakbulk cargo' };
      }
      if (cat === 'bulk') {
        return { points: 8, reason: 'gearless bulker marginal for breakbulk' };
      }
      return { points: 4, reason: `${cargoType} cargo on ${cat} vessel — not primary fit` };
    }

    case 'FCL':
    case 'LCL': {
      if (cat === 'container' && CONTAINER_KEYWORDS.some(k => lcLower.includes(k))) {
        return { points: 20, reason: 'container vessel with confirmed container history' };
      }
      if (cat === 'container') {
        return { points: 16, reason: 'container vessel — ideal for FCL/LCL' };
      }
      return { points: 4, reason: `container cargo on ${cat} vessel — not suitable` };
    }

    case 'RORO': {
      if (cat === 'roro') {
        return { points: 20, reason: 'RORO vessel — perfect match for RORO cargo' };
      }
      return { points: 4, reason: `RORO cargo on ${cat} vessel — not suitable` };
    }

    case 'OTHER': {
      if (cat !== 'unknown') {
        return { points: 12, reason: `OTHER cargo on ${cat} vessel — match credible but cargo unspecified` };
      }
      return { points: 8, reason: 'OTHER cargo on unknown vessel type — cannot evaluate' };
    }

    default:
      return { points: 4, reason: `unrecognised cargo type ${cargoType}` };
  }
}

// Silence unused import warning — checkCargoVesselCompat is re-exported for callers that need it
void checkCargoVesselCompat;

/**
 * Derive matchLevel from a numeric score.
 * Single source of truth — used by both LLM and sweep paths in route.ts.
 */
export function deriveMatchLevel(score: number): MatchLevel {
  if (score >= 70) return 'good';
  if (score >= 40) return 'possible';
  return 'weak';
}

/**
 * Derive matchLevel from fitPercent (spec §3.4).
 * Thresholds: fit ≥70 → 'good'; fit ≥60 → 'possible'; else 'weak'.
 * Matches the main floor (fit ≥60) and surfaces the broker-facing view.
 * Safety demotions (ballast cap, deadfreight, floor) run after and may lower the level.
 */
export function deriveMatchLevelFromFit(fit: number): MatchLevel {
  if (fit >= 70) return 'good';
  if (fit >= 60) return 'possible';
  return 'weak';
}

// ────────────────────────────────────────────────────────────────────────────
// Ballast + size realism cap (Wave C — levers 3 + 4, handover 2026-05-30)
//
// Ballast distance and cargo/vessel size proportion previously only nudged the
// score. A 'good' match that needs an uneconomic ballast leg for its vessel
// class (lever 3), or whose cargo fills too little of the vessel — deadfreight
// (lever 4) — is not a candidate a broker would call. These guards cap such a
// match to 'possible' (never below — the pair still shows, flagged with an
// issue), EXCEPT legitimate part-cargo loads, where low utilisation is normal
// in handysize/breakbulk trade (one vessel lifts several small parcels).
// Research basis: docs/research/match-realism-2026-05/README.md (levers 3+4).
// ────────────────────────────────────────────────────────────────────────────

/** Class-aware maximum ballast distance (nm) for a match to still rank 'good'.
 *  The demo fleet is small geared/near-sea tonnage (median ~7k DWT), region-bound
 *  with a SHORT ballast radius; larger vessels cross basins under a ballast bonus.
 *  handysize 1500nm is the research "worth-calling" ballast cap (match-realism funnel). */
export const BALLAST_GOOD_MAX_NM: Record<VesselClassName, number> = {
  handysize: 1500,
  supramax: 2000,
  panamax: 2500,
  capesize: 4000,
};

/** Minimum cargo/vessel utilisation for a non-part-cargo match to rank 'good'.
 *  Below this the vessel sails largely empty (deadfreight). A full cargo loads
 *  85–98% of DWT; <50% is disproportion. util at exactly the threshold stays good. */
export const PROPORTION_GOOD_MIN_UTIL = 0.5;

/** Score a capped match is lowered to — just under the 'good' (≥70) threshold,
 *  so deriveMatchLevel returns 'possible' while preserving relative order. */
const GOOD_CAP_SCORE = 69;

/** True when the cargo is explicitly flagged as a part cargo / part load / part
 *  lot. In handysize/breakbulk one vessel routinely lifts several small parcels,
 *  so low utilisation is expected and must NOT be penalised as disproportion.
 *
 *  Tolerant of real broker phrasing: plurals ("part cargoes", "part loads"),
 *  the "p/c" abbreviation, and arbitrary separators (space/underscore/hyphen,
 *  zero or more — "partcargo", "part_cargo", "part  cargo"). The left `\bpart`
 *  boundary keeps it from firing on "counterpart cargo" / "departure cargo" /
 *  "partial cargo". Bare "parcel" is intentionally not matched — it would
 *  over-exempt full small lots and let disproportionate matches survive 'good'. */
export function isPartCargo(cargoDescription: string | null | undefined): boolean {
  if (!cargoDescription) return false;
  return /\bpart[\s_-]*(?:cargo(?:es|s)?|load(?:s)?|lot(?:s)?)\b|\bp\s*\/\s*c\b/i.test(
    cargoDescription,
  );
}

export interface BallastSizeCapInput {
  match: Match;
  /** Ballast distance (open position → load port), from readiness.distanceNm. */
  distanceNm: number | null;
  vesselDwt: number | null;
  vesselDwcc: number | null;
  /** Cargo upper-bound weight (weightMtMax ?? weightMt). */
  cargoWeightMax: number | null;
  cargoDescription: string | null;
}

/**
 * Cap a 'good' match to 'possible' on ballast distance (lever 3) or size
 * disproportion (lever 4).
 *
 * Pure — returns a shallow copy; only ever lowers the tier, never raises it;
 * idempotent (won't duplicate BALLAST:/SIZE: issue text). Missing data never
 * triggers a cap (conservative): unknown distance OR unknown vessel DWT skips
 * the ballast guard (we can't pick a class radius without a DWT), unknown
 * capacity skips the size guard. Part-cargo loads are exempt from the size guard.
 */
export function applyBallastSizeCap(input: BallastSizeCapInput): Match {
  const { match, distanceNm, vesselDwt, vesselDwcc, cargoWeightMax, cargoDescription } = input;

  // Only a 'good'-tier match can be capped; never raise a lower tier.
  // matchLevel is now derived from fitPercent (not score), so use matchLevel as the guard.
  if (match.matchLevel !== 'good') return match;

  const newIssues: string[] = [];

  // Lever 3 — ballast distance vs the vessel-class radius. Skip when DWT is
  // unknown: classifyVesselByDwt would default to handysize (the strictest
  // radius) and demote on an assumption — not conservative on missing data.
  if (vesselDwt != null && distanceNm != null && Number.isFinite(distanceNm)) {
    const cls = classifyVesselByDwt(vesselDwt);
    const maxNm = BALLAST_GOOD_MAX_NM[cls];
    if (distanceNm > maxNm) {
      newIssues.push(
        `BALLAST: ${Math.round(distanceNm)}nm exceeds ${cls} ballast radius ${maxNm}nm — uneconomic, capped to possible`,
      );
    }
  }

  // Lever 4 — size proportion (utilisation), with part-cargo exemption.
  const capacity = vesselDwcc != null && vesselDwcc > 0
    ? vesselDwcc
    : vesselDwt != null && vesselDwt > 0
      ? vesselDwt
      : null;
  if (capacity != null && cargoWeightMax != null && cargoWeightMax > 0) {
    const util = cargoWeightMax / capacity;
    if (util < PROPORTION_GOOD_MIN_UTIL && !isPartCargo(cargoDescription)) {
      newIssues.push(
        `SIZE: cargo fills only ${Math.round(util * 100)}% of vessel (deadfreight) — disproportion, capped to possible`,
      );
    }
  }

  if (newIssues.length === 0) return match;

  const updated: Match = { ...match };
  updated.score = Math.min(updated.score, GOOD_CAP_SCORE);
  updated.matchLevel = deriveMatchLevel(updated.score);
  const existing = Array.isArray(updated.issues) ? updated.issues : [];
  // Idempotent: drop any new issue whose tag (BALLAST:/SIZE:) is already present.
  const fresh = newIssues.filter(
    (i) => !existing.some((e) => e.startsWith(i.slice(0, i.indexOf(':') + 1))),
  );
  updated.issues = [...existing, ...fresh];
  return updated;
}

/**
 * Apply DWCC overload hard guard.
 *
 * If cargo maximum weight exceeds vessel DWCC (deadweight cargo capacity at
 * design draft), the match is physically impossible to load. Regardless of the
 * aggregate score, the tier is forced to 'weak', score is capped at 35, and an
 * OVERLOAD warning is appended to issues.
 *
 * Pure function — safe to call repeatedly; only mutates a shallow copy.
 */
export function applyOverloadGuard(
  match: Match,
  cargo: ParsedCargo | null | undefined,
  vessel: ParsedVessel | null | undefined,
): Match {
  const dwcc = vessel ? cfValue(vessel.dwcc) : null;
  const weightMax = resolveCargoWeight(cargo);
  if (dwcc != null && dwcc > 0 && weightMax != null && weightMax > dwcc) {
    const updated: Match = { ...match };
    updated.matchLevel = 'weak';
    updated.score = Math.min(updated.score, 35);
    const issue = `OVERLOAD: cargo ${weightMax}mt exceeds vessel DWCC ${dwcc}mt`;
    const existingIssues = Array.isArray(updated.issues) ? updated.issues : [];
    // Idempotent: do not append duplicate OVERLOAD entry
    if (!existingIssues.some((i) => i.startsWith('OVERLOAD:'))) {
      updated.issues = [...existingIssues, issue];
    } else {
      updated.issues = existingIssues;
    }
    return updated;
  }
  return match;
}

/**
 * Apply readiness-based score adjustment + add contextual issue text.
 *
 * Pure function — extracted here (rather than inlined in the route) so Next.js
 * doesn't reject it as a non-standard route export, and so it's independently
 * unit-testable.
 *
 * Optional cargo/vessel parameters enable the DWCC overload hard guard to run
 * in the same pass as readiness scoring.
 */
/**
 * Compute idle-verdict score penalty scaled by gap magnitude.
 * Phase B calibration: 67-day idle was scoring same as 5-day idle (-15);
 * extended idle is much worse for charterers because owner cost-risk compounds
 * (vessel sits idle accruing operating costs, has alternative cargo bids, etc.).
 */
export function idleScorePenalty(gapDays: number | null | undefined): number {
  if (gapDays == null || !Number.isFinite(gapDays)) return -15;
  const days = Math.abs(gapDays);
  if (days > 30) return -35;
  if (days > 14) return -25;
  return -15;
}

export function applyReadinessScoring(
  match: Match,
  readiness: MatchReadiness | undefined,
  cargo?: ParsedCargo | null,
  vessel?: ParsedVessel | null,
): Match {
  let updated: Match;

  if (!readiness) {
    // No readiness data — still apply overload guard if cargo/vessel available
    updated = { ...match };
  } else {
    updated = { ...match, readiness };

    switch (readiness.verdict) {
      case 'ideal':
        updated.score = Math.min(100, match.score + 10);
        break;
      case 'idle': {
        const penalty = idleScorePenalty(readiness.gapDays);
        updated.score = Math.max(0, match.score + penalty);
        const days = readiness.gapDays != null ? Math.round(readiness.gapDays) : null;
        const severity = penalty <= -35 ? ' (severe, > 30d)' : penalty <= -25 ? ' (extended, > 14d)' : '';
        const issue = days != null
          ? `Vessel idle ${days}d before laycan${severity} — owner likely won't wait unpaid`
          : 'Vessel idle for several days before laycan — check willingness to hold';
        updated.issues = Array.isArray(match.issues) ? [...match.issues, issue] : [issue];
        break;
      }
      case 'late': {
        // Safety net — hard filter should drop these, but if LLM returned one anyway, penalize heavily
        updated.score = Math.max(0, match.score - 30);
        const days = readiness.gapDays != null ? Math.abs(Math.round(readiness.gapDays)) : null;
        const issue = days != null
          ? `Vessel arrives ${days}d after laycan start — misses window`
          : 'Vessel arrives after laycan start';
        updated.issues = Array.isArray(match.issues) ? [...match.issues, issue] : [issue];
        break;
      }
      case 'tight':
      case 'unknown':
      default:
        // no score adjustment
        break;
    }

    updated.matchLevel = deriveMatchLevel(updated.score);
  }

  // DWCC overload hard guard — must run after score/level adjustment so it
  // cannot be overridden by the readiness bonus (e.g. ideal +10 pts).
  return applyOverloadGuard(updated, cargo, vessel);
}

// ────────────────────────────────────────────────────────────────────────────
// Geographic proximity — piecewise step scoring
// ────────────────────────────────────────────────────────────────────────────

function scoreGeographicProximity(
  distanceNm: number | null,
  vagueLabel: string | null = null,
): { points: number; reason: string } {
  if (vagueLabel) {
    return {
      points: 2,
      reason: `position vague (${vagueLabel}) — cannot estimate proximity precisely`,
    };
  }
  if (distanceNm == null) {
    return { points: 6, reason: 'distance could not be computed from available port data' };
  }
  const d = Math.round(distanceNm / 10) * 10;
  if (distanceNm <= 300) {
    return { points: 20, reason: 'vessel within 300nm of load port — prompt arrival' };
  }
  if (distanceNm <= 800) {
    return { points: 16, reason: `short ballast ${d}nm` };
  }
  if (distanceNm <= 1500) {
    return { points: 12, reason: `medium ballast ${d}nm — typical for dry bulk` };
  }
  if (distanceNm <= 2500) {
    return { points: 8, reason: `long ballast ${d}nm — acceptable for tramp trade` };
  }
  if (distanceNm <= 4000) {
    return { points: 4, reason: `very long ballast ${d}nm — requires economic justification` };
  }
  return { points: 1, reason: `${d}nm — cross-basin, feasible only for capesize or larger` };
}

// ────────────────────────────────────────────────────────────────────────────
// Structured score breakdown (task 3.3) — transparent "why this score?" UI
// ────────────────────────────────────────────────────────────────────────────

export interface ScoreBreakdownInput {
  match: Match;
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  readiness: MatchReadiness | undefined;
  sanctions: MatchSanctions | undefined;
}

/**
 * Produce a structured breakdown that explains how we got to the final score.
 *
 * Components scored (all optional, pass-through when data missing):
 *   1. Geographic proximity (0-20) — from readiness.distanceNm (closer = more)
 *   2. Cargo type match    (0-20) — does vessel category match cargo type?
 *   3. Geared/crane match  (0-15) — vessel gear + port cranes compatibility
 *   4. Volume fit           (0-15) — grain capacity ÷ required m³ ratio
 *   5. Laycan fit           (0-20) — readiness verdict maps to timing quality
 *   6. DWT class            (0-10) — approximate fit between cargo weight and vessel DWT
 *
 * Totals: basePhysical max = 100, then readinessAdjustment (±10/15) +
 * sanctionsAdjustment (-10 for MEDIUM, -50 effectively if blocking but those
 * matches never reach this function).
 */
export function computeScoreBreakdown(input: ScoreBreakdownInput): ScoreBreakdown {
  const { cargo, vessel, readiness, sanctions } = input;
  const components: ScoreBreakdownComponent[] = [];

  // 1. Geographic proximity
  // Confidence: cargo.originPort, vessel.openPosition
  // Phase D2: detect vague-region (e.g. 'East Coast Greece', 'Tunisia') — if so, cap geo points
  // and apply a flat score penalty so vague pairs drop to the 'weak' tier.
  const distance = readiness?.distanceNm ?? null;
  const vesselPosVague = isVagueRegion(cfValue(vessel.openPosition));
  const cargoOriginVague = isVagueRegion(cfValue(cargo.originPort));
  const vagueDetection = vesselPosVague.vague
    ? { label: `vessel position: ${vesselPosVague.pattern}`, pattern: vesselPosVague.pattern }
    : cargoOriginVague.vague
      ? { label: `cargo origin: ${cargoOriginVague.pattern}`, pattern: cargoOriginVague.pattern }
      : null;
  const { points: distRaw, reason: distReason } = scoreGeographicProximity(
    distance,
    vagueDetection?.label ?? null,
  );
  const distMult = getMinMultiplier(cargo.originPort, vessel.openPosition);
  components.push({ label: 'Geographic proximity', points: distRaw * distMult, max: 20, reason: distReason, confidenceMultiplier: distMult });

  // 2. Cargo type match
  // Confidence: cargo.cargoDescription (cargoType is a plain enum — no CF wrapper)
  const { points: cargoRaw, reason: cargoReason } = scoreCargoTypeMatch({
    cargoType: cargo.cargoType,
    vesselType: vessel.vesselType,
    lastCargoes: vessel.lastCargoes,
    geared: vessel.geared,
    grainCapacity: vessel.grainCapacity,
  });
  const cargoMult = getMinMultiplier(cargo.cargoDescription);
  components.push({ label: 'Cargo type match', points: cargoRaw * cargoMult, max: 20, reason: cargoReason, confidenceMultiplier: cargoMult });

  // 3. Geared/crane match
  // No ConfidenceField inputs — always 1.0
  let craneRaw = 0;
  let craneReason: string | undefined;
  if (vessel.geared === true) {
    craneRaw = 15;
    craneReason = 'vessel geared — no shore-crane dependency';
  } else if (vessel.geared === false) {
    const portCranes = portHasShoreCranes(cfValue(cargo.originPort));
    if (portCranes === true) {
      craneRaw = 12;
      craneReason = 'gearless vessel + shore cranes available';
    } else if (portCranes === false) {
      craneRaw = 0;
      craneReason = 'gearless vessel, no shore cranes — incompatible';
    } else {
      craneRaw = 8;
      craneReason = 'gearless vessel, port crane availability unverified';
    }
  } else {
    craneRaw = 10;
    craneReason = 'vessel gear unknown';
  }
  components.push({ label: 'Cargo handling (cranes)', points: craneRaw, max: 15, reason: craneReason, confidenceMultiplier: 1.0 });

  // 4. Volume fit
  // Confidence: cargo.weightMt (vessel.grainCapacity is plain number — no CF wrapper)
  let volRaw = 0;
  let volReason: string | undefined;
  const weight = cfValue(cargo.weightMt);
  const grain = vessel.grainCapacity;
  if (weight && weight > 0 && grain && grain > 0) {
    // Approximate required m³ (use description-based stowage lookup)
    const desc = (cfValue(cargo.cargoDescription) ?? '').toLowerCase();
    let sf = 1.35;
    for (const [kw, value] of Object.entries(STOWAGE_FACTORS)) {
      if (desc.includes(kw)) { sf = value; break; }
    }
    const required = weight * sf;
    const ratio = required / grain;  // 1.0 = exact fit, <1 = room to spare
    if (ratio <= 0.7) {
      volRaw = 12;  // comfortable fit but underutilised
      volReason = `cargo uses ~${Math.round(ratio * 100)}% of grain capacity — comfortable`;
    } else if (ratio <= 0.9) {
      volRaw = 15;  // ideal fit
      volReason = `cargo uses ~${Math.round(ratio * 100)}% of grain capacity — ideal utilisation`;
    } else if (ratio <= 1.0) {
      volRaw = 13;
      volReason = `cargo uses ~${Math.round(ratio * 100)}% of grain capacity — tight fit`;
    } else {
      volRaw = 5;
      volReason = `cargo exceeds 100% of grain capacity — risky without volume confirmation`;
    }
  } else {
    volRaw = 7;
    volReason = 'cargo weight or grain capacity unknown';
  }
  const volMult = getMinMultiplier(cargo.weightMt);
  components.push({ label: 'Volume / hold fit', points: volRaw * volMult, max: 15, reason: volReason, confidenceMultiplier: volMult });

  // 5. Laycan fit
  // Confidence: cargo.preferredDates, vessel.openDate
  let layRaw = 0;
  let layReason: string | undefined;
  switch (readiness?.verdict) {
    case 'ideal': layRaw = 20; layReason = 'ideal timing — arrives cleanly before laycan'; break;
    case 'tight': layRaw = 12; layReason = 'tight timing — cuts it fine'; break;
    case 'idle':  layRaw = 10; layReason = 'vessel idle before laycan — owner cost risk'; break;
    case 'unknown': layRaw = 8; layReason = 'timing unknown (missing dates or port)'; break;
    case 'late':  layRaw = 0;  layReason = 'late arrival (should have been filtered)'; break;
    default:      layRaw = 5;  layReason = 'no readiness data';
  }
  const layMult = getMinMultiplier(cargo.preferredDates, vessel.openDate);
  components.push({ label: 'Laycan fit', points: layRaw * layMult, max: 20, reason: layReason, confidenceMultiplier: layMult });

  // 6. DWT class
  // Confidence: cargo.weightMt, vessel.dwtSummer
  let dwtRaw = 0;
  let dwtReason: string | undefined;
  const dwt = cfValue(vessel.dwtSummer);
  const dwcc = cfValue(vessel.dwcc);
  // Use max bound for fit check, min bound for utilization — Range-aware logic
  const weightMax = cargo.weightMtMax ?? weight;
  const weightMin = cargo.weightMtMin ?? weight;
  if (weightMax && dwcc && dwcc > 0 && weightMax > dwcc) {
    // Cargo exceeds DWCC (deadweight cargo capacity at the vessel's max draft) —
    // physically un-loadable without bunker/stores reduction. Treat as overload.
    dwtRaw = 2;
    dwtReason = `cargo ${weightMax}mt exceeds vessel DWCC ${dwcc}mt — overload at design draft`;
  } else if (weightMax && dwt && dwt > 0) {
    const fitRatio = weightMax / dwt;
    if (fitRatio > 1.0) {
      dwtRaw = 2;
      dwtReason = `cargo max ${weightMax}mt exceeds vessel DWT ${dwt}mt`;
    } else {
      const utilWeight = weightMin ?? weightMax;
      const utilRatio = utilWeight / dwt;
      const rangeLabel = (weightMin !== null && weightMin !== weightMax)
        ? `${weightMin}–${weightMax}` : `${weightMax}`;
      if (utilRatio >= 0.5) {
        dwtRaw = 10;
        dwtReason = `cargo ${rangeLabel}mt on ${dwt}mt DWT — well-matched`;
      } else if (utilRatio >= 0.3) {
        dwtRaw = 6;
        dwtReason = `cargo min only ${Math.round(utilRatio * 100)}% of DWT — vessel under-utilised`;
      } else {
        dwtRaw = 4;
        dwtReason = `cargo ≪ vessel DWT — diseconomic`;
      }
    }
  } else {
    dwtRaw = 5;
    dwtReason = 'weight or DWT unknown';
  }
  const dwtMult = getMinMultiplier(cargo.weightMt, vessel.dwtSummer);
  components.push({ label: 'DWT class fit', points: dwtRaw * dwtMult, max: 10, reason: dwtReason, confidenceMultiplier: dwtMult });

  // basePhysical = raw (unweighted) sum — backward compatible
  const rawPoints = [distRaw, cargoRaw, craneRaw, volRaw, layRaw, dwtRaw];
  const basePhysical = rawPoints.reduce((a, b) => a + b, 0);

  // confidenceAdjustedScore = weighted sum
  const confidenceAdjustedScore = components.reduce((a, c) => a + c.points, 0);

  // Readiness adjustment mirrors applyReadinessScoring
  let readinessAdjustment = 0;
  switch (readiness?.verdict) {
    case 'ideal': readinessAdjustment = 10;  break;
    case 'idle':  readinessAdjustment = idleScorePenalty(readiness.gapDays); break;
    case 'late':  readinessAdjustment = -30; break;
  }

  // Sanctions adjustment — blocking pairs never reach here, so only MEDIUM shows
  let sanctionsAdjustment = 0;
  if (sanctions?.risk === 'MEDIUM') sanctionsAdjustment = -10;

  // Vague-region adjustment (Phase D2): when vessel position or cargo origin is a broad
  // geographic descriptor (sea name, country only, coast range, etc.), we cannot reliably
  // assess timing OR proximity. Apply a flat penalty so such pairs naturally drop into
  // the 'weak' tier — the broker should re-engage the owner for a specific port.
  const vagueRegionAdjustment = vagueDetection ? -20 : 0;

  const finalScore = Math.max(
    0,
    Math.min(
      100,
      confidenceAdjustedScore + readinessAdjustment + sanctionsAdjustment + vagueRegionAdjustment,
    ),
  );

  return {
    components,
    basePhysical,
    readinessAdjustment,
    sanctionsAdjustment,
    vagueRegionAdjustment,
    finalScore,
    confidenceAdjustedScore,
  };
}
