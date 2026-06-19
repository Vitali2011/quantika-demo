/**
 * Canonical TCE / economics computation entry-point.
 *
 * `computeTce(TceInputs): TceResult` — pure, synchronous, deterministic.
 * All inputs explicit; no silent price defaults.
 *
 * Key invariants:
 *   - No silent price defaults. Missing bunkerPriceUsdPerMt / valueUsd is a
 *     TypeScript compile error, not a runtime 600/22M fallback.
 *   - Pure & synchronous. No DB, no network.
 *   - durationDays is derived from distanceNm + speedKts (+ optional ballastDistanceNm)
 *     unless overrideDurationDays is set (calculateTCE adapter path).
 *   - Callers that do not need war-risk zone detection may omit originPort/destinationPort.
 *
 * Stage 6: body migrated here from calculateTCE. calculateTCE is now a thin adapter
 * in voyage-calculator.ts that maps VoyageInput → TceInputs and delegates here.
 */

import { calculateWarRiskPremium } from './war-risk';
import { calculateEuEts } from './ets';
import { calculateFuelEu, FUEL_GHG_INTENSITY } from './fueleu';
import { calculateEcaFuelPortion } from '@/lib/knowledge/eca/adapter';
import { estimateRoundTripDays } from '@/lib/economics/voyage-days';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';
import type { EcaZone } from '@/lib/knowledge/eca/parser';
import type { ResolvedPort } from '@/lib/ports/resolve';
import type { DataQuality } from '@/lib/data-quality/types';
import { EUR_USD_FALLBACK } from './fx-rate';

const ESTIMATED_DAYS_FALLBACK = 1;

function safeNum(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

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
  /** EUR→USD rate for EU-cost conversion (ETS, FuelEU). Resolve via getEurToUsd()
   *  at the async caller and inject. Omitted → EUR_USD_FALLBACK (estimated). */
  eurToUsdRate?: number;

  // Pre-resolved costs (canal / DA modules run upstream)
  canalUsd: number;
  daUsd: number;

  // EU ETS
  euLegPercent?: number;
  originEu?: boolean;
  destEu?: boolean;

  /** Fuel type for FuelEU GHG intensity (key of FUEL_GHG_INTENSITY). Default 'vlsfo'. */
  fuelType?: string;

  // War risk
  /** Days in HRA zone. When absent: defaults to durationDays. */
  daysInHra?: number;
  /** Exclude war-risk from per-day TCE (stored-path convention). */
  excludeWarRiskFromDailyTce?: boolean;
  /** Origin port name for war-risk zone detection. Absent → $0 war-risk (non-HRA). */
  originPort?: string;
  /** Destination port name for war-risk zone detection. Absent → $0 war-risk (non-HRA). */
  destinationPort?: string;
  /** Canal routing for war-risk (e.g. 'suez'). Mapped from VoyageInput.route.viaSuez by adapter. */
  viaCanal?: string;

  // ECA — requires resolvedOrigin + resolvedDest for effect (Stage 8 wiring)
  /** ECA zones for bunker split calculation.
   * NOTE: ECA split only fires when resolvedOrigin + resolvedDest are both provided.
   * Without those, ecaZones has no effect. Port coordinate wiring is deferred to
   * Stage 8 (buildMatchEconomics migration). */
  ecaZones?: EcaZone[];
  /** Resolved origin port coordinates (lat/lon) — Stage 8 ECA wiring.
   * Required for ecaZones to have effect. Until Stage 8, pass undefined. */
  resolvedOrigin?: ResolvedPort;
  /** Resolved destination port coordinates (lat/lon) — Stage 8 ECA wiring.
   * Required for ecaZones to have effect. Until Stage 8, pass undefined. */
  resolvedDest?: ResolvedPort;

  // Optional metadata
  daQuality?: DataQuality;

  /** When set, overrides the internally-computed durationDays. Used by the calculateTCE
   *  adapter to preserve the VoyageInput.durationDays contract for existing callers.
   *  Direct callers of computeTce should omit this and let duration be derived from
   *  distanceNm + speedKts. */
  overrideDurationDays?: number;
}

export interface TceResult {
  tceUsdPerDay: number;
  durationDays: number;
  breakdown: TCEBreakdown;
}

function computeDurationDays(inputs: TceInputs): number {
  if (inputs.overrideDurationDays !== undefined) {
    return inputs.overrideDurationDays;
  }
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
 * Pure, synchronous, deterministic. All inputs explicit.
 * War-risk zone detection requires originPort/destinationPort to be set;
 * when absent, war_risk_usd = 0 (non-HRA route). ECA bunker split requires
 * resolvedOrigin + resolvedDest (Stage 8 wiring via buildMatchEconomics).
 */
export function computeTce(inputs: TceInputs): TceResult {
  const consumption = safeNum(inputs.consumptionMtPerDay);
  const duration = safeNum(computeDurationDays(inputs));
  const bunkerPrice = safeNum(inputs.bunkerPriceUsdPerMt);
  const distance = safeNum(inputs.distanceNm);
  // Negative freight/quantity is nonsense input (bad parse/manual typo) — clamp
  // to 0 so gross freight never goes negative (audit C.8 + QA F3).
  const quantity = Math.max(0, safeNum(inputs.quantityMt));
  const rate = Math.max(0, safeNum(inputs.freightRateUsdPerMt));
  const valueUsd = safeNum(inputs.valueUsd);
  const euLegPercent = safeNum(inputs.euLegPercent);
  const euaPrice = safeNum(inputs.euaPriceEur);
  // EUR→USD for EU-cost conversion (ETS + FuelEU). Single source: fx-rate.ts.
  // Caller injects the live/as-of rate; fall back to the estimated constant.
  const eurToUsd = inputs.eurToUsdRate ?? EUR_USD_FALLBACK;
  const daysInHraRaw = inputs.daysInHra;
  const daysInHra = typeof daysInHraRaw === 'number' && Number.isFinite(daysInHraRaw)
    ? daysInHraRaw
    : duration;

  // ── Bunker ────────────────────────────────────────────────────────────
  const totalBunkerMt = consumption * duration;
  const bunkerUsd = Math.round(totalBunkerMt * bunkerPrice);
  const bunkerApplicable = bunkerUsd > 0;

  // ── ECA Bunker Split ─────────────────────────────────────────────────
  let bunkerEcaMt: number | undefined;
  let bunkerOpenMt: number | undefined;
  let ecaCalculated = false;

  if (
    inputs.ecaZones &&
    inputs.ecaZones.length > 0 &&
    inputs.resolvedOrigin &&
    inputs.resolvedDest &&
    totalBunkerMt > 0
  ) {
    try {
      const ecaPortion = calculateEcaFuelPortion(
        { lat: inputs.resolvedOrigin.lat, lon: inputs.resolvedOrigin.lon },
        { lat: inputs.resolvedDest.lat, lon: inputs.resolvedDest.lon },
        inputs.ecaZones
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
  const canalUsd = Math.round(safeNum(inputs.canalUsd));
  const canalApplicable = canalUsd > 0;

  // ── Disbursement Account (pre-resolved) ───────────────────────────────
  const daUsd = Math.round(safeNum(inputs.daUsd));
  const daApplicable = daUsd > 0;

  // ── War risk ──────────────────────────────────────────────────────────
  const warResult = calculateWarRiskPremium({
    route: {
      fromPort: inputs.originPort ?? '',
      toPort: inputs.destinationPort ?? '',
      viaCanal: inputs.viaCanal,
    },
    vesselValueUsd: valueUsd,
    daysInHra,
  });
  // Intentional spec change: war-risk.ts:124 designates breakdown.totalPremiumUsd as the full
  // per-voyage cost (hull + crew bonus + P&I). premiumUsd is hull-only, kept for backward compat.
  // REVERSIBLE: change back to warResult.premiumUsd to revert to hull-only convention.
  const warRiskUsd = Math.round(warResult.breakdown?.totalPremiumUsd ?? warResult.premiumUsd);
  // βf-04: gate on calculator-reported applicability, not USD > 0.
  const warRiskApplicable = warResult.applicable;

  // ── EU ETS ────────────────────────────────────────────────────────────
  const vlsfoBurnMt = totalBunkerMt;
  const etsResult = calculateEuEts({
    distanceNm: distance,
    euLegPercent,
    vlsfoBurnMt,
    euaPrice,
    originEu: inputs.originEu,
    destEu: inputs.destEu,
  });
  const etsEur = etsResult.amountEur;
  const etsUsd = Math.round(etsEur * eurToUsd);
  const etsApplicable = etsResult.applicable;

  // ── FuelEU Maritime (audit A.5, flag-gated) ───────────────────────────
  // Scope per Reg. 2023/1805: 100% of energy intra-EU, 50% when one endpoint is EU.
  // Rides the same originEu/destEu detection as EU ETS (set by the voyage API
  // only when includeEuETS) — both are EU-scope costs.
  let fueleuUsd = 0;
  const anyEuEnd = inputs.originEu === true || inputs.destEu === true;
  if (process.env.FUELEU_ENABLED === 'true' && anyEuEnd && duration > 0 && consumption > 0) {
    const share = inputs.originEu && inputs.destEu ? 1 : 0.5;
    // Unknown fuelType would make calculateFuelEu throw — fall back to vlsfo
    // instead of failing the whole TCE computation (QA F-002).
    const fuelType =
      inputs.fuelType && FUEL_GHG_INTENSITY[inputs.fuelType] ? inputs.fuelType : 'vlsfo';
    const fe = calculateFuelEu({
      fuelType,
      consumptionMtPerDay: consumption,
      voyageDays: duration,
      eurToUsdRate: eurToUsd,
    });
    fueleuUsd = Math.round(fe.penaltyUsd * share);
  }
  const fueleuApplicable = fueleuUsd > 0;

  // ── Aggregation ───────────────────────────────────────────────────────
  const grossFreight = Math.round(quantity * rate);
  const totalCosts = bunkerUsd + canalUsd + daUsd + warRiskUsd + etsUsd + fueleuUsd;
  const netVoyage = grossFreight - totalCosts;
  const safeDuration = duration > 0 ? duration : ESTIMATED_DAYS_FALLBACK;
  // When excludeWarRiskFromDailyTce is set, omit war-risk from the per-day numerator
  // so stored (empty ports → $0) and detail (real ports) produce the same TCE.
  const dailyNetVoyage = inputs.excludeWarRiskFromDailyTce
    ? grossFreight - (bunkerUsd + canalUsd + daUsd + etsUsd + fueleuUsd)
    : netVoyage;
  const dailyTce = duration > 0 ? Math.round(dailyNetVoyage / safeDuration) : 0;

  const breakdown: TCEBreakdown = {
    bunker_usd: bunkerUsd,
    bunker_eca_mt: ecaCalculated ? bunkerEcaMt : undefined,
    bunker_open_mt: ecaCalculated ? bunkerOpenMt : undefined,
    canal_usd: canalUsd,
    da_usd: daUsd,
    war_risk_usd: warRiskUsd,
    ets_eur: Math.round(etsEur * 100) / 100,
    ets_usd: etsUsd,
    fueleu_usd: fueleuUsd,
    gross_freight_usd: grossFreight,
    total_costs_usd: totalCosts,
    net_voyage_usd: netVoyage,
    daily_tce_usd: dailyTce,
    /** B1 — derivation inputs for transparent math waterfall */
    freight_rate_usd_per_mt: rate,
    quantity_mt: quantity,
    duration_days: duration,
    bunker_consumption_mt_per_day: consumption,
    bunker_price_usd_per_mt: bunkerPrice,
    applicable: {
      bunker: bunkerApplicable,
      canal: canalApplicable,
      da: daApplicable,
      war_risk: warRiskApplicable,
      ets: etsApplicable,
      fueleu: fueleuApplicable,
    },
    ...(inputs.daQuality != null ? { da_quality: inputs.daQuality } : {}),
    ...(warRiskApplicable && warResult.rateDate ? { war_risk_rate_date: warResult.rateDate } : {}),
  };

  return {
    tceUsdPerDay: dailyTce,
    durationDays: duration,
    breakdown,
  };
}
