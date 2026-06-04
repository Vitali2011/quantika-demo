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

/**
 * Freight-rate provenance for the resolveFreightRate waterfall (Wave #7, L2 #7).
 * Free-text-compatible with the `freight_rate_source` DB column. Defined here (not in
 * freight-resolver) so computeEstimatedTce can accept any tier's source without a
 * circular import.
 */
export type FreightRateSource = 'manual' | 'parsed' | 'baltic' | 'estimated';

export interface FreightRateEstimate {
  rate: number;
  source: FreightRateSource;
  confidence: number;
}

export interface TceEstimate {
  tce_usd_per_day: number;
  freight_rate_usd_per_mt: number;
  freight_rate_source: FreightRateSource;
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

// Matches an explicit MT/D unit: "3.7MT/D", "14 mt/day", "25 t/day"
const MT_PER_DAY_RE = /(\d+(?:\.\d+)?)\s*(?:MT\/?D|mt\/?day|t\/day)/i;
// Fuel-grade tokens that appear before the actual consumption figure
const FUEL_GRADE_RE = /\b(?:IFO|VLSFO|LSMGO|MGO|HFO|HSFO)\s*\d+(?:\/\d+)?\b|M\/E|A\/E/gi;

/**
 * Parse a fuel-consumption field, skipping fuel-grade tokens like "IFO 180".
 *
 * parseLeadingNumber grabs the first digit sequence, which is the grade number
 * (e.g. 180 from "IFO 180 M/E 3.7MT/D") rather than the actual MT/day figure.
 * This function looks for an explicit MT/D unit first; if absent it strips grade
 * tokens before falling back to a leading-number heuristic. Strings with no
 * recoverable consumption figure return DEFAULT_CONSUMPTION_MT_PER_DAY.
 */
export function parseConsumption(s: unknown): number {
  if (s == null) return DEFAULT_CONSUMPTION_MT_PER_DAY;
  if (typeof s === 'number') return Number.isFinite(s) && s > 0 ? s : DEFAULT_CONSUMPTION_MT_PER_DAY;
  if (typeof s === 'object' && 'value' in (s as Record<string, unknown>)) {
    return parseConsumption((s as { value: unknown }).value);
  }
  if (typeof s !== 'string') return DEFAULT_CONSUMPTION_MT_PER_DAY;
  const str = s.trim();
  if (!str) return DEFAULT_CONSUMPTION_MT_PER_DAY;

  const mtd = str.match(MT_PER_DAY_RE);
  if (mtd) return Number(mtd[1]);

  // Strip fuel-grade tokens then try a plain leading number
  const stripped = str.replace(FUEL_GRADE_RE, ' ').replace(/\s+/g, ' ').trim();
  const m = stripped.match(/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);

  return DEFAULT_CONSUMPTION_MT_PER_DAY;
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
  // Conservative estimate when cargo weight unknown: 65% of DWT avoids inflating freight revenue.
  // Fit-breakdown already penalizes weight-not-stated; 90% fabricated a near-full load (#782).
  const safeQty = quantity_mt > 0 ? quantity_mt : safeDwt * 0.65;
  const safeSpeed = speed_kts > 0 ? speed_kts : DEFAULT_SPEED_KTS;
  const safeCons = consumption_mt_per_day > 0 ? consumption_mt_per_day : DEFAULT_CONSUMPTION_MT_PER_DAY;
  // Round-trip duration: laden + ballast (≈ same distance) + 2 port days (load + discharge).
  // Laden-only divided full freight by 1–4 days → absurd $/day on short voyages (#782).
  const ladenDays = safeDist > 0 ? safeDist / (safeSpeed * 24) : 0;
  const durationDays = safeDist > 0 ? ladenDays * 2 + 2 : 10;

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
  /** Vessel open position — for ballast leg war-risk. Pass null when unknown (skips ballast premium). */
  vesselOpenPosition?: string | null;
  /** ISO 8601 timestamp; passed in so the result is deterministic/testable. */
  calculatedAt: string;
  /** Vessel value for the war-risk hull premium. Defaults to DEFAULT_VESSEL_VALUE_USD. */
  vesselValueUsd?: number;
  /**
   * Pre-resolved freight rate from the Wave #7 waterfall (manual/parsed/baltic/estimate).
   * When omitted, falls back to estimateFreightRate (tier 3) — preserving legacy behaviour
   * so existing callers/tests are unaffected.
   */
  resolvedFreight?: FreightRateEstimate | null;
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

  const freight =
    input.resolvedFreight ?? estimateFreightRate(input.cargoType, input.distanceNm, input.vesselDwt);
  const tce = computeEstimatedTce(
    freight,
    input.distanceNm,
    input.vesselDwt,
    input.quantityMt,
    input.speedKts,
    input.consumptionMt,
  );

  const warLaden = calculateWarRiskPremium({
    route: { fromPort: input.loadPort ?? '', toPort: input.dischargePort ?? '' },
    vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
  });

  const openPos = input.vesselOpenPosition ?? '';
  const warBallast =
    openPos && input.loadPort
      ? calculateWarRiskPremium({
          route: { fromPort: openPos, toPort: input.loadPort },
          vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
        })
      : { applicable: false, premiumUsd: 0, zones: [], zoneIds: [] as string[] };

  const warCombinedTotal =
    (warLaden.breakdown?.totalPremiumUsd ?? warLaden.premiumUsd) +
    (warBallast.breakdown?.totalPremiumUsd ?? warBallast.premiumUsd);

  return {
    breakdown: {
      bunkerCost: tce.breakdown.bunker_usd,
      bunkerPort: input.loadPort ?? '',
      euEtsAmount: tce.breakdown.ets_eur,
      euEtsApplicable: tce.breakdown.applicable.ets,
      // BC aliases — laden-only — unchanged meaning for existing consumers
      warRiskPremium: warLaden.premiumUsd,
      warRiskZones: warLaden.zones,
      warRiskTotal: warLaden.breakdown?.totalPremiumUsd,
      warRiskBreakdown: warLaden.breakdown,
      // Explicit named laden/ballast siblings
      warRiskBreakdownLaden: warLaden.breakdown,
      warRiskBreakdownBallast: warBallast.breakdown,
      warRiskZonesBallast: warBallast.zones,
      warRiskTotalCombined: warCombinedTotal,
    },
    totalUsd: tce.breakdown.total_costs_usd + warCombinedTotal,
    calculatedAt: input.calculatedAt,
    dataFreshness: { bunker: 'estimated', eua: 'estimated' },
    tceUsdPerDay: tce.tce_usd_per_day,
  };
}
