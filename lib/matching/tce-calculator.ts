import { calculateTCE } from '@/lib/economics/voyage-calculator';

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
}

// Parse a leading number from strings like "12.5 knots", "25 mt/day"
export function parseLeadingNumber(s: string | null | undefined): number {
  if (!s) return 0;
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
  };
}
