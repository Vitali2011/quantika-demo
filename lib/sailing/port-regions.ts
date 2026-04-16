/**
 * Port region lookup — maps every KnownPort to a geographic basin.
 *
 * Purpose: let the broker see "Black Sea / Mediterranean / Northern Europe / …"
 * next to the port name in a match card, enabling fast geographic filtering
 * without memorizing which basin each port belongs to.
 *
 * Purely additive — does not modify any existing API.
 */

import { normalizePortName, KnownPort } from './port-distances';

export type PortRegion =
  | 'BlackSea'
  | 'Mediterranean'
  | 'NorthernEurope'
  | 'Atlantic'
  | 'Asia'
  | 'Americas'
  | 'WestAfrica'
  | 'MiddleEast'
  | 'Africa';

/**
 * Hardcoded region mapping for every KnownPort entry.
 * Every KnownPort MUST have an entry — missing entry is a contract bug.
 */
const PORT_REGION_MAP: Record<KnownPort, PortRegion> = {
  // ── Black Sea ──
  'Karasu':       'BlackSea',
  'Istanbul':     'BlackSea',
  'Mykolaiv':     'BlackSea',
  'Odesa':        'BlackSea',
  'Chornomorsk':  'BlackSea',
  'Constanta':    'BlackSea',
  'Varna':        'BlackSea',
  'Burgas':       'BlackSea',
  'Novorossiysk': 'BlackSea',
  'Taman':        'BlackSea',
  'Tuapse':       'BlackSea',
  'Izmail':       'BlackSea',
  // ── Mediterranean (Aegean / Eastern / Central / Western) ──
  'Piraeus':      'Mediterranean',
  'Aliaga':       'Mediterranean',
  'Marmara':      'Mediterranean',
  'Antalya':      'Mediterranean',
  'Mersin':       'Mediterranean',
  'Iskenderun':   'Mediterranean',
  'Alexandria':   'Mediterranean',
  'Suez':         'Mediterranean',
  'Ravenna':      'Mediterranean',
  'Marghera':     'Mediterranean',
  'Skikda':       'Mediterranean',
  'Genoa':        'Mediterranean',
  'LaSpezia':     'Mediterranean',
  'Livorno':      'Mediterranean',
  'Naples':       'Mediterranean',
  'Trieste':      'Mediterranean',
  'Barcelona':    'Mediterranean',
  'Valencia':     'Mediterranean',
  'Algeciras':    'Mediterranean',
  'Marseille':    'Mediterranean',
  'Tunis':        'Mediterranean',
  'Izmir':        'Mediterranean',
  // ── Atlantic ──
  'Casablanca':   'Atlantic',
  'Tangier':      'Atlantic',
  'Georgetown':   'Atlantic',
  // ── Northern Europe ──
  'Antwerp':      'NorthernEurope',
  'Hamburg':      'NorthernEurope',
  'Rotterdam':    'NorthernEurope',
  'Bremen':       'NorthernEurope',
  'Halsvik':      'NorthernEurope',
  'Gdansk':       'NorthernEurope',
  'Bayonne':      'NorthernEurope',
  'Felixstowe':   'NorthernEurope',
  'Southampton':  'NorthernEurope',
  'Liverpool':    'NorthernEurope',
  'LeHavre':      'NorthernEurope',
  'Dunkirk':      'NorthernEurope',
  'Zeebrugge':    'NorthernEurope',
  'Aarhus':       'NorthernEurope',
  'Goteborg':     'NorthernEurope',
  'Helsinki':     'NorthernEurope',
  'Tallinn':      'NorthernEurope',
  'Haugesund':    'NorthernEurope',
  // ── West Africa ──
  'Dakar':        'WestAfrica',
  'Lagos':        'WestAfrica',
  'Nacala':       'WestAfrica',
  'Abidjan':      'WestAfrica',
  'Lome':         'WestAfrica',
  // ── Other Africa (South/East) ──
  'Durban':       'Africa',
  'CapeTown':     'Africa',
  'Mombasa':      'Africa',
  // ── Middle East (Red Sea / Persian Gulf) ──
  'Jeddah':       'MiddleEast',
  'Djibouti':     'MiddleEast',
  'Aden':         'MiddleEast',
  'Dubai':        'MiddleEast',
  'BandarAbbas':  'MiddleEast',
  // ── Americas ──
  'Veracruz':     'Americas',
  'NewOrleans':   'Americas',
  'Houston':      'Americas',
  'Santos':       'Americas',
  'LosAngeles':   'Americas',
  'LongBeach':    'Americas',
  'Seattle':      'Americas',
  'Vancouver':    'Americas',
  'Mobile':       'Americas',
  'Savannah':     'Americas',
  'Baltimore':    'Americas',
  'Norfolk':      'Americas',
  'BuenosAires':  'Americas',
  'Paranagua':    'Americas',
  'Callao':       'Americas',
  'Valparaiso':   'Americas',
  // ── Asia (South Asia / SE Asia / East Asia) ──
  'Mumbai':       'Asia',
  'Chennai':      'Asia',
  'Kolkata':      'Asia',
  'Colombo':      'Asia',
  'Karachi':      'Asia',
  'PortKlang':    'Asia',
  'Jakarta':      'Asia',
  'Manila':       'Asia',
  'HoChiMinh':    'Asia',
  'Bangkok':      'Asia',
  'HongKong':     'Asia',
  'Kaohsiung':    'Asia',
  'Busan':        'Asia',
  'Incheon':      'Asia',
  'Qingdao':      'Asia',
  'Ningbo':       'Asia',
  'Singapore':    'Asia',
  'Tokyo':        'Asia',
  'Shanghai':     'Asia',
};

/**
 * Returns the geographic region for a port name.
 *
 * - Normalizes the name through `normalizePortName` (handles aliases, casing, trim).
 * - Returns `null` for unknown ports, empty string, `null`, or `undefined` input.
 *
 * @example
 * getPortRegion('karasu')    // → 'BlackSea'
 * getPortRegion('ROTTERDAM') // → 'NorthernEurope'
 * getPortRegion('Nowhere')   // → null
 * getPortRegion(null)        // → null
 */
export function getPortRegion(portName: string | null | undefined): PortRegion | null {
  const canonical = normalizePortName(portName);
  if (!canonical) return null;
  return PORT_REGION_MAP[canonical] ?? null;
}
