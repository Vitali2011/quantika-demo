/**
 * Voyage Calculator — TCE (Time Charter Equivalent) aggregation.
 *
 * Aggregates all voyage cost components into a daily TCE figure:
 *   bunker + canal + DA + war risk + ETS  →  total cost
 *   (gross_freight - total_cost) / durationDays  →  daily TCE
 *
 * Design:
 *   `calculateTCE` is a pure synchronous function. It accepts already-resolved
 *   canal_usd and da_usd numbers (which the API layer fetches from
 *   `lib/economics/canals/*` and `lib/port-da/repository`). This keeps the
 *   core aggregator deterministic and DB-free for unit tests, while still
 *   "using existing modules" via the integration boundary.
 *
 * NaN/Infinity guards: any non-finite numeric input collapses to 0 and the
 * cost component is flagged inapplicable. We never throw, never emit NaN.
 *
 * Input Contract:
 *   durationDays <= 0       → daily_tce_usd = 0 (not Infinity)
 *   any non-finite money    → that field becomes 0
 *   euLegPercent ∈ (0, 1]   → ETS applied, otherwise 0
 */

import { calculateWarRiskPremium } from './war-risk';
import { calculateEuEts } from './ets';
import { calculateEcaFuelPortion } from '@/lib/knowledge/eca/adapter';
import type { EcaZone } from '@/lib/knowledge/eca/parser';
import type { ResolvedPort } from '@/lib/ports/resolve';

const EUR_TO_USD = 1.08; // approximate conversion (matches index.ts)
const ESTIMATED_DAYS_FALLBACK = 1; // for safety in non-finite cases

export interface VoyageInput {
  vessel: {
    dwt: number;
    valueUsd: number;
    speedKts: number;
    consumptionMtPerDay: number;
  };
  route: {
    originPort: string;
    destinationPort: string;
    distanceNm: number;
    viaSuez?: boolean;
    viaCanal?: string;
    /** Resolved origin port (with lat/lon) for ECA calculation */
    resolvedOrigin?: ResolvedPort;
    /** Resolved destination port (with lat/lon) for ECA calculation */
    resolvedDest?: ResolvedPort;
  };
  cargo: {
    quantityMt: number;
    freightRateUsdPerMt: number;
  };
  bunkerPriceUsdPerMt: number;
  euaPriceEur: number;
  durationDays: number;
  /** EU leg percentage (0–1). Default 0 (no ETS). */
  euLegPercent?: number;
  /** Days spent in HRA zones for war-risk premium. Default = durationDays. */
  daysInHra?: number;
  /** Pre-computed canal dues USD (from quoteCanal). 0 if no canal. */
  canalUsd?: number;
  /** Pre-computed DA total (origin + destination) USD. */
  daUsd?: number;
  /** ECA zones for bunker split calculation. If undefined, no ECA split. */
  ecaZones?: EcaZone[];
}

export interface TCEBreakdown {
  bunker_usd: number;
  bunker_eca_mt?: number;
  bunker_open_mt?: number;
  canal_usd: number;
  da_usd: number;
  war_risk_usd: number;
  ets_eur: number;
  ets_usd: number;
  gross_freight_usd: number;
  total_costs_usd: number;
  net_voyage_usd: number;
  daily_tce_usd: number;
  applicable: {
    bunker: boolean;
    canal: boolean;
    da: boolean;
    war_risk: boolean;
    ets: boolean;
  };
}

export interface TCEResult {
  breakdown: TCEBreakdown;
  total_usd: number;
  daily_tce_usd: number;
  bunker_eca_mt?: number;
  bunker_open_mt?: number;
}

function safeNum(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export function calculateTCE(input: VoyageInput): TCEResult {
  const consumption = safeNum(input.vessel?.consumptionMtPerDay);
  const duration = safeNum(input.durationDays);
  const bunkerPrice = safeNum(input.bunkerPriceUsdPerMt);
  const distance = safeNum(input.route?.distanceNm);
  const quantity = safeNum(input.cargo?.quantityMt);
  const rate = safeNum(input.cargo?.freightRateUsdPerMt);
  const valueUsd = safeNum(input.vessel?.valueUsd);
  const euLegPercent = safeNum(input.euLegPercent);
  const euaPrice = safeNum(input.euaPriceEur);
  const daysInHraRaw = input.daysInHra;
  const daysInHra = typeof daysInHraRaw === 'number' && Number.isFinite(daysInHraRaw)
    ? daysInHraRaw
    : duration;

  // ── Bunker ────────────────────────────────────────────────────────────
  const totalBunkerMt = consumption * duration;
  const bunkerUsd = Math.round(totalBunkerMt * bunkerPrice);
  const bunkerApplicable = bunkerUsd > 0;

  // ── ECA Bunker Split (Phase 1) ───────────────────────────────────────
  let bunkerEcaMt: number | undefined;
  let bunkerOpenMt: number | undefined;
  let ecaCalculated = false;

  if (
    input.ecaZones &&
    input.ecaZones.length > 0 &&
    input.route?.resolvedOrigin &&
    input.route?.resolvedDest &&
    totalBunkerMt > 0
  ) {
    try {
      const ecaPortion = calculateEcaFuelPortion(
        { lat: input.route.resolvedOrigin.lat, lon: input.route.resolvedOrigin.lon },
        { lat: input.route.resolvedDest.lat, lon: input.route.resolvedDest.lon },
        input.ecaZones
      );

      // Guard: clamp ecaPortion to [0, 1] range (defensive)
      const safePortion = Math.max(0, Math.min(1, ecaPortion));
      bunkerEcaMt = totalBunkerMt * safePortion;
      bunkerOpenMt = totalBunkerMt * (1 - safePortion);
      ecaCalculated = true;
    } catch {
      // If ECA calculation fails, fall back to 100% open-ocean
      bunkerEcaMt = 0;
      bunkerOpenMt = totalBunkerMt;
      ecaCalculated = true;
    }
  }

  // ── Canal (pre-resolved) ──────────────────────────────────────────────
  const canalUsd = Math.round(safeNum(input.canalUsd));
  const canalApplicable = canalUsd > 0;

  // ── Disbursement Account (pre-resolved) ───────────────────────────────
  const daUsd = Math.round(safeNum(input.daUsd));
  const daApplicable = daUsd > 0;

  // ── War risk ──────────────────────────────────────────────────────────
  const warResult = calculateWarRiskPremium({
    route: {
      fromPort: input.route?.originPort ?? '',
      toPort: input.route?.destinationPort ?? '',
      viaCanal: input.route?.viaSuez ? 'suez' : input.route?.viaCanal,
    },
    vesselValueUsd: valueUsd,
    daysInHra,
  });
  const warRiskUsd = Math.round(warResult.premiumUsd);
  // βf-04: gate on calculator-reported applicability, not USD > 0.
  // A matched HRA zone is "applicable" even if (in degenerate edge cases)
  // the rounded premium were zero — so downstream UI surfaces the warning.
  const warRiskApplicable = warResult.applicable;

  // ── EU ETS ────────────────────────────────────────────────────────────
  const vlsfoBurnMt = totalBunkerMt;
  const etsResult = calculateEuEts({
    distanceNm: distance,
    euLegPercent,
    vlsfoBurnMt,
    euaPrice,
  });
  const etsEur = etsResult.amountEur;
  const etsUsd = Math.round(etsEur * EUR_TO_USD);
  const etsApplicable = etsResult.applicable;

  // ── Aggregation ───────────────────────────────────────────────────────
  const grossFreight = Math.round(quantity * rate);
  const totalCosts = bunkerUsd + canalUsd + daUsd + warRiskUsd + etsUsd;
  const netVoyage = grossFreight - totalCosts;
  const safeDuration = duration > 0 ? duration : ESTIMATED_DAYS_FALLBACK;
  const dailyTce = duration > 0 ? Math.round(netVoyage / safeDuration) : 0;

  const breakdown: TCEBreakdown = {
    bunker_usd: bunkerUsd,
    bunker_eca_mt: ecaCalculated ? bunkerEcaMt : undefined,
    bunker_open_mt: ecaCalculated ? bunkerOpenMt : undefined,
    canal_usd: canalUsd,
    da_usd: daUsd,
    war_risk_usd: warRiskUsd,
    ets_eur: Math.round(etsEur * 100) / 100,
    ets_usd: etsUsd,
    gross_freight_usd: grossFreight,
    total_costs_usd: totalCosts,
    net_voyage_usd: netVoyage,
    daily_tce_usd: dailyTce,
    applicable: {
      bunker: bunkerApplicable,
      canal: canalApplicable,
      da: daApplicable,
      war_risk: warRiskApplicable,
      ets: etsApplicable,
    },
  };

  return {
    breakdown,
    total_usd: totalCosts,
    daily_tce_usd: dailyTce,
    bunker_eca_mt: ecaCalculated ? bunkerEcaMt : undefined,
    bunker_open_mt: ecaCalculated ? bunkerOpenMt : undefined,
  };
}
