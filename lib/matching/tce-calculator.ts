import { calculateTCE, type TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import type { EconomicsResult } from '@/lib/types';

// Ballpark base freight rates (USD/mt) per cargo class
const BASE_RATES: Record<string, number> = {
  BULK: 20,
  GRAIN: 18,
  COAL: 12,
  IRON_ORE: 10,
  FERTILIZER: 22,
  STEEL: 28,
  BREAK_BULK: 30,
  GENERAL_CARGO: 26,
  CONTAINER: 35,
  LUMBER: 32,
  CEMENT: 24,
  SUGAR: 20,
  SALT: 15,
  SCRAP: 18,
  CLINKER: 22,
};

const BASE_RATE_FALLBACK = 22;
const DEFAULT_BUNKER_USD_PER_MT = 600;
const DEFAULT_EUA_EUR = 65;
const DEFAULT_SPEED_KTS = 12;
const DEFAULT_CONSUMPTION_MT_PER_DAY = 25;
const DEFAULT_VESSEL_VALUE_USD = 22_000_000;

export interface FreightRateEstimate {
  rate: number;
  source: 'estimated' | 'manual';
  confidence: number;
}

export interface TceEstimate {
  tce_usd_per_day: number;
  freight_rate_usd_per_mt: number;
  freight_rate_source: 'estimated' | 'manual';
  /** Full deterministic voyage breakdown (additive, spec L2 #5). */
  breakdown: TCEBreakdown;
}

// Parse a leading number from strings like "12.5 knots", "25 mt/day", a raw
// number (LLM-parsed fields can arrive as numbers, not strings), or a
// ConfidenceField object ({ value, confidence, source_text }). Real/demo parsed
// data stores speed/consumption as any of these despite the string typing, so
// tolerate all rather than throw on `.match`.
export function parseLeadingNumber(s: unknown): number {
  if (s == null) return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  if (typeof s === 'object' && 'value' in (s as Record<string, unknown>)) {
    return parseLeadingNumber((s as { value: unknown }).value);
  }
  if (typeof s !== 'string') return 0;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

// Longer voyages warrant higher rates per mt
function distanceFactor(nm: number): number {
  if (nm <= 0) return 1.0;
  if (nm < 1000) return 0.7;
  if (nm < 3000) return 1.0;
  if (nm < 6000) return 1.3;
  return 1.6;
}

// Smaller vessels command higher rates per mt
function dwtFactor(dwt: number): number {
  if (dwt <= 0) return 1.0;
  if (dwt < 20000) return 1.4;
  if (dwt < 40000) return 1.2;
  if (dwt < 65000) return 1.0;
  if (dwt < 120000) return 0.9;
  return 0.8;
}

export function estimateFreightRate(
  cargo_type: string | null,
  distance_nm: number,
  vessel_dwt: number,
): FreightRateEstimate {
  const key = (cargo_type ?? '').toUpperCase().replace(/[\s-]+/g, '_').trim();
  const base = BASE_RATES[key] ?? BASE_RATE_FALLBACK;
  const confidence = BASE_RATES[key] !== undefined ? 0.6 : 0.3;
  const rate = Math.max(1, Math.round(base * distanceFactor(distance_nm) * dwtFactor(vessel_dwt) * 100) / 100);
  return { rate, source: 'estimated', confidence };
}

export function computeEstimatedTce(
  freightRate: FreightRateEstimate,
  distance_nm: number,
  vessel_dwt: number,
  quantity_mt: number,
  speed_kts: number = DEFAULT_SPEED_KTS,
  consumption_mt_per_day: number = DEFAULT_CONSUMPTION_MT_PER_DAY,
): TceEstimate {
  const safeDist = distance_nm > 0 ? distance_nm : 0;
  const safeDwt = vessel_dwt > 0 ? vessel_dwt : 10000;
  const safeQty = quantity_mt > 0 ? quantity_mt : safeDwt * 0.9;
  const safeSpeed = speed_kts > 0 ? speed_kts : DEFAULT_SPEED_KTS;
  const safeCons = consumption_mt_per_day > 0 ? consumption_mt_per_day : DEFAULT_CONSUMPTION_MT_PER_DAY;
  const durationDays = safeDist > 0 ? safeDist / (safeSpeed * 24) : 10;

  const result = calculateTCE({
    vessel: {
      dwt: safeDwt,
      valueUsd: DEFAULT_VESSEL_VALUE_USD,
      speedKts: safeSpeed,
      consumptionMtPerDay: safeCons,
    },
    route: {
      originPort: '',
      destinationPort: '',
      distanceNm: safeDist,
    },
    cargo: {
      quantityMt: safeQty,
      freightRateUsdPerMt: freightRate.rate,
    },
    bunkerPriceUsdPerMt: DEFAULT_BUNKER_USD_PER_MT,
    euaPriceEur: DEFAULT_EUA_EUR,
    durationDays,
  });

  return {
    tce_usd_per_day: result.daily_tce_usd,
    freight_rate_usd_per_mt: freightRate.rate,
    freight_rate_source: freightRate.source,
    breakdown: result.breakdown,
  };
}

export interface MatchEconomicsInput {
  cargoType: string | null;
  distanceNm: number;
  vesselDwt: number;
  quantityMt: number;
  speedKts: number;
  consumptionMt: number;
  loadPort: string | null;
  dischargePort: string | null;
  /** ISO 8601 timestamp; passed in so the result is deterministic/testable. */
  calculatedAt: string;
  /** Vessel value for the war-risk hull premium. Defaults to DEFAULT_VESSEL_VALUE_USD. */
  vesselValueUsd?: number;
}

/**
 * Build the EconomicsResult attached to a Match (spec L2 #5 + #6).
 *
 * Reuses estimateFreightRate + computeEstimatedTce so `tceUsdPerDay` is identical
 * to the `tce_usd_per_day` value compute-matches.ts persists to the DB column.
 * JWC war-risk (#6) is computed separately with the REAL load/discharge ports and
 * surfaced as a breakdown line item — the per-day figure excludes it (the TCE
 * engine blanks the route ports), mirroring the persisted column and the live
 * economics breakdown, where war risk is a separate cost line.
 *
 * Returns null when distance is unavailable → caller leaves match.economics undefined.
 */
export function buildMatchEconomics(input: MatchEconomicsInput): EconomicsResult | null {
  if (!(input.distanceNm > 0)) return null;

  const freight = estimateFreightRate(input.cargoType, input.distanceNm, input.vesselDwt);
  const tce = computeEstimatedTce(
    freight,
    input.distanceNm,
    input.vesselDwt,
    input.quantityMt,
    input.speedKts,
    input.consumptionMt,
  );

  const war = calculateWarRiskPremium({
    route: { fromPort: input.loadPort ?? '', toPort: input.dischargePort ?? '' },
    vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
  });

  return {
    breakdown: {
      bunkerCost: tce.breakdown.bunker_usd,
      bunkerPort: input.loadPort ?? '',
      euEtsAmount: tce.breakdown.ets_eur,
      euEtsApplicable: tce.breakdown.applicable.ets,
      warRiskPremium: war.premiumUsd,
      warRiskZones: war.zones,
      warRiskTotal: war.breakdown?.totalPremiumUsd,
      warRiskBreakdown: war.breakdown,
    },
    totalUsd: tce.breakdown.total_costs_usd + war.premiumUsd,
    calculatedAt: input.calculatedAt,
    dataFreshness: { bunker: 'estimated', eua: 'estimated' },
    tceUsdPerDay: tce.tce_usd_per_day,
  };
}
