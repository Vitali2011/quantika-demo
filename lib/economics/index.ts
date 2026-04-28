import type { EconomicsResult } from '../types';
import { fetchBunkerPrices } from './bunker';
import { calculateEuEts, fetchEuaPrice } from './ets';
import { calculateWarRiskPremium } from './war-risk';
import { optimizeSplitBunker } from './split-bunker';

export interface EconomicsInput {
  route: {
    fromPort: string;
    toPort: string;
    viaCanal?: string;
    intermediatePorts?: string[];
  };
  vesselValueUsd: number;
  daysInHra: number;
  distanceNm: number;
  euLegPercent: number; // 0.0–1.0
  vlsfoBurnMt: number;
  consumptionMtPerDay: number;
}

export async function computeEconomics(input: EconomicsInput): Promise<EconomicsResult> {
  const { route, vesselValueUsd, daysInHra, distanceNm, euLegPercent, vlsfoBurnMt, consumptionMtPerDay } = input;

  const routePorts = [route.fromPort, ...(route.intermediatePorts ?? []), route.toPort];

  // Fetch bunker prices and EUA price in parallel
  const [bunkerPrices, euaData] = await Promise.all([
    fetchBunkerPrices(routePorts),
    fetchEuaPrice(),
  ]);

  // ETS
  const etsResult = calculateEuEts({
    distanceNm,
    euLegPercent,
    vlsfoBurnMt,
    euaPrice: euaData.price,
  });

  // War risk
  const warRisk = calculateWarRiskPremium({
    route: { fromPort: route.fromPort, toPort: route.toPort, viaCanal: route.viaCanal },
    vesselValueUsd,
    daysInHra,
  });

  // Split bunker optimizer
  const splitResult = optimizeSplitBunker({
    route: {
      fromPort: route.fromPort,
      toPort: route.toPort,
      intermediatePorts: route.intermediatePorts ?? [],
    },
    bunkerPrices,
    consumptionMtPerDay,
  });

  // Determine recommended bunker port and cost
  const bunkerPort = splitResult.bunkerPlan[0]?.port ?? route.fromPort;
  const cheapestPrice = bunkerPrices.get(bunkerPort);
  const estimatedDays = 20;
  const bunkerCost = cheapestPrice
    ? Math.round(cheapestPrice.vlsfo * consumptionMtPerDay * estimatedDays)
    : 0;

  // Convert ETS EUR→USD (approx 1.08 EUR/USD)
  const etsUsd = Math.round(etsResult.amountEur * 1.08);

  const totalUsd = bunkerCost + etsUsd + warRisk.premiumUsd;

  const now = new Date().toISOString();

  return {
    breakdown: {
      bunkerCost,
      bunkerPort,
      splitBunkerSavings: splitResult.savingsUsd > 0 ? splitResult.savingsUsd : undefined,
      euEtsAmount: etsResult.amountEur,
      euEtsApplicable: etsResult.applicable,
      warRiskPremium: warRisk.premiumUsd,
      warRiskZones: warRisk.zones,
    },
    totalUsd,
    calculatedAt: now,
    dataFreshness: {
      bunker: cheapestPrice?.fetched_at ?? now,
      eua: euaData.fetched_at,
    },
  };
}
