import { type TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import { computeTce } from '@/lib/economics/compute-tce';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { quoteSuez } from '@/lib/economics/canals/index';
import { quoteBosporus } from '@/lib/economics/canals/bosporus';
import { resolvePort } from '@/lib/ports/resolve';
import { resolveVaguePort } from '@/lib/ports/resolve-vague';
import { isEuCountry } from '@/lib/validation/sanctions';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
import type { EconomicsResult } from '@/lib/types';
import { parseLeadingNumber, parseConsumption, DEFAULT_CONSUMPTION_MT_PER_DAY } from './parse-vessel-fields';
import { DEFAULT_BUNKER_USD_PER_MT, FALLBACK_EUA_EUR_PER_TCO2, NT_DWT_RATIO } from '@/lib/constants';

// Re-export pure parsers for existing server callers (e.g. session-buckets.ts).
// They live in parse-vessel-fields.ts (no server deps) so client components can
// import them without pulling better-sqlite3 into the client bundle.
export { parseLeadingNumber, parseConsumption };

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
const DEFAULT_SPEED_KTS = 12;

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

// Distance multiplier for Tier-3 fallback. Short coastal routes (<1000nm) firmed
// to parity (1.0) — the legacy 0.7 was deep-sea suppression incorrectly applied
// to dense Black-Sea / intra-Med traffic where port congestion + ballast
// efficiency lift short-route per-mt rates. #819 honesty fix (founder Option A).
function distanceFactor(nm: number): number {
  if (nm <= 0) return 1.0;
  if (nm < 1000) return 1.0;
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
  ballast_distance_nm?: number,
  canal_usd?: number,
  da_usd?: number,
  bunkerPriceUsdPerMt?: number,
  euLegPercent?: number,
  originEu?: boolean,
  destEu?: boolean,
  euaPriceEur?: number,
  excludeWarRiskFromDailyTce?: boolean,
): TceEstimate {
  if (bunkerPriceUsdPerMt === undefined) {
    throw new Error(
      'computeEstimatedTce: bunkerPriceUsdPerMt is required since Stage 9. ' +
      'Pass DEFAULT_BUNKER_USD_PER_MT explicitly for callers without a live price.',
    );
  }
  const resolvedBunker = bunkerPriceUsdPerMt;

  const safeDwt = vessel_dwt > 0 ? vessel_dwt : 10_000;
  const safeSpeed = speed_kts > 0 ? speed_kts : 12;
  const safeQty = quantity_mt > 0 ? quantity_mt : safeDwt * 0.65;
  const safeConsumption = resolveConsMtPerDay(consumption_mt_per_day, safeDwt);

  const result = computeTce({
    dwt: safeDwt,
    valueUsd: estimateVesselValueUsd(safeDwt),
    speedKts: safeSpeed,
    consumptionMtPerDay: safeConsumption,
    freightRateUsdPerMt: freightRate.rate,
    quantityMt: safeQty,
    distanceNm: distance_nm > 0 ? distance_nm : 0,
    ballastDistanceNm: ballast_distance_nm,
    bunkerPriceUsdPerMt: resolvedBunker,
    euaPriceEur: euaPriceEur ?? FALLBACK_EUA_EUR_PER_TCO2,
    canalUsd: canal_usd ?? 0,
    daUsd: da_usd ?? 0,
    euLegPercent,
    originEu,
    destEu,
    excludeWarRiskFromDailyTce,
  });

  return {
    tce_usd_per_day: result.tceUsdPerDay,
    freight_rate_usd_per_mt: freightRate.rate,
    freight_rate_source: freightRate.source,
    breakdown: result.breakdown,
  };
}

// ── Basin classification (Suez + Bosporus transit detection) ─────────────────
// 'blacksea' is distinct from 'med' so Bosporus detection works: a route from
// 'med' to 'blacksea' (or vice-versa) transits the Bosporus strait.
// For Suez purposes, 'blacksea' is treated as 'westOfSuez' (same as 'med').
type _PortBasin = 'indian' | 'eastafrica' | 'med' | 'blacksea' | 'atlantic' | 'westafrica' | 'unknown';

function _classifyPortBasin(port: string | null | undefined): _PortBasin {
  if (!port) return 'unknown';
  const p = port.toLowerCase().trim();
  if (/kandla|mundra|mumbai|nhava|chennai|kolkata|karachi|kakinada|kochi|cochin|colombo|tuticorin|bandar.?abb?as?|dubai|abu.?dhabi|fujairah|sohar|muscat|salalah|jebel.?ali|ruwais|jeddah|yanbu|aqaba|djibouti|aden|berbera/.test(p)) return 'indian';
  if (/mtwara|mombasa|dar.?es.?salaam|tanga|nacala|beira|maputo|quelimane|zanzibar/.test(p)) return 'eastafrica';
  if (/matadi|boma|pointe.?noire|cotonou|lome|abidjan|dakar|conakry|freetown|banjul|monrovia|tema|lagos|apapa|tincan|bonny|warri|port.?harcourt|douala/.test(p)) return 'westafrica';
  // Black Sea ports — must precede the `med` branch (Bosporus/Dardanelles required to reach Med).
  if (/constanta|varna|burgas|novorossiysk|novorossiisk|odessa|odesa|chornomorsk|mykolaiv|mykolayiv|kherson|sevastopol|yuzhne|yuzhny|pivdennyi|reni|izmail|poti|batumi|giurgiulest|karasu/.test(p)) return 'blacksea';
  if (/ravenna|marghera|venice|trieste|genoa|la.?spezia|livorno|naples|taranto|bari|brindisi|catania|palermo|messina|augusta|trapani|pozzallo|bizerte|skikda|oran|algiers|tunis|sfax|bejaia|annaba|casablanca|jorf|safi|tangier|tanger|agadir|barcelona|valencia|algeciras|gibraltar|marseille|toulon|sete|fos|savona|vado|civitavecchia|piraeus|thessaloniki|izmir|aliaga|iskenderun|mersin|antalya|derince|izmit|istanbul|marmara|bandirma|suez|port.?said|alexandria|damietta|limassol|larnaca|haifa|ashdod|beirut|lattakia|tartus/.test(p)) return 'med';
  if (/rotterdam|amsterdam|antwerp|zeebrugge|ghent|dunkirk|le.?havre|rouen|brest|la.?pallice|bayonne|bilbao|santander|gijon|aviles|vigo|oporto|porto|lisbon|setubal|figueira|hamburg|bremerhaven|bremen|wilhelmshaven|emden|rostock|lubeck|gdansk|gdynia|szczecin|felixstowe|southampton|london|tilbury|teesport|sunderland|newcastle|immingham|grimsby|hull|liverpool|birkenhead|belfast|dublin|greenore|cork|oslo|gothenburg|goteborg|stavanger|bergen|haugesund|halsvik|aarhus|copenhagen|helsingborg|stockholm|helsinki|tallinn|riga|klaipeda/.test(p)) return 'atlantic';
  // Fallback: try resolving the port name to its canonical name and re-classify.
  // This handles aliases like "Nemrut Bay" → resolves to "Aliaga" (med),
  // "Hereke" → "Marmara" (med), so canal detection works on vague port strings.
  const resolved = resolvePort(port);
  if (resolved && resolved.portName !== port) {
    return _classifyPortBasin(resolved.portName);
  }
  // Second fallback: try vague descriptor resolution ("Eastern Central Greece" → Piraeus).
  const vague = resolveVaguePort(port);
  if (vague && vague.portName !== port) {
    return _classifyPortBasin(vague.portName);
  }
  return 'unknown';
}

// A route transits Suez if one port is "east of Suez" (Indian Ocean / East Africa)
// and the other is "west of Suez" (Mediterranean / Atlantic / Black Sea). West-Africa
// ports are reached via Cape so they do NOT trigger Suez even when paired with East-Africa.
function _routeTransitsSuez(portA: string | null | undefined, portB: string | null | undefined): boolean {
  if (!portA || !portB) return false;
  const basinA = _classifyPortBasin(portA);
  const basinB = _classifyPortBasin(portB);
  const eastOfSuez = new Set<_PortBasin>(['indian', 'eastafrica']);
  // blacksea is reachable from Indian Ocean via Suez + Bosporus, so it is west-of-Suez.
  const westOfSuez = new Set<_PortBasin>(['med', 'atlantic', 'blacksea']);
  return (eastOfSuez.has(basinA) && westOfSuez.has(basinB)) ||
         (eastOfSuez.has(basinB) && westOfSuez.has(basinA));
}

// A route transits the Bosporus when exactly one endpoint lies inside the Black
// Sea and the other is a known basin outside it (med, atlantic, indian,
// eastafrica, westafrica — every exit from the Black Sea passes the strait).
// Intra-Med, intra-BlackSea and unknown-basin routes do not transit. (Audit C.1:
// the old med↔blacksea-only rule dropped the Bosporus fee on Black Sea ↔
// east-of-Suez voyages — Novorossiysk→Mumbai paid Suez but not Bosporus.)
function _routeTransitsBosporus(portA: string | null | undefined, portB: string | null | undefined): boolean {
  const a = _classifyPortBasin(portA);
  const b = _classifyPortBasin(portB);
  if (a === 'unknown' || b === 'unknown') return false;
  return (a === 'blacksea') !== (b === 'blacksea');
}

// NT ≈ DWT × NT_DWT_RATIO (canonical, lib/constants.ts — audit C.8).

// Quote Suez dues for a leg (laden or ballast). Returns 0 on any error (DB missing, etc.)
// so the caller gracefully degrades without the exact tariff rather than throwing.
function _quoteSuezSafe(vesselDwt: number, laden: boolean): number {
  try {
    const vesselNt = Math.round(vesselDwt * NT_DWT_RATIO);
    const quote = quoteSuez({ vesselDwt, vesselNt, vesselType: 'bulker', laden });
    return typeof quote.totalUsd === 'number' ? quote.totalUsd : 0;
  } catch {
    return 0;
  }
}

// Quote Bosporus dues for one transit (bulker convention). Returns 0 on any error.
function _quoteBosporusSafe(vesselDwt: number): number {
  try {
    const vesselNt = Math.round(vesselDwt * NT_DWT_RATIO);
    const q = quoteBosporus({ vesselDwt, vesselNt, vesselType: 'bulker' });
    return Number.isFinite(q?.totalUsd) ? q.totalUsd : 0;
  } catch {
    return 0;
  }
}

// ── Exported helpers for detail-path parity (app/api/voyage/tce/route.ts) ────
// Single source of truth: both stored (list) and detail paths use these functions.
export const classifyPortBasin = _classifyPortBasin;
export const routeTransitsBosporus = _routeTransitsBosporus;
export const quoteBosporusSafe = _quoteBosporusSafe;
export const routeTransitsSuez = _routeTransitsSuez;
export const quoteSuezSafe = _quoteSuezSafe;

/** Derive EU-ETS coverage flags from port names. Used by both the stored match path
 *  and the detail route to guarantee identical euLegPercent/originEu/destEu. */
export function deriveEtsCoverage(loadPort?: string | null, dischargePort?: string | null) {
  // Pass the counterpart voyage port so a bare homonym name (Cartagena, Tripoli)
  // resolves to the correct basin instead of the arbitrary first-wins entry.
  const rdRaw = dischargePort ? resolvePort(dischargePort) : null;
  const rl = loadPort ? (resolvePort(loadPort, { counterpart: rdRaw }) ?? resolveVaguePort(loadPort)) : null;
  const rd = dischargePort ? (resolvePort(dischargePort, { counterpart: rl }) ?? resolveVaguePort(dischargePort)) : null;
  const originEu = isEuCountry(rl?.country ?? null);
  const destEu = isEuCountry(rd?.country ?? null);
  return { originEu, destEu, euLegPercent: (originEu || destEu) ? 1.0 : 0 };
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
  /** Vessel open position — for ballast leg war-risk AND Suez detection. Null → skip ballast canal. */
  vesselOpenPosition?: string | null;
  /** ISO 8601 timestamp; passed in so the result is deterministic/testable. */
  calculatedAt: string;
  /** Vessel value for the war-risk hull premium. Defaults to estimateVesselValueUsd(dwt) when omitted. */
  vesselValueUsd?: number;
  /**
   * Pre-resolved freight rate from the Wave #7 waterfall (manual/parsed/baltic/estimate).
   * When omitted, falls back to estimateFreightRate (tier 3) — preserving legacy behaviour
   * so existing callers/tests are unaffected.
   */
  resolvedFreight?: FreightRateEstimate | null;
  /** Ballast reposition distance in nm (open→load port). Enables single-voyage span calculation
   *  and ballast-leg Suez detection. Unknown → legacy round-trip (backward-compatible). */
  ballastDistanceNm?: number | null;
  /** Pre-resolved port disbursement total (USD), load + discharge. Unknown/zero → omitted. */
  daUsd?: number | null;
  /** Live bunker price (USD/mt). Defaults to DEFAULT_BUNKER_USD_PER_MT (600) when omitted. */
  bunkerPriceUsdPerMt?: number | null;
  /** Live EUA spot price (EUR/tCO2). Defaults to FALLBACK_EUA_EUR_PER_TCO2 (87.5) when omitted. */
  euaPriceEur?: number | null;
  /** When true, war-risk premium is excluded from the per-day TCE numerator.
   *  The detail page sets this true (app/api/voyage/tce/route.ts:373) so that
   *  stored TCE and live TCE agree on war-zone routes. Defaults to true. */
  excludeWarRiskFromDailyTce?: boolean;
  /** Address + brokerage commission percent (TTL) deducted from gross freight.
   *  Absent/0 → no deduction (legacy). computeStoredMatchEconomics passes
   *  cargo.commissionPercent ?? 3.75 (founder fallback). */
  commissionPct?: number;
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

  // ── Canal detection ───────────────────────────────────────────────────────────
  // Detect Suez and Bosporus transits using port basin geometry (no DB required).
  let canalUsd = 0;
  const ladenTransitsSuez = _routeTransitsSuez(input.loadPort, input.dischargePort);
  if (ladenTransitsSuez && input.vesselDwt > 0) {
    canalUsd += _quoteSuezSafe(input.vesselDwt, true);
  }
  const ladenTransitsBosporus = _routeTransitsBosporus(input.loadPort, input.dischargePort);
  if (ladenTransitsBosporus && input.vesselDwt > 0) {
    canalUsd += _quoteBosporusSafe(input.vesselDwt);
  }
  const ballastNm = input.ballastDistanceNm;
  const ballastOpenPos = input.vesselOpenPosition;
  const ballastTransitsSuez = ballastNm != null && ballastNm > 0 && !!ballastOpenPos && !!input.loadPort
    ? _routeTransitsSuez(ballastOpenPos, input.loadPort)
    : false;
  if (ballastNm != null && ballastNm > 0 && ballastOpenPos && input.loadPort) {
    if (ballastTransitsSuez && input.vesselDwt > 0) {
      canalUsd += _quoteSuezSafe(input.vesselDwt, false);
    }
    if (_routeTransitsBosporus(ballastOpenPos, input.loadPort) && input.vesselDwt > 0) {
      canalUsd += _quoteBosporusSafe(input.vesselDwt);
    }
  }

  // ── EU-ETS coverage derivation ────────────────────────────────────────────────
  // Convention MUST match app/api/voyage/tce/route.ts:307-327.
  const { originEu, destEu, euLegPercent } = deriveEtsCoverage(input.loadPort, input.dischargePort);
  const euaPriceEur = (input.euaPriceEur != null && input.euaPriceEur > 0)
    ? input.euaPriceEur
    : FALLBACK_EUA_EUR_PER_TCO2;

  // Stage 8: call computeTce directly — same guards as computeEstimatedTce internals.
  // No originPort/destinationPort: war risk is $0 in the TCE numerator (computed
  // separately below for the breakdown display). ECA-split not wired: stored path
  // did not compute it before Stage 8; not adding new behaviour (qa-937 MEDIUM-2).
  const safeDwt = input.vesselDwt > 0 ? input.vesselDwt : 10_000;
  const safeSpeed = input.speedKts > 0 ? input.speedKts : DEFAULT_SPEED_KTS;
  const safeQty = input.quantityMt > 0 ? input.quantityMt : safeDwt * 0.65;
  const safeConsumption = resolveConsMtPerDay(input.consumptionMt, safeDwt);
  const resolvedBunker = input.bunkerPriceUsdPerMt != null
    ? input.bunkerPriceUsdPerMt
    : DEFAULT_BUNKER_USD_PER_MT;

  const tce = computeTce({
    dwt: safeDwt,
    valueUsd: input.vesselValueUsd ?? estimateVesselValueUsd(safeDwt),
    speedKts: safeSpeed,
    consumptionMtPerDay: safeConsumption,
    freightRateUsdPerMt: freight.rate,
    quantityMt: safeQty,
    distanceNm: input.distanceNm > 0 ? input.distanceNm : 0,
    ballastDistanceNm: ballastNm ?? undefined,
    bunkerPriceUsdPerMt: resolvedBunker,
    euaPriceEur,
    canalUsd,
    daUsd: input.daUsd != null && input.daUsd > 0 ? input.daUsd : 0,
    euLegPercent,
    originEu,
    destEu,
    excludeWarRiskFromDailyTce: input.excludeWarRiskFromDailyTce ?? false,
    commissionPct: input.commissionPct,
  });

  const warLaden = calculateWarRiskPremium({
    route: {
      fromPort: input.loadPort ?? '',
      toPort: input.dischargePort ?? '',
      viaCanal: ladenTransitsSuez ? 'suez' : undefined,
    },
    vesselValueUsd: input.vesselValueUsd ?? estimateVesselValueUsd(safeDwt),
  });

  const openPos = input.vesselOpenPosition ?? '';
  const warBallast =
    openPos && input.loadPort
      ? calculateWarRiskPremium({
          route: {
            fromPort: openPos,
            toPort: input.loadPort,
            viaCanal: ballastTransitsSuez ? 'suez' : undefined,
          },
          vesselValueUsd: input.vesselValueUsd ?? estimateVesselValueUsd(safeDwt),
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
      canal_usd: tce.breakdown.canal_usd,
      ets_usd: tce.breakdown.ets_usd,
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
    tceUsdPerDay: tce.tceUsdPerDay,
    freightRateUsdPerMt: freight.rate,
    freightRateSource: freight.source,
    consumptionEstimated: input.consumptionMt <= 0 ? true : undefined,
    qtyEstimated: input.quantityMt <= 0 ? true : undefined,
    dataQuality: input.consumptionMt <= 0
      ? { consumption: { tier: 'estimated' as const, source: 'class-estimate' } }
      : undefined,
  };
}
