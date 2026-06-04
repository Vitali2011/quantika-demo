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
  balticDayRate?: { usdPerDay: number; date: string; indexCode: string } | null;
}

export interface ResolvedFreightRate {
  value: number;
  source: FreightRateSource;
  confidence: number;
  /** Baltic index date, present only when source === 'baltic'. */
  balticDate?: string;
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

  // Tier 2 — Baltic market: $/mt = ($/day × ROUND-TRIP days) ÷ tonnes.
  // Round-trip (laden + ballast + 2 port days) matches the duration model used
  // downstream in computeEstimatedTce, so freight revenue and bunker cost share
  // a consistent voyage span. Using laden-only days here while costs ran over
  // round-trip under-stated freight ~7× and drove the −$102k vs +$774 divergence
  // the persist-session-matches override was hiding (#819 Phase B(b)).
  const baltic = input.balticDayRate;
  if (baltic && isPositive(baltic.usdPerDay) && input.distanceNm > 0 && input.quantityMt > 0) {
    const ladenDays = estimateVoyageDays(input.distanceNm, input.speedKts);
    const days = ladenDays > 0 ? ladenDays * 2 + 2 : 0;
    if (days > 0) {
      const value = round2((baltic.usdPerDay * days) / input.quantityMt);
      if (value > 0) {
        return { value, source: 'baltic', confidence: BALTIC_CONFIDENCE, balticDate: baltic.date };
      }
    }
  }

  // Tier 3 — estimate (existing engine, unchanged)
  const est = estimateFreightRate(input.cargoType, input.distanceNm, input.vesselDwt);
  return { value: est.rate, source: 'estimated', confidence: est.confidence };
}
