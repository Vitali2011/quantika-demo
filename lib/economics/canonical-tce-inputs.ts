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
  const durationDays = estimateRoundTripDays(safeDist, safeSpeed);
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
  };
}
