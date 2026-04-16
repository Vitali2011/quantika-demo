import type {
  Match, MatchLevel, MatchReadiness, MatchSanctions,
  ParsedCargo, ParsedVessel, ScoreBreakdown, ScoreBreakdownComponent,
} from '@/lib/types';
import { cfValue } from '@/lib/types';
import { portHasShoreCranes } from './port-master';
import { STOWAGE_FACTORS } from './match-filters';

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
  const { match, cargo, vessel, readiness, sanctions } = input;
  const components: ScoreBreakdownComponent[] = [];

  // 1. Geographic proximity
  const distance = readiness?.distanceNm ?? null;
  let distPoints = 0;
  let distReason: string | undefined;
  if (distance != null) {
    // Closer ports score higher. 0nm → 20, ≥2000nm → 0
    distPoints = Math.round(Math.max(0, Math.min(20, 20 - (distance / 100))));
    distReason = `${distance} NM between ${cfValue(vessel.openPosition) ?? 'vessel port'} and ${cfValue(cargo.originPort) ?? 'load port'}`;
  } else {
    distReason = 'distance unknown';
  }
  components.push({ label: 'Geographic proximity', points: distPoints, max: 20, reason: distReason });

  // 2. Cargo type match
  const vtype = (vessel.vesselType ?? '').toLowerCase();
  let cargoPoints = 0;
  let cargoReason: string | undefined;
  if (cargo.cargoType === 'BULK' && /bulk|handysize|supramax|panamax/.test(vtype)) {
    cargoPoints = 20;
    cargoReason = `bulk cargo on bulk carrier — ideal`;
  } else if (cargo.cargoType === 'BULK' && /mpp|multi.?purpose|general/.test(vtype)) {
    cargoPoints = 15;
    cargoReason = `bulk on MPP — acceptable`;
  } else if ((cargo.cargoType === 'BREAK_BULK' || cargo.cargoType === 'PROJECT') && /mpp|multi.?purpose|general|heavy/.test(vtype)) {
    cargoPoints = 20;
    cargoReason = `${cargo.cargoType} on MPP / heavy-lift — ideal`;
  } else if (cargo.cargoType === 'OTHER' || !vtype) {
    cargoPoints = 10;
    cargoReason = 'cargo or vessel type unspecified';
  } else {
    cargoPoints = 12;
    cargoReason = `${cargo.cargoType} × ${vessel.vesselType ?? 'unknown'} — passable`;
  }
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
