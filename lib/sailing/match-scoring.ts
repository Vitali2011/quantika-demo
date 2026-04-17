import type {
  Match, MatchLevel, MatchReadiness, MatchSanctions,
  ParsedCargo, ParsedVessel, ScoreBreakdown, ScoreBreakdownComponent,
} from '@/lib/types';
import { cfValue } from '@/lib/types';
import { portHasShoreCranes } from './port-master';
import { STOWAGE_FACTORS, checkCargoVesselCompat } from './match-filters';

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
    case 'LCL':
    case 'CONTAINER': {
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
 * Apply readiness-based score adjustment + add contextual issue text.
 *
 * Pure function — extracted here (rather than inlined in the route) so Next.js
 * doesn't reject it as a non-standard route export, and so it's independently
 * unit-testable.
 */
export function applyReadinessScoring(match: Match, readiness: MatchReadiness | undefined): Match {
  if (!readiness) return match;
  const updated: Match = { ...match, readiness };

  switch (readiness.verdict) {
    case 'ideal':
      updated.score = Math.min(100, match.score + 10);
      break;
    case 'idle': {
      updated.score = Math.max(0, match.score - 15);
      const days = readiness.gapDays != null ? Math.round(readiness.gapDays) : null;
      const issue = days != null
        ? `Vessel idle ${days}d before laycan — owner likely won't wait unpaid`
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

  // Recalculate matchLevel from adjusted score
  updated.matchLevel = (updated.score > 70 ? 'good' : updated.score > 40 ? 'possible' : 'weak') as MatchLevel;

  return updated;
}

// ────────────────────────────────────────────────────────────────────────────
// Geographic proximity — piecewise step scoring
// ────────────────────────────────────────────────────────────────────────────

function scoreGeographicProximity(distanceNm: number | null): { points: number; reason: string } {
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
  const distance = readiness?.distanceNm ?? null;
  const { points: distPoints, reason: distReason } = scoreGeographicProximity(distance);
  components.push({ label: 'Geographic proximity', points: distPoints, max: 20, reason: distReason });

  // 2. Cargo type match
  const { points: cargoPoints, reason: cargoReason } = scoreCargoTypeMatch({
    cargoType: cargo.cargoType,
    vesselType: vessel.vesselType,
    lastCargoes: vessel.lastCargoes,
    geared: vessel.geared,
    grainCapacity: vessel.grainCapacity,
  });
  components.push({ label: 'Cargo type match', points: cargoPoints, max: 20, reason: cargoReason });

  // 3. Geared/crane match
  let cranePoints = 0;
  let craneReason: string | undefined;
  if (vessel.geared === true) {
    cranePoints = 15;
    craneReason = 'vessel geared — no shore-crane dependency';
  } else if (vessel.geared === false) {
    const portCranes = portHasShoreCranes(cfValue(cargo.originPort));
    if (portCranes === true) {
      cranePoints = 12;
      craneReason = 'gearless vessel + shore cranes available';
    } else if (portCranes === false) {
      cranePoints = 0;
      craneReason = 'gearless vessel, no shore cranes — incompatible';
    } else {
      cranePoints = 8;
      craneReason = 'gearless vessel, port crane availability unverified';
    }
  } else {
    cranePoints = 10;
    craneReason = 'vessel gear unknown';
  }
  components.push({ label: 'Cargo handling (cranes)', points: cranePoints, max: 15, reason: craneReason });

  // 4. Volume fit
  let volPoints = 0;
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
      volPoints = 12;  // comfortable fit but underutilised
      volReason = `cargo uses ~${Math.round(ratio * 100)}% of grain capacity — comfortable`;
    } else if (ratio <= 0.9) {
      volPoints = 15;  // ideal fit
      volReason = `cargo uses ~${Math.round(ratio * 100)}% of grain capacity — ideal utilisation`;
    } else if (ratio <= 1.0) {
      volPoints = 13;
      volReason = `cargo uses ~${Math.round(ratio * 100)}% of grain capacity — tight fit`;
    } else {
      volPoints = 5;
      volReason = `cargo exceeds 100% of grain capacity — risky without volume confirmation`;
    }
  } else {
    volPoints = 7;
    volReason = 'cargo weight or grain capacity unknown';
  }
  components.push({ label: 'Volume / hold fit', points: volPoints, max: 15, reason: volReason });

  // 5. Laycan fit
  let layPoints = 0;
  let layReason: string | undefined;
  switch (readiness?.verdict) {
    case 'ideal': layPoints = 20; layReason = 'ideal timing — arrives cleanly before laycan'; break;
    case 'tight': layPoints = 12; layReason = 'tight timing — cuts it fine'; break;
    case 'idle':  layPoints = 10; layReason = 'vessel idle before laycan — owner cost risk'; break;
    case 'unknown': layPoints = 8; layReason = 'timing unknown (missing dates or port)'; break;
    case 'late':  layPoints = 0;  layReason = 'late arrival (should have been filtered)'; break;
    default:      layPoints = 5;  layReason = 'no readiness data';
  }
  components.push({ label: 'Laycan fit', points: layPoints, max: 20, reason: layReason });

  // 6. DWT class
  let dwtPoints = 0;
  let dwtReason: string | undefined;
  const dwt = cfValue(vessel.dwtSummer);
  if (weight && dwt && dwt > 0) {
    const ratio = weight / dwt;
    if (ratio >= 0.5 && ratio <= 1.0) {
      dwtPoints = 10;
      dwtReason = `cargo ${weight}mt on ${dwt}mt DWT — well-matched`;
    } else if (ratio >= 0.3 && ratio < 0.5) {
      dwtPoints = 6;
      dwtReason = `cargo only ${Math.round(ratio * 100)}% of DWT — vessel under-utilised`;
    } else if (ratio > 1.0) {
      dwtPoints = 2;
      dwtReason = `cargo exceeds vessel DWT`;
    } else {
      dwtPoints = 4;
      dwtReason = `cargo ≪ vessel DWT — diseconomic`;
    }
  } else {
    dwtPoints = 5;
    dwtReason = 'weight or DWT unknown';
  }
  components.push({ label: 'DWT class fit', points: dwtPoints, max: 10, reason: dwtReason });

  const basePhysical = components.reduce((a, c) => a + c.points, 0);

  // Readiness adjustment mirrors applyReadinessScoring
  let readinessAdjustment = 0;
  switch (readiness?.verdict) {
    case 'ideal': readinessAdjustment = 10;  break;
    case 'idle':  readinessAdjustment = -15; break;
    case 'late':  readinessAdjustment = -30; break;
  }

  // Sanctions adjustment — blocking pairs never reach here, so only MEDIUM shows
  let sanctionsAdjustment = 0;
  if (sanctions?.risk === 'MEDIUM') sanctionsAdjustment = -10;

  const finalScore = Math.max(0, Math.min(100, basePhysical + readinessAdjustment + sanctionsAdjustment));

  return {
    components,
    basePhysical,
    readinessAdjustment,
    sanctionsAdjustment,
    finalScore,
  };
}
