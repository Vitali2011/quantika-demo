import { estimateFreightRate, type FreightRateSource } from '@/lib/matching/tce-calculator';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';

export type { FreightRateSource };

export interface ResolveFreightInput {
  /** Cargo class for the tier-3 estimate (e.g. 'GRAIN'); null → median fallback. */
  cargoType: string | null;
  /** Tier 1 — rate parsed from the email ($/mt). `cargo.freightRateUsd`. */
  parsedFreightRateUsdPerMt?: number | null;
  vesselDwt: number;
  quantityMt: number;
  distanceNm: number;
  /** Vessel laden speed (kn). Defaults to 12 inside estimateVoyageDays when absent. */
  speedKts?: number;
  /** Tier 0 — sticky broker override ($/mt). Wins over all other tiers when > 0. */
  manualRateUsdPerMt?: number | null;
  /**
   * Tier 2 — per-vessel-class Baltic timecharter day-rate ($/day), resolved by the
   * caller from `baltic_indices` (keeps this function pure / DB-free). null → skip tier.
   */
  balticDayRate?: { usdPerDay: number; date: string; indexCode: string; source?: string } | null;
  /**
   * Ballast reposition distance (open position → load port, nm). When provided, tier-2
   * uses single-voyage span (ballastDays + ladenDays + 2) instead of round-trip, keeping
   * the freight denominator consistent with the TCE formula (I6 fix).
   */
  ballastDistanceNm?: number | null;
}

export interface ResolvedFreightRate {
  value: number;
  source: FreightRateSource;
  confidence: number;
  /** Baltic index date, present only when source === 'baltic'. */
  balticDate?: string;
  /** Baltic rate source string (e.g. 'static-seed'), present only when source === 'baltic'. */
  balticSource?: string;
}

const PARSED_CONFIDENCE = 0.9;
const BALTIC_CONFIDENCE = 0.5;

const isPositive = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Resolve the freight rate via a 4-tier priority waterfall. Pure & deterministic —
 * the highest tier with valid input wins; estimate (tier 3) is the always-present
 * floor. Does NOT touch the TCE formula: callers feed `{value, source}` into the
 * existing computeEstimatedTce.
 */
export function resolveFreightRate(input: ResolveFreightInput): ResolvedFreightRate {
  // Tier 0 — manual (sticky broker override)
  if (isPositive(input.manualRateUsdPerMt)) {
    return { value: round2(input.manualRateUsdPerMt), source: 'manual', confidence: 1.0 };
  }

  // Tier 1 — parsed from email ($/mt)
  if (isPositive(input.parsedFreightRateUsdPerMt)) {
    return { value: round2(input.parsedFreightRateUsdPerMt), source: 'parsed', confidence: PARSED_CONFIDENCE };
  }

  // Tier 2 — Baltic market: $/mt = ($/day × voyage days) ÷ tonnes.
  // When ballastDistanceNm is known, uses single-voyage span (ballastDays + ladenDays + 2
  // port days) so the freight denominator matches the TCE formula denominator (I6 fix).
  // Without ballastDistanceNm, falls back to round-trip (laden*2 + 2) which keeps
  // parity with the pre-ballast TCE model (#819 Phase B(b)).
  const baltic = input.balticDayRate;
  if (baltic && isPositive(baltic.usdPerDay) && input.distanceNm > 0 && input.quantityMt > 0) {
    const ladenDays = estimateVoyageDays(input.distanceNm, input.speedKts);
    let days: number;
    if (ladenDays > 0 && input.ballastDistanceNm != null && input.ballastDistanceNm > 0) {
      const safeSpeed = input.speedKts != null && input.speedKts > 0 ? input.speedKts : 12;
      const ballastDays = input.ballastDistanceNm / (safeSpeed * 24);
      days = ballastDays + ladenDays + 2;
    } else {
      days = ladenDays > 0 ? ladenDays * 2 + 2 : 0;
    }
    if (days > 0) {
      const value = round2((baltic.usdPerDay * days) / input.quantityMt);
      if (value > 0) {
        return { value, source: 'baltic', confidence: BALTIC_CONFIDENCE, balticDate: baltic.date, balticSource: baltic.source };
      }
    }
  }

  // Tier 3 — estimate (existing engine, unchanged)
  const est = estimateFreightRate(input.cargoType, input.distanceNm, input.vesselDwt);
  return { value: est.rate, source: 'estimated', confidence: est.confidence };
}
