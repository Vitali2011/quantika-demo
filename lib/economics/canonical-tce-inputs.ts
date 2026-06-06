import { estimateRoundTripDays } from '@/lib/economics/voyage-days';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import type { VoyageInput } from '@/lib/economics/voyage-calculator';

const DEFAULT_VESSEL_VALUE_USD = 15_000_000;

export interface CanonicalTceInputArgs {
  vesselDwt: number;
  speedKts: number;
  consumptionMtPerDay: number;
  distanceNm: number;
  quantityMt: number;
  freightRateUsdPerMt: number;
  bunkerPriceUsdPerMt: number;
  originPort: string;
  destinationPort: string;
  euaPriceEur?: number;
  vesselValueUsd?: number;
  /** Ballast reposition distance (open→load port, nm). When provided, uses single-voyage
   *  span (ballast + laden + 2 port days) instead of legacy round-trip. (overhaul step 2.) */
  ballastDistanceNm?: number;
  /** Pre-computed canal dues (USD) — Suez/Panama/Bosporus for both legs combined. */
  canalUsd?: number;
}

export function buildCanonicalTceInputs(args: CanonicalTceInputArgs): VoyageInput {
  const safeDist = args.distanceNm > 0 ? args.distanceNm : 0;
  const safeDwt = args.vesselDwt > 0 ? args.vesselDwt : 10_000;
  const safeQty = args.quantityMt > 0 ? args.quantityMt : safeDwt * 0.65;
  const safeSpeed = args.speedKts > 0 ? args.speedKts : 12;
  // Class-aware consumption: a flat 25 mt/day sinks a small coaster (real ~6-10) and
  // is also caught as implausible by resolveConsMtPerDay (> class × 1.8). Missing/zero
  // → class estimate from DWT. (economics-overhaul step 1.)
  const safeCons = resolveConsMtPerDay(args.consumptionMtPerDay, safeDwt);

  // Voyage span: if ballastDistanceNm is known, use single-voyage (ballast+laden+2 port days)
  // so the unpaid reposition leg is reflected in the TCE denominator (overhaul step 2, Option A).
  // Unknown ballast → legacy round-trip (backward-compatible for all existing callers).
  let durationDays: number;
  if (args.ballastDistanceNm != null && args.ballastDistanceNm > 0 && safeDist > 0) {
    const ballastDays = args.ballastDistanceNm / (safeSpeed * 24);
    const ladenDays = safeDist / (safeSpeed * 24);
    durationDays = ballastDays + ladenDays + 2;
  } else {
    durationDays = estimateRoundTripDays(safeDist, safeSpeed);
  }

  return {
    vessel: {
      dwt: safeDwt,
      valueUsd: args.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
      speedKts: safeSpeed,
      consumptionMtPerDay: safeCons,
    },
    route: {
      originPort: args.originPort,
      destinationPort: args.destinationPort,
      distanceNm: safeDist,
    },
    cargo: {
      quantityMt: safeQty,
      freightRateUsdPerMt: args.freightRateUsdPerMt,
    },
    bunkerPriceUsdPerMt: args.bunkerPriceUsdPerMt,
    euaPriceEur: args.euaPriceEur ?? 0,
    durationDays,
    canalUsd: args.canalUsd,
  };
}
