import { calculateTCE, type TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { quoteSuez } from '@/lib/economics/canals/index';
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
): TceEstimate {
  const inputs = buildCanonicalTceInputs({
    vesselDwt: vessel_dwt,
    speedKts: speed_kts,
    consumptionMtPerDay: consumption_mt_per_day,
    distanceNm: distance_nm,
    quantityMt: quantity_mt,
    freightRateUsdPerMt: freightRate.rate,
    bunkerPriceUsdPerMt: DEFAULT_BUNKER_USD_PER_MT,
    originPort: '',
    destinationPort: '',
    euaPriceEur: DEFAULT_EUA_EUR,
    vesselValueUsd: DEFAULT_VESSEL_VALUE_USD,
    ballastDistanceNm: ballast_distance_nm,
    canalUsd: canal_usd,
  });
  const result = calculateTCE(inputs);

  return {
    tce_usd_per_day: result.daily_tce_usd,
    freight_rate_usd_per_mt: freightRate.rate,
    freight_rate_source: freightRate.source,
    breakdown: result.breakdown,
  };
}

// ── Suez transit detection (overhaul step 3) ─────────────────────────────────
// Classify a port into a geographic basin for routing decisions.
// Returns 'indian' for Indian subcontinent / Persian Gulf / Red Sea,
// 'eastafrica' for East African coast, 'med' for Mediterranean / Black Sea,
// 'atlantic' for Atlantic-facing European / N-African ports, 'westafrica' for
// West African ports (reached via Cape, not Suez), and 'unknown' otherwise.
type _PortBasin = 'indian' | 'eastafrica' | 'med' | 'atlantic' | 'westafrica' | 'unknown';

function _classifyPortBasin(port: string | null | undefined): _PortBasin {
  if (!port) return 'unknown';
  const p = port.toLowerCase().trim();
  if (/kandla|mundra|mumbai|nhava|chennai|kolkata|karachi|kakinada|kochi|cochin|colombo|tuticorin|bandar.?abb?as?|dubai|abu.?dhabi|fujairah|sohar|muscat|salalah|jebel.?ali|ruwais|jeddah|yanbu|aqaba|djibouti|aden|berbera/.test(p)) return 'indian';
  if (/mtwara|mombasa|dar.?es.?salaam|tanga|nacala|beira|maputo|quelimane|zanzibar/.test(p)) return 'eastafrica';
  if (/matadi|boma|pointe.?noire|cotonou|lome|abidjan|dakar|conakry|freetown|banjul|monrovia|tema|lagos|apapa|tincan|bonny|warri|port.?harcourt|douala/.test(p)) return 'westafrica';
  if (/ravenna|marghera|venice|trieste|genoa|la.?spezia|livorno|naples|taranto|bari|brindisi|catania|palermo|messina|augusta|trapani|pozzallo|bizerte|skikda|oran|algiers|tunis|sfax|bejaia|annaba|casablanca|jorf|safi|tangier|tanger|agadir|barcelona|valencia|algeciras|gibraltar|marseille|toulon|sete|fos|savona|vado|civitavecchia|piraeus|thessaloniki|izmir|aliaga|iskenderun|mersin|antalya|derince|izmit|istanbul|marmara|bandirma|karasu|constanta|varna|burgas|novorossiysk|odessa|odesa|chornomorsk|mykolaiv|kherson|yuzhne|suez|port.?said|alexandria|damietta|limassol|larnaca|haifa|ashdod|beirut|lattakia|tartus/.test(p)) return 'med';
  if (/rotterdam|amsterdam|antwerp|zeebrugge|ghent|dunkirk|le.?havre|rouen|brest|la.?pallice|bayonne|bilbao|santander|gijon|aviles|vigo|oporto|porto|lisbon|setubal|figueira|hamburg|bremerhaven|bremen|wilhelmshaven|emden|rostock|lubeck|gdansk|gdynia|szczecin|felixstowe|southampton|london|tilbury|teesport|sunderland|newcastle|immingham|grimsby|hull|liverpool|birkenhead|belfast|dublin|greenore|cork|oslo|gothenburg|goteborg|stavanger|bergen|haugesund|halsvik|aarhus|copenhagen|helsingborg|stockholm|helsinki|tallinn|riga|klaipeda/.test(p)) return 'atlantic';
  return 'unknown';
}

// A route transits Suez if one port is "east of Suez" (Indian Ocean / East Africa)
// and the other is "west of Suez" (Mediterranean / Atlantic). West-Africa ports are
// reached via Cape so they do NOT trigger Suez even when paired with East-Africa.
function _routeTransitsSuez(portA: string | null | undefined, portB: string | null | undefined): boolean {
  if (!portA || !portB) return false;
  const basinA = _classifyPortBasin(portA);
  const basinB = _classifyPortBasin(portB);
  const eastOfSuez = new Set<_PortBasin>(['indian', 'eastafrica']);
  const westOfSuez = new Set<_PortBasin>(['med', 'atlantic']);
  return (eastOfSuez.has(basinA) && westOfSuez.has(basinB)) ||
         (eastOfSuez.has(basinB) && westOfSuez.has(basinA));
}

// Derive approximate net tonnage from DWT (bulker convention: NT ≈ DWT × 0.65).
const NT_DWT_RATIO = 0.65;

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
  /** Vessel value for the war-risk hull premium. Defaults to DEFAULT_VESSEL_VALUE_USD. */
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

  // ── Canal detection (overhaul step 3) ──────────────────────────────────────
  // Detect Suez transit for laden and ballast legs using port basin geometry
  // (no DB required). Quote dues and pass as canalUsd to calculateTCE.
  let canalUsd = 0;
  const ladenTransitsSuez = _routeTransitsSuez(input.loadPort, input.dischargePort);
  if (ladenTransitsSuez && input.vesselDwt > 0) {
    canalUsd += _quoteSuezSafe(input.vesselDwt, true);
  }
  const ballastNm = input.ballastDistanceNm;
  const ballastOpenPos = input.vesselOpenPosition;
  if (ballastNm != null && ballastNm > 0 && ballastOpenPos && input.loadPort) {
    const ballastTransitsSuez = _routeTransitsSuez(ballastOpenPos, input.loadPort);
    if (ballastTransitsSuez && input.vesselDwt > 0) {
      canalUsd += _quoteSuezSafe(input.vesselDwt, false);
    }
  }

  const tce = computeEstimatedTce(
    freight,
    input.distanceNm,
    input.vesselDwt,
    input.quantityMt,
    input.speedKts,
    input.consumptionMt,
    ballastNm ?? undefined,
    canalUsd > 0 ? canalUsd : undefined,
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
    freightRateUsdPerMt: tce.freight_rate_usd_per_mt,
    freightRateSource: tce.freight_rate_source,
  };
}
