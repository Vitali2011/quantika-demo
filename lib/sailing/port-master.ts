/**
 * Port master data — draft, crane availability, berth characteristics.
 *
 * Built for the demo-scope ports (Black Sea / Med / Atlantic handysize range).
 * Values are conservative estimates from publicly-available port handbooks
 * (Fairplay, portworld, port authority fact-sheets). Accurate enough for a
 * hard "can this vessel even berth here?" filter — not for operational planning.
 *
 * Purpose: stop the matcher from recommending physical impossibilities
 * (10m draft vessel into 6m river port, gearless vessel into a port with no
 * shore cranes, etc.) that destroy broker trust instantly.
 */

import { normalizePortName, KnownPort } from './port-distances';
import { PortRegion, getPortRegion } from './port-regions';

export type { PortRegion };

export interface PortMaster {
  /** Max permissible vessel draft in metres (salt water, summer). */
  maxDraftM: number;
  /** True if port has shore cranes (so gearless vessels can load/discharge). */
  hasShoreCranes: boolean;
  /** Primary berth type (for stowage planning). */
  berthType: 'river' | 'deep-sea' | 'bay' | 'terminal';
  /** Geographic basin — null for unknown ports. */
  region?: PortRegion;
  /** Short human-readable note. */
  note?: string;
}

/**
 * Hardcoded port master. Draft values are "safe" working draft, typically
 * less than dredged depth minus UKC (under-keel clearance, usually 1-1.5m).
 */
const PORT_MASTER: Record<KnownPort, PortMaster> = {
  // ── Black Sea ──
  'Karasu':       { maxDraftM: 11.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Turkish Black Sea port, steel/grain' },
  'Istanbul':     { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Mykolaiv':     { maxDraftM: 10.5, hasShoreCranes: true,  berthType: 'river',    note: 'Buh river, pilotage required' },
  'Odesa':        { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Chornomorsk':  { maxDraftM: 13.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Formerly Ilichivsk, bulk grain terminal' },
  'Constanta':    { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Varna':        { maxDraftM: 11.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Burgas':       { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Novorossiysk': { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Taman':        { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Taman peninsula, bulk/grain terminal' },
  'Tuapse':       { maxDraftM: 11.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Russian Black Sea, oil/bulk' },
  'Izmail':       { maxDraftM: 7.5,  hasShoreCranes: true,  berthType: 'river',    note: 'Danube river port, Ukraine' },
  // ── Aegean / Eastern Med ──
  'Piraeus':      { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Aliaga':       { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Aliaga bay incl. Efesan' },
  'Marmara':      { maxDraftM: 11.0, hasShoreCranes: false, berthType: 'bay',      note: 'Sea of Marmara, small stone/marble port' },
  'Antalya':      { maxDraftM: 11.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Turkish Riviera, general cargo' },
  'Mersin':       { maxDraftM: 13.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Turkey, major container/bulk terminal' },
  'Iskenderun':   { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Turkey, steel export port' },
  'Izmir':        { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Turkey Aegean coast, Alsancak terminal' },
  // ── Eastern Med / Suez ──
  'Alexandria':   { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Suez':         { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Suez Canal southern end, transit hub' },
  // ── Mediterranean ──
  'Ravenna':      { maxDraftM: 10.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Adriatic, channel-access' },
  'Marghera':     { maxDraftM: 11.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Venice/Marghera industrial port complex' },
  'Skikda':       { maxDraftM: 12.0, hasShoreCranes: false, berthType: 'deep-sea', note: 'Mostly oil/LNG, limited dry-bulk cranes' },
  'Genoa':        { maxDraftM: 15.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Italy, major container and cruise hub' },
  'LaSpezia':     { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Italy Ligurian coast, container terminal' },
  'Livorno':      { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Italy, Ro-Ro and container' },
  'Naples':       { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Italy, container/cruise' },
  'Trieste':      { maxDraftM: 18.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Italy, northern Adriatic, oil terminal' },
  'Barcelona':    { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Spain, major container/cruise hub' },
  'Valencia':     { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Spain, largest Med container port' },
  'Algeciras':    { maxDraftM: 18.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Spain, Strait of Gibraltar transshipment' },
  'Marseille':    { maxDraftM: 15.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'France, largest Med port, Fos terminal' },
  'Tunis':        { maxDraftM: 11.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Tunisia, Tunis-Carthage port' },
  // ── Atlantic ──
  'Casablanca':   { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Tangier':      { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Morocco, Tanger Med transshipment hub' },
  'Georgetown':   { maxDraftM: 9.5,  hasShoreCranes: true,  berthType: 'river',    note: 'Guyana, Demerara River port' },
  // ── Northern Europe ──
  'Antwerp':      { maxDraftM: 15.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Belgium, major Scheldt River port' },
  'Hamburg':      { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'river',    note: 'Elbe River, tidal constraints' },
  'Rotterdam':    { maxDraftM: 23.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Europe\'s largest port, Maasvlakte' },
  'Bremen':       { maxDraftM: 12.8, hasShoreCranes: true,  berthType: 'river',    note: 'Weser River, incl. Bremerhaven' },
  'Halsvik':      { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Norway, fjord port, bulk minerals' },
  'Gdansk':       { maxDraftM: 15.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Polish Baltic port, Deepwater Container Terminal' },
  'Bayonne':      { maxDraftM: 9.5,  hasShoreCranes: true,  berthType: 'bay',      note: 'Bayonne/Bilbao range, tidal' },
  'Felixstowe':   { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'UK, largest container port' },
  'Southampton':  { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'UK, container and cruise' },
  'Liverpool':    { maxDraftM: 13.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'UK, Liverpool2 container terminal' },
  'LeHavre':      { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'France, major container hub' },
  'Dunkirk':      { maxDraftM: 20.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'France, bulk and container' },
  'Zeebrugge':    { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Belgium, LNG and container' },
  'Aarhus':       { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Denmark, largest Danish port' },
  'Goteborg':     { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Sweden, largest Scandinavian port' },
  'Helsinki':     { maxDraftM: 11.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Finland, capital port' },
  'Tallinn':      { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Estonia, Baltic container hub' },
  'Haugesund':    { maxDraftM: 10.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Norway, bulk/oil services' },
  // ── West Africa ──
  'Dakar':        { maxDraftM: 13.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Senegal, main West African transshipment hub' },
  'Lagos':        { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Nigeria, Apapa port complex' },
  'Nacala':       { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Mozambique, natural deep-water bay' },
  // ── Americas ──
  'Veracruz':     { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Mexico, main Gulf port' },
  'NewOrleans':   { maxDraftM: 11.0, hasShoreCranes: true,  berthType: 'river',    note: 'Mississippi River, grain/bulk' },
  'Houston':      { maxDraftM: 13.7, hasShoreCranes: true,  berthType: 'terminal', note: 'Houston Ship Channel, petrochemical hub' },
  'Santos':       { maxDraftM: 15.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Brazil, largest Latin American port' },
  'LosAngeles':   { maxDraftM: 15.2, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US West Coast, largest US port' },
  'LongBeach':    { maxDraftM: 15.2, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US West Coast, twin port of LA' },
  'Seattle':      { maxDraftM: 15.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US Pacific NW, incl. Tacoma' },
  'Vancouver':    { maxDraftM: 15.2, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Canada, largest Canadian port' },
  'Mobile':       { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US Gulf, Alabama' },
  'Savannah':     { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US East Coast, fast-growing container port' },
  'Baltimore':    { maxDraftM: 13.7, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US East Coast, ro-ro and bulk hub' },
  'Norfolk':      { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'US East Coast, Hampton Roads' },
  'BuenosAires':  { maxDraftM: 10.5, hasShoreCranes: true,  berthType: 'river',    note: 'Argentina, Rio de la Plata' },
  'Paranagua':    { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Brazil, soybean export hub' },
  'Callao':       { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Peru, Lima port' },
  'Valparaiso':   { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Chile, main Pacific port' },
  // ── Red Sea / Middle East ──
  'Jeddah':       { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Saudi Arabia, Red Sea hub' },
  'Djibouti':     { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Djibouti, Horn of Africa hub' },
  'Aden':         { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Yemen, Aden Gulf' },
  'Dubai':        { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'terminal', note: 'UAE, Jebel Ali — world top-10 port' },
  'BandarAbbas':  { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Iran, Strait of Hormuz' },
  // ── Indian Ocean / South Asia ──
  'Mumbai':       { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'India, JNPT/Nhava Sheva' },
  'Chennai':      { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'India, east coast container hub' },
  'Kolkata':      { maxDraftM: 8.5,  hasShoreCranes: true,  berthType: 'river',    note: 'India, Hooghly River, draft restricted' },
  'Colombo':      { maxDraftM: 15.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Sri Lanka, South Asia transshipment hub' },
  'Karachi':      { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Pakistan, main port' },
  // ── SE Asia ──
  'PortKlang':    { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Malaysia, Westports and North Port' },
  'Jakarta':      { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Indonesia, Tanjung Priok' },
  'Manila':       { maxDraftM: 13.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Philippines, Manila International Container Terminal' },
  'HoChiMinh':    { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Vietnam, Cat Lai terminal' },
  'Bangkok':      { maxDraftM: 10.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Thailand, Laem Chabang deep-water port' },
  // ── East Asia ──
  'HongKong':     { maxDraftM: 15.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'HK, major transshipment hub' },
  'Kaohsiung':    { maxDraftM: 16.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Taiwan, largest port' },
  'Busan':        { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'South Korea, Northeast Asia hub' },
  'Incheon':      { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'South Korea, Seoul gateway' },
  'Qingdao':      { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'China, incl. Xingang/Tianjin range' },
  'Ningbo':       { maxDraftM: 20.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'China, Ningbo-Zhoushan, world top port' },
  // ── Asia ──
  'Singapore':    { maxDraftM: 20.0, hasShoreCranes: true,  berthType: 'terminal', note: 'World\'s top transshipment hub' },
  'Tokyo':        { maxDraftM: 15.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Tokyo Bay, incl. Yokohama' },
  'Shanghai':     { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'World\'s busiest port, Yangshan deep-water' },
  // ── Africa ──
  'Durban':       { maxDraftM: 12.8, hasShoreCranes: true,  berthType: 'deep-sea', note: 'South Africa, main container port' },
  'CapeTown':     { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'South Africa, Cape of Good Hope' },
  'Mombasa':      { maxDraftM: 13.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Kenya, East Africa hub' },
  'Abidjan':      { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Ivory Coast, West Africa hub' },
  'Lome':         { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Togo, transshipment hub' },
};

/** Lookup port master data. Returns null for unknown ports (not an error — caller decides). */
export function getPortMaster(rawName: string | null | undefined): PortMaster | null {
  const canonical = normalizePortName(rawName);
  if (!canonical) return null;
  const entry = PORT_MASTER[canonical];
  if (!entry) return null;
  const region = getPortRegion(canonical) ?? undefined;
  return { ...entry, region };
}

export interface DraftCheckResult {
  ok: boolean;
  portDraftM: number | null;
  vesselDraftM: number | null;
  reason?: string;
}

/**
 * Check whether a vessel's draft fits a port. Returns ok=true on any missing
 * input — a missing data point is not a failure (we don't want to filter out
 * vessels just because we couldn't verify the check).
 */
export function portCanHandleDraft(
  port: string | null | undefined,
  vesselDraftM: number | null | undefined,
): DraftCheckResult {
  const master = getPortMaster(port);
  if (!master) {
    return { ok: true, portDraftM: null, vesselDraftM: vesselDraftM ?? null, reason: 'port unknown — draft not verified' };
  }
  if (vesselDraftM == null || !Number.isFinite(vesselDraftM) || vesselDraftM <= 0) {
    return { ok: true, portDraftM: master.maxDraftM, vesselDraftM: null, reason: 'vessel draft unknown — not verified' };
  }
  if (vesselDraftM > master.maxDraftM) {
    return {
      ok: false,
      portDraftM: master.maxDraftM,
      vesselDraftM,
      reason: `vessel draft ${vesselDraftM}m exceeds port max ${master.maxDraftM}m`,
    };
  }
  return { ok: true, portDraftM: master.maxDraftM, vesselDraftM };
}

/**
 * Returns true if port has shore cranes, false if it does not, null if unknown.
 * Caller should treat null as "can't verify — don't block match, but warn".
 */
export function portHasShoreCranes(port: string | null | undefined): boolean | null {
  const master = getPortMaster(port);
  if (!master) return null;
  return master.hasShoreCranes;
}
