/**
 * Stage 5 canonical TCE owner — `computeTce(TceInputs): TceResult`.
 *
 * In Stage 5 the body delegates to `calculateTCE` (VoyageInput adapter).
 * Stages 6-9 will migrate the actual computation here and remove the adapter.
 *
 * Key invariants:
 *   - No silent price defaults. Missing bunkerPriceUsdPerMt / valueUsd is a
 *     TypeScript compile error, not a runtime 600/22M fallback.
 *   - Pure & synchronous. No DB, no network.
 *   - durationDays is derived from distanceNm + speedKts (+ optional ballastDistanceNm).
 *     Callers must NOT pass durationDays — it lives here.
 */

import { calculateTCE } from '@/lib/economics/voyage-calculator';
import { estimateRoundTripDays } from '@/lib/economics/voyage-days';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';
import type { EcaZone } from '@/lib/knowledge/eca/parser';

export interface TceInputs {
  // Vessel
  dwt: number;
  /** Hull value USD — war-risk premium base. Required, no fallback. */
  valueUsd: number;
  speedKts: number;
  consumptionMtPerDay: number;

  // Cargo & route
  freightRateUsdPerMt: number;
  quantityMt: number;
  /** Laden leg distance (nm). Duration computed from this + speedKts. */
  distanceNm: number;
  /** Ballast reposition leg (nm). When set: durationDays = ballast+laden+2.
   *  When absent: legacy round-trip = ladenDays*2+2. */
  ballastDistanceNm?: number;

  // Prices — all explicit, NO hidden defaults
  /** VLSFO price. Required, no fallback. */
  bunkerPriceUsdPerMt: number;
  /** EUA price EUR. Pass 0 when no EU routing. */
  euaPriceEur: number;

  // Pre-resolved costs (canal / DA modules run upstream)
  canalUsd: number;
  daUsd: number;

  // EU ETS
  euLegPercent?: number;
  originEu?: boolean;
  destEu?: boolean;

  // War risk
  /** Days in HRA zone. When absent: calculateTCE defaults to durationDays. */
  daysInHra?: number;
  /** Exclude war-risk from per-day TCE (stored-path convention). */
  excludeWarRiskFromDailyTce?: boolean;

  // Optional metadata
  ecaZones?: EcaZone[];
}

export interface TceResult {
  tceUsdPerDay: number;
  durationDays: number;
  breakdown: TCEBreakdown;
}

function computeDurationDays(inputs: TceInputs): number {
  const safeSpeed = inputs.speedKts > 0 ? inputs.speedKts : 12;
  const safeDist = inputs.distanceNm > 0 ? inputs.distanceNm : 0;
  if (inputs.ballastDistanceNm != null && inputs.ballastDistanceNm > 0 && safeDist > 0) {
    const ballastDays = inputs.ballastDistanceNm / (safeSpeed * 24);
    const ladenDays = safeDist / (safeSpeed * 24);
    return ballastDays + ladenDays + 2;
  }
  return estimateRoundTripDays(safeDist, safeSpeed);
}

/**
 * Single canonical TCE computation entry-point.
 *
 * Stage 5: delegates to calculateTCE via VoyageInput adapter.
 * War-risk zone detection requires port names; since TceInputs does not carry
 * ports, war-risk fires only when the caller supplies daysInHra explicitly
 * (the value is threaded through but zone applicability is disabled by the
 * empty-string port placeholder). HRA routes should use buildMatchEconomics
 * (which knows ports) until Stage 8 migration.
 */
export function computeTce(inputs: TceInputs): TceResult {
  const durationDays = computeDurationDays(inputs);

  const result = calculateTCE({
    vessel: {
      dwt: inputs.dwt,
      valueUsd: inputs.valueUsd,
      speedKts: inputs.speedKts,
      consumptionMtPerDay: inputs.consumptionMtPerDay,
    },
    route: {
      originPort: '',
      destinationPort: '',
      distanceNm: inputs.distanceNm,
    },
    cargo: {
      quantityMt: inputs.quantityMt,
      freightRateUsdPerMt: inputs.freightRateUsdPerMt,
    },
    bunkerPriceUsdPerMt: inputs.bunkerPriceUsdPerMt,
    euaPriceEur: inputs.euaPriceEur,
    durationDays,
    canalUsd: inputs.canalUsd,
    daUsd: inputs.daUsd,
    euLegPercent: inputs.euLegPercent,
    originEu: inputs.originEu,
    destEu: inputs.destEu,
    daysInHra: inputs.daysInHra,
    excludeWarRiskFromDailyTce: inputs.excludeWarRiskFromDailyTce,
    ecaZones: inputs.ecaZones,
  });

  return {
    tceUsdPerDay: result.daily_tce_usd,
    durationDays: result.breakdown.duration_days,
    breakdown: result.breakdown,
  };
}
