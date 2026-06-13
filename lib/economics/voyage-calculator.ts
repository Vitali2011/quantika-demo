/**
 * Voyage Calculator — calculateTCE adapter.
 *
 * Stage 6: calculateTCE is now a thin adapter. The computation body lives in
 * lib/economics/compute-tce.ts (computeTce). This file preserves the public
 * API surface (VoyageInput, TCEBreakdown, TCEResult, calculateTCE) unchanged
 * so all existing callers require no modification.
 *
 * NaN/Infinity guards: safeNum collapses non-finite inputs to 0 before
 * delegating. computeTce applies the same guard internally.
 */

import { computeTce } from './compute-tce';
import type { EcaZone } from '@/lib/knowledge/eca/parser';
import type { ResolvedPort } from '@/lib/ports/resolve';
import type { DataQuality } from '@/lib/data-quality/types';

function safeNum(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

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
    /** Distance in nautical miles. Optional — will be auto-resolved from LOCODEs if missing and flag enabled. */
    distanceNm?: number;
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
  /** EU ETS coverage: true if origin/dest port is in EU/EEA. Absent → coverageFactor=1.0. */
  originEu?: boolean;
  destEu?: boolean;
  /** Days spent in HRA zones for war-risk premium. Default = durationDays. */
  daysInHra?: number;
  /** Pre-computed canal dues USD (from quoteCanal). 0 if no canal. */
  canalUsd?: number;
  /** Pre-computed DA total (origin + destination) USD. */
  daUsd?: number;
  /** Data quality for the DA figure (confidence/staleness from port_da_estimates). */
  daQuality?: DataQuality;
  /** ECA zones for bunker split calculation. If undefined, no ECA split. */
  ecaZones?: EcaZone[];
  /** When true, war-risk premium is excluded from per-day TCE but still reported in breakdown.
   *  Use on the detail path to match stored TCE (which uses empty ports → $0 war risk). */
  excludeWarRiskFromDailyTce?: boolean;
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
  /** FuelEU Maritime GHG penalty (audit A.5). 0 unless FUELEU_ENABLED + EU leg. */
  fueleu_usd: number;
  gross_freight_usd: number;
  total_costs_usd: number;
  net_voyage_usd: number;
  daily_tce_usd: number;
  /** B1 — derivation inputs for transparent math waterfall */
  freight_rate_usd_per_mt: number;
  quantity_mt: number;
  duration_days: number;
  bunker_consumption_mt_per_day: number;
  bunker_price_usd_per_mt: number;
  applicable: {
    bunker: boolean;
    canal: boolean;
    da: boolean;
    war_risk: boolean;
    ets: boolean;
    fueleu: boolean;
  };
  /** W6a: DataQuality for the DA line (sourced from port_da_estimates confidence). */
  da_quality?: DataQuality;
  /** W6a: ISO date of the war-risk rate schedule (for staleness badge). */
  war_risk_rate_date?: string;
}

export interface TCEResult {
  breakdown: TCEBreakdown;
  total_usd: number;
  daily_tce_usd: number;
  bunker_eca_mt?: number;
  bunker_open_mt?: number;
}

export function calculateTCE(input: VoyageInput): TCEResult {
  const result = computeTce({
    // Vessel
    dwt: safeNum(input.vessel?.dwt),
    valueUsd: safeNum(input.vessel?.valueUsd),
    speedKts: safeNum(input.vessel?.speedKts),
    consumptionMtPerDay: safeNum(input.vessel?.consumptionMtPerDay),
    // Cargo & route
    distanceNm: safeNum(input.route?.distanceNm),
    freightRateUsdPerMt: safeNum(input.cargo?.freightRateUsdPerMt),
    quantityMt: safeNum(input.cargo?.quantityMt),
    // Prices
    bunkerPriceUsdPerMt: safeNum(input.bunkerPriceUsdPerMt),
    euaPriceEur: safeNum(input.euaPriceEur),
    // Pre-resolved costs
    canalUsd: safeNum(input.canalUsd),
    daUsd: safeNum(input.daUsd),
    // EU ETS
    euLegPercent: input.euLegPercent,
    originEu: input.originEu,
    destEu: input.destEu,
    // War risk — port names for zone detection
    daysInHra: input.daysInHra,
    excludeWarRiskFromDailyTce: input.excludeWarRiskFromDailyTce,
    originPort: input.route?.originPort,
    destinationPort: input.route?.destinationPort,
    viaCanal: input.route?.viaSuez ? 'suez' : input.route?.viaCanal,
    // ECA
    ecaZones: input.ecaZones,
    resolvedOrigin: input.route?.resolvedOrigin,
    resolvedDest: input.route?.resolvedDest,
    // Metadata
    daQuality: input.daQuality,
    // VoyageInput callers supply durationDays directly; override internal computation.
    overrideDurationDays: input.durationDays,
  });

  return {
    breakdown: result.breakdown,
    total_usd: result.breakdown.total_costs_usd,
    daily_tce_usd: result.tceUsdPerDay,
    bunker_eca_mt: result.breakdown.bunker_eca_mt,
    bunker_open_mt: result.breakdown.bunker_open_mt,
  };
}
