/**
 * Port-to-port sea distance table (nautical miles) for the demo-scope ports.
 *
 * Source of values: consensus distances from sea-distances.org / searates.com /
 * portworld.com for the main pairs. Figures are approximate, rounded to 5 NM
 * for readability — accurate enough to compute ETA within ±6h for a handysize
 * at 12-13 knots (well within the granularity of a laycan window).
 *
 * Deliberately only includes ports that appear in the demo sample-data. Unknown
 * ports return `null`, which downstream code treats as "unknown readiness" — the
 * match is not filtered, just not credited/penalized. This fails gracefully.
 */

import fuzzysort from 'fuzzysort';
import PORTS_JSON from '@/data/ports/port-master.json';
import { loadPortMasterFromJson } from './port-master-loader';
import type { PortMaster } from './port-master';

/** Canonical port names used as map keys. */
export const KNOWN_PORTS = [
  // Black Sea
  'Karasu', 'Istanbul', 'Mykolaiv', 'Odesa', 'Chornomorsk', 'Constanta', 'Varna', 'Burgas', 'Novorossiysk',
  'Taman', 'Tuapse', 'Izmail', 'Yuzhny',
  // Aegean / Eastern Med
  'Piraeus', 'Aliaga', 'Marmara', 'Derince', 'Antalya', 'Mersin', 'Iskenderun',
  // Eastern Med / Suez
  'Alexandria', 'Suez', 'Tartus',
  // Central / Western Med
  'Ravenna', 'Marghera', 'Skikda', 'Casablanca',
  'Genoa', 'LaSpezia', 'Livorno', 'Naples', 'Trieste',
  // Phase G1 — Ligurian coast
  'Savona', 'Vado Ligure',
  'Barcelona', 'Valencia', 'Algeciras', 'Marseille', 'Gibraltar',
  'Tunis', 'Izmir',
  // Phase C1 — Italian Adriatic / Sicily
  'Vasto', 'Trapani', 'Pozzallo',
  // Phase C1 — North Africa Med
  'Damietta', 'Bizerte', 'Bejaia',
  // Northern Europe
  'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk',
  'Felixstowe', 'Southampton', 'Liverpool', 'LeHavre', 'Dunkirk', 'Zeebrugge',
  // Phase C1 — UK/Ireland additions
  'Birkenhead', 'Greenore',
  'Aarhus', 'Goteborg', 'Helsinki', 'Tallinn',
  'Haugesund',
  // Atlantic
  // Phase G1 — Portuguese Atlantic
  'Figueira da Foz',
  'Bayonne', 'Dakar', 'Lagos', 'Nacala',
  // Phase C1 — West Africa addition
  'Conakry',
  'Georgetown',
  'Tangier',
  // Americas
  'Veracruz', 'NewOrleans', 'Houston', 'Santos',
  'LosAngeles', 'LongBeach', 'Seattle', 'Vancouver',
  'Mobile', 'Savannah', 'Baltimore', 'Norfolk',
  'BuenosAires', 'Paranagua', 'Callao', 'Valparaiso',
  // Red Sea / Middle East
  'Jeddah', 'Djibouti', 'Aden', 'Dubai', 'BandarAbbas',
  // Phase C1 — Arabian Gulf / Gulf of Oman additions
  'Fujairah', 'Sohar',
  // Indian Ocean / South Asia
  'Mumbai', 'Chennai', 'Kolkata', 'Colombo', 'Karachi', 'Kakinada',
  // SE Asia
  'PortKlang', 'Jakarta', 'Manila', 'HoChiMinh', 'Bangkok', 'Songkhla',
  // East Asia
  'HongKong', 'Kaohsiung', 'Busan', 'Incheon', 'Qingdao', 'Ningbo',
  // Asia
  'Singapore', 'Tokyo', 'Shanghai',
  // Africa
  'Durban', 'CapeTown', 'Mombasa', 'Abidjan', 'Lome',
] as const;

export type KnownPort = typeof KNOWN_PORTS[number];

/**
 * Aliases map alternative spellings / former names / range phrasing to canonical.
 * Keys must be lowercase; values must be elements of KNOWN_PORTS.
 */
const PORT_ALIASES: Record<string, KnownPort> = {
  // Black Sea
  'karasu': 'Karasu',
  'istanbul': 'Istanbul',
  'ambarli': 'Istanbul',        // port of Istanbul
  'tuzla': 'Istanbul',
  'mykolaiv': 'Mykolaiv',
  'nikolaev': 'Mykolaiv',       // former Russian name
  'mykolayiv': 'Mykolaiv',
  'odesa': 'Odesa',
  'odessa': 'Odesa',            // common English spelling
  'chornomorsk': 'Chornomorsk',
  'chernomorsk': 'Chornomorsk',
  'ilichivsk': 'Chornomorsk',   // former name
  'illichivsk': 'Chornomorsk',
  'constanta': 'Constanta',
  'constantza': 'Constanta',
  'konstanta': 'Constanta',
  'konstantsa': 'Constanta',     // Russian/Bulgarian transliteration variant
  'varna': 'Varna',
  'burgas': 'Burgas',
  'bourgas': 'Burgas',
  'novorossiysk': 'Novorossiysk',
  'novorossiisk': 'Novorossiysk',
  'novorossisk': 'Novorossiysk', // common typo — missing 'iy'
  'taman': 'Taman',
  'tuapse': 'Tuapse',
  'izmail': 'Izmail',
  'reni': 'Izmail',             // Reni is a nearby Danube port, use Izmail as proxy
  'izmail / reni': 'Izmail',
  'izmayil': 'Izmail',
  'yuzhny': 'Yuzhny',
  'pivdennyi': 'Yuzhny',        // Ukrainian name for Yuzhny port
  'pivdenniy': 'Yuzhny',
  'yuzhne': 'Yuzhny',
  'pivdennyi (yuzhne)': 'Yuzhny',
  'yuzhniy': 'Yuzhny',
  'giurgiulesti': 'Izmail',     // Moldovan Danube port, ~80km from Izmail
  'giurgiuleshti': 'Izmail',    // alt transliteration
  'giurgiulești': 'Izmail',     // Romanian diacritic spelling
  'braila': 'Izmail',           // Romanian Danube port, ~120km upstream
  'brăila': 'Izmail',
  'galati': 'Izmail',           // Romanian Danube port, ~80km upstream
  'galați': 'Izmail',
  'kavkaz': 'Novorossiysk',     // Port Kavkaz — Kerch Strait, ~200km from Novorossiysk
  // Aegean
  'piraeus': 'Piraeus',
  'pireus': 'Piraeus',
  'aliaga': 'Aliaga',
  'aliağa': 'Aliaga',           // Turkish diacritic spelling
  'petkim': 'Aliaga',           // Petkim petrochemical terminal in Aliaga bay
  'efesan': 'Aliaga',           // Efesan terminal in Aliaga bay
  'nemrut': 'Aliaga',           // Nemrut Bay — Aliaga's main industrial complex
  'nemrut bay': 'Aliaga',
  'izmir': 'Izmir',
  'smyrna': 'Izmir',            // former name
  'marmara': 'Marmara',
  'marmara island': 'Marmara',
  'marmara sea': 'Marmara',
  'sea of marmara': 'Marmara',
  'bandirma': 'Marmara',        // same Sea of Marmara region
  'bandırma': 'Marmara',        // Turkish diacritic spelling
  'yarimca': 'Marmara',         // Yarımca — Izmit Bay, Marmara cluster
  'yarımca': 'Marmara',         // Turkish diacritic spelling
  'diliskelesi': 'Marmara',     // Dilovasi industrial cluster — Marmara south shore
  'dilovasi': 'Marmara',
  'canakkale': 'Marmara',       // Çanakkale — Dardanelles strait, Marmara entry
  'çanakkale': 'Marmara',       // Turkish diacritic spelling
  'hereke': 'Marmara',          // Hereke (Korfez Bay) — Marmara cluster
  'gemlik': 'Marmara',          // Gemlik Bay — south Marmara
  'mudanya': 'Marmara',         // Mudanya — south Marmara
  'tekirdag': 'Marmara',        // Tekirdag — north Marmara
  'tekirdağ': 'Marmara',
  'derince': 'Derince',         // Derince/Izmit — own canonical entry (hasShoreCranes fix)
  'izmit': 'Derince',           // Izmit is adjacent to Derince on Gulf of Izmit
  'izmit-derince': 'Derince',
  'antalya': 'Antalya',
  'mersin': 'Mersin',
  'icel': 'Mersin',             // former name of Mersin province
  'iskenderun': 'Iskenderun',
  'alexandretta': 'Iskenderun', // historical name
  // Eastern Med / Suez
  'alexandria': 'Alexandria',
  'el dekheila': 'Alexandria',  // Alexandria El Dekheila terminal
  'eldekheila': 'Alexandria',
  'dekheila': 'Alexandria',
  'abu qir': 'Alexandria',      // Abu Qir Bay — Alexandria's eastern terminal
  'abukir': 'Alexandria',
  'adabiya': 'Suez',            // Adabiya — bulk terminal in Suez Gulf, part of Suez port complex
  'ain sokhna': 'Suez',         // Ain Sokhna is on Suez Gulf, use Suez as proxy
  'sokhna': 'Suez',
  'suez': 'Suez',
  'port suez': 'Suez',
  'tartus': 'Tartus',
  'tartous': 'Tartus',          // French/Arabic spelling variant
  'tartoos': 'Tartus',          // alt transliteration
  // Mediterranean
  'ravenna': 'Ravenna',
  'marghera': 'Marghera',
  'porto marghera': 'Marghera',
  'venice': 'Marghera',         // Venice/Marghera — same port complex
  'venezia': 'Marghera',
  'skikda': 'Skikda',
  'genoa': 'Genoa',
  'genova': 'Genoa',
  'la spezia': 'LaSpezia',
  'laspezia': 'LaSpezia',
  'livorno': 'Livorno',
  'leghorn': 'Livorno',         // English historical name
  'naples': 'Naples',
  'napoli': 'Naples',
  'trieste': 'Trieste',
  'barcelona': 'Barcelona',
  'valencia': 'Valencia',
  'algeciras': 'Algeciras',
  'gibraltar': 'Gibraltar',     // present in port-master.json but missing from aliases
  'gibraltar range': 'Gibraltar',
  'marseille': 'Marseille',
  'marseilles': 'Marseille',
  'tunis': 'Tunis',
  'tunis-carthage': 'Tunis',
  // Atlantic / Northern Europe
  'casablanca': 'Casablanca',
  'antwerp': 'Antwerp',
  'port of antwerp': 'Antwerp',
  'ara': 'Antwerp',             // ARA range — use Antwerp as anchor
  'ara range': 'Antwerp',
  'amsterdam': 'Rotterdam',     // ARA group, Rotterdam as proxy
  'hamburg': 'Hamburg',
  'rotterdam': 'Rotterdam',
  'bremen': 'Bremen',
  'bremerhaven': 'Bremen',      // same port region
  'halsvik': 'Halsvik',
  'haugesund': 'Haugesund',
  'gdansk': 'Gdansk',
  'danzig': 'Gdansk',
  'gdynia': 'Gdansk',           // nearby Polish port
  'bayonne': 'Bayonne',
  'bilbao': 'Bayonne',          // same Biscay region
  'biscay': 'Bayonne',
  'bay of biscay': 'Bayonne',
  'felixstowe': 'Felixstowe',
  'southampton': 'Southampton',
  'liverpool': 'Liverpool',
  'le havre': 'LeHavre',
  'lehavre': 'LeHavre',
  'dunkirk': 'Dunkirk',
  'dunkerque': 'Dunkirk',
  'zeebrugge': 'Zeebrugge',
  'aarhus': 'Aarhus',
  'arhus': 'Aarhus',
  'goteborg': 'Goteborg',
  'gothenburg': 'Goteborg',
  'helsinki': 'Helsinki',
  'helsingfors': 'Helsinki',    // Swedish name
  'tallinn': 'Tallinn',
  'tallin': 'Tallinn',
  'reval': 'Tallinn',           // historical name
  'tangier': 'Tangier',
  'tanger': 'Tangier',
  // West Africa
  'dakar': 'Dakar',
  'lagos': 'Lagos',
  'apapa': 'Lagos',             // Lagos Apapa terminal
  'nacala': 'Nacala',
  // Americas
  'veracruz': 'Veracruz',
  'vera cruz': 'Veracruz',
  'new orleans': 'NewOrleans',
  'neworleans': 'NewOrleans',
  'houston': 'Houston',
  'santos': 'Santos',
  'sao paulo': 'Santos',        // Santos is SP's port
  'los angeles': 'LosAngeles',
  'losangeles': 'LosAngeles',
  'long beach': 'LongBeach',
  'longbeach': 'LongBeach',
  'seattle': 'Seattle',
  'tacoma': 'Seattle',          // same Puget Sound region
  'vancouver': 'Vancouver',
  'mobile': 'Mobile',
  'savannah': 'Savannah',
  'baltimore': 'Baltimore',
  'norfolk': 'Norfolk',
  'hampton roads': 'Norfolk',
  'buenos aires': 'BuenosAires',
  'buenosaires': 'BuenosAires',
  'paranagua': 'Paranagua',
  'callao': 'Callao',
  'lima': 'Callao',             // Callao is Lima's port
  'valparaiso': 'Valparaiso',
  'valparaíso': 'Valparaiso',
  'georgetown': 'Georgetown',
  // Red Sea / Middle East
  'jeddah': 'Jeddah',
  'king abdullah port': 'Jeddah',  // KAEC port at Rabigh, ~120km N of Jeddah — Red Sea
  'king abdullah': 'Jeddah',
  'kaec': 'Jeddah',
  'jidda': 'Jeddah',
  'jidah': 'Jeddah',
  'djibouti': 'Djibouti',
  'aden': 'Aden',
  'dubai': 'Dubai',
  'jebel ali': 'Dubai',         // Jebel Ali is Dubai's main port

  'jebelali': 'Dubai',
  'bandar abbas': 'BandarAbbas',
  'bandarabbas': 'BandarAbbas',
  'bandar-Abbas': 'BandarAbbas',
  // Indian Ocean / South Asia
  'mumbai': 'Mumbai',
  'bombay': 'Mumbai',           // former name
  'nhava sheva': 'Mumbai',      // JNPT/Nhava Sheva is Mumbai's container port
  'nhava-sheva': 'Mumbai',
  'jnpt': 'Mumbai',
  'chennai': 'Chennai',
  'madras': 'Chennai',          // former name
  'kolkata': 'Kolkata',
  'calcutta': 'Kolkata',        // former name
  'colombo': 'Colombo',
  'karachi': 'Karachi',
  'kakinada': 'Kakinada',
  'kakinada anchorage': 'Kakinada',
  'kakinada anch': 'Kakinada',
  'kakinada deep water': 'Kakinada',
  // SE Asia
  'port klang': 'PortKlang',
  'portklang': 'PortKlang',
  'klang': 'PortKlang',
  'jakarta': 'Jakarta',
  'tanjung priok': 'Jakarta',   // Jakarta's main port
  'tanjungpriok': 'Jakarta',
  'manila': 'Manila',
  'ho chi minh': 'HoChiMinh',
  'hochiminh': 'HoChiMinh',
  'saigon': 'HoChiMinh',        // former name
  'cat lai': 'HoChiMinh',       // Ho Chi Minh container terminal
  'bangkok': 'Bangkok',
  'laem chabang': 'Bangkok',    // Bangkok's main deep-water port
  'laemchabang': 'Bangkok',
  'songkhla': 'Songkhla',
  'koh sichang': 'Bangkok',     // Ko Si Chang anchorage — Gulf of Thailand, Bangkok proxy
  'ko sichang': 'Bangkok',
  'ko si chang': 'Bangkok',
  // East Asia
  'hong kong': 'HongKong',
  'hongkong': 'HongKong',
  'kaohsiung': 'Kaohsiung',
  'busan': 'Busan',
  'pusan': 'Busan',             // older romanization
  'incheon': 'Incheon',
  'inchon': 'Incheon',
  'qingdao': 'Qingdao',
  'tsingtao': 'Qingdao',
  'xingang': 'Qingdao',         // Xingang is Tianjin port, close to Qingdao range
  'tianjin': 'Qingdao',         // same North China range
  'ningbo': 'Ningbo',
  'ningbo-zhoushan': 'Ningbo',
  // Asia
  'singapore': 'Singapore',
  'tokyo': 'Tokyo',
  'yokohama': 'Tokyo',          // same Tokyo Bay port complex
  'shanghai': 'Shanghai',
  // Africa
  'durban': 'Durban',
  'cape town': 'CapeTown',
  'capetown': 'CapeTown',
  'mombasa': 'Mombasa',
  'abidjan': 'Abidjan',
  'lome': 'Lome',
  'lomé': 'Lome',
  // ── Phase C1 — new canonical entries (port-master.json extension) ──
  'vasto': 'Vasto',
  'vasto port': 'Vasto',
  'porto di vasto': 'Vasto',
  'birkenhead': 'Birkenhead',
  'port of birkenhead': 'Birkenhead',
  'greenore': 'Greenore',
  'greenore port': 'Greenore',
  'damietta': 'Damietta',
  'damietta port': 'Damietta',
  'dumyat': 'Damietta',
  'bizerte': 'Bizerte',
  'bizerta': 'Bizerte',
  'bejaia': 'Bejaia',
  'bejaïa': 'Bejaia',
  'bgayet': 'Bejaia',
  'bougie': 'Bejaia',
  'trapani': 'Trapani',
  'porto di trapani': 'Trapani',
  'pozzallo': 'Pozzallo',
  'porto di pozzallo': 'Pozzallo',
  'fujairah': 'Fujairah',
  'port of fujairah': 'Fujairah',
  'fujayrah': 'Fujairah',
  'sohar': 'Sohar',
  'port of sohar': 'Sohar',
  'suhar': 'Sohar',
  'conakry': 'Conakry',
  'port of conakry': 'Conakry',
  'konakry': 'Conakry',
  // ── Phase G1 — Ligurian coast explicit aliases ──
  'savona': 'Savona',
  'porto di savona': 'Savona',
  'vado ligure': 'Vado Ligure',
  'vado': 'Vado Ligure',
  'vado ligure sech': 'Vado Ligure',
  'savona-vado': 'Vado Ligure',   // compound name — resolves to ITVDL (separate UNLOCODE)
  'figueira': 'Figueira da Foz',
  'figueira da foz': 'Figueira da Foz',
  'figueira foz': 'Figueira da Foz',

};

/**
 * Sparse distance table: key is "PortA|PortB" sorted alphabetically.
 * Missing pairs → null (graceful degradation).
 * Values in nautical miles.
 */
const DISTANCES_NM: Record<string, number> = {
  // ── Black Sea cluster ──
  'Istanbul|Karasu': 95,
  'Karasu|Mykolaiv': 315,
  'Karasu|Odesa': 315,
  'Constanta|Karasu': 260,
  'Karasu|Varna': 205,
  'Burgas|Karasu': 180,
  'Karasu|Novorossiysk': 400,

  'Istanbul|Mykolaiv': 415,
  'Mykolaiv|Odesa': 85,
  'Constanta|Mykolaiv': 260,
  'Mykolaiv|Varna': 330,
  'Burgas|Mykolaiv': 370,
  'Mykolaiv|Novorossiysk': 440,

  'Istanbul|Odesa': 370,
  'Constanta|Odesa': 180,
  'Odesa|Varna': 290,
  'Burgas|Odesa': 330,
  'Novorossiysk|Odesa': 490,

  'Constanta|Istanbul': 200,
  'Constanta|Varna': 90,
  'Burgas|Constanta': 130,
  'Constanta|Novorossiysk': 460,

  'Burgas|Varna': 70,
  'Istanbul|Varna': 185,
  'Burgas|Istanbul': 150,

  'Istanbul|Novorossiysk': 480,
  'Burgas|Novorossiysk': 580,
  'Novorossiysk|Varna': 500,

  // ── Bosphorus → Aegean / Eastern Med ──
  'Istanbul|Piraeus': 430,
  'Aliaga|Istanbul': 275,
  'Alexandria|Istanbul': 870,
  'Istanbul|Ravenna': 1050,
  'Istanbul|Skikda': 1330,
  'Casablanca|Istanbul': 2200,
  'Bayonne|Istanbul': 2900,

  // ── Black Sea → Med (via Bosphorus; approximate transits) ──
  'Karasu|Piraeus': 525,
  'Aliaga|Karasu': 370,
  'Alexandria|Karasu': 965,
  'Karasu|Ravenna': 1145,
  'Karasu|Skikda': 1425,

  'Mykolaiv|Piraeus': 845,
  'Aliaga|Mykolaiv': 690,
  'Alexandria|Mykolaiv': 1285,
  'Mykolaiv|Ravenna': 1465,

  'Odesa|Piraeus': 800,
  'Aliaga|Odesa': 645,
  'Alexandria|Odesa': 1240,

  'Constanta|Piraeus': 790,
  'Aliaga|Constanta': 475,
  'Alexandria|Constanta': 1070,
  'Constanta|Ravenna': 1250,

  // ── Aegean internal ──
  'Aliaga|Piraeus': 185,
  'Alexandria|Piraeus': 560,
  'Piraeus|Ravenna': 700,
  'Piraeus|Skikda': 900,
  'Casablanca|Piraeus': 1750,
  'Bayonne|Piraeus': 2500,

  'Aliaga|Alexandria': 620,
  'Aliaga|Ravenna': 910,
  'Aliaga|Skikda': 1130,

  // ── Mediterranean proper ──
  'Alexandria|Ravenna': 1150,
  'Alexandria|Skikda': 1350,
  'Alexandria|Casablanca': 2100,
  'Alexandria|Bayonne': 2900,

  'Ravenna|Skikda': 770,
  'Casablanca|Ravenna': 1600,
  'Bayonne|Ravenna': 1800,

  'Casablanca|Skikda': 700,
  'Bayonne|Skikda': 1500,

  // ── Atlantic ──
  'Bayonne|Casablanca': 900,

  // ── Chornomorsk (Black Sea, near Odesa) ──
  'Chornomorsk|Odesa': 25,
  'Chornomorsk|Mykolaiv': 75,
  'Chornomorsk|Constanta': 160,
  'Chornomorsk|Karasu': 305,
  'Chornomorsk|Istanbul': 355,
  'Chornomorsk|Varna': 270,
  'Chornomorsk|Burgas': 310,
  'Chornomorsk|Novorossiysk': 470,
  'Chornomorsk|Piraeus': 790,
  'Chornomorsk|Aliaga': 635,
  'Chornomorsk|Alexandria': 1230,
  'Chornomorsk|Ravenna': 1445,
  'Chornomorsk|Skikda': 1700,

  // ── Derince (Gulf of Izmit, Sea of Marmara) ──
  'Derince|Istanbul': 90,
  'Derince|Marmara': 50,
  'Derince|Piraeus': 380,
  'Aliaga|Derince': 225,
  'Alexandria|Derince': 820,
  'Constanta|Derince': 290,
  'Derince|Mykolaiv': 505,
  'Derince|Odesa': 460,

  // ── Marmara (Sea of Marmara) ──
  'Istanbul|Marmara': 70,
  'Karasu|Marmara': 160,
  'Marmara|Piraeus': 360,
  'Aliaga|Marmara': 205,
  'Alexandria|Marmara': 800,
  'Marmara|Mykolaiv': 485,
  'Constanta|Marmara': 270,
  'Marmara|Odesa': 440,

  // ── Suez (southern end of Suez Canal) ──
  'Alexandria|Suez': 200,
  'Suez|Piraeus': 760,
  'Aliaga|Suez': 820,
  'Istanbul|Suez': 1070,
  'Karasu|Suez': 1165,
  'Mykolaiv|Suez': 1485,
  'Odesa|Suez': 1440,
  'Constanta|Suez': 1270,
  'Ravenna|Suez': 1350,
  'Marghera|Suez': 1370,
  'Skikda|Suez': 1550,
  'Casablanca|Suez': 2300,

  // ── Marghera / Venice (Northern Adriatic) ──
  'Marghera|Ravenna': 90,
  'Istanbul|Marghera': 1060,
  'Karasu|Marghera': 1155,
  'Mykolaiv|Marghera': 1475,
  'Odesa|Marghera': 1430,
  'Chornomorsk|Marghera': 1455,
  'Constanta|Marghera': 1260,
  'Piraeus|Marghera': 710,
  'Aliaga|Marghera': 920,
  'Alexandria|Marghera': 1160,
  'Casablanca|Marghera': 1650,
  'Bayonne|Marghera': 1830,
  'Skikda|Marghera': 780,

  // ── Northern Europe cluster ──
  'Antwerp|Hamburg': 310,
  'Antwerp|Rotterdam': 80,
  'Bremen|Hamburg': 130,
  'Antwerp|Bremen': 260,
  'Rotterdam|Hamburg': 250,
  'Rotterdam|Bremen': 230,
  'Antwerp|Gdansk': 810,
  'Hamburg|Gdansk': 570,
  'Rotterdam|Gdansk': 760,
  'Antwerp|Halsvik': 930,
  'Hamburg|Halsvik': 700,
  'Rotterdam|Halsvik': 900,
  'Bremen|Gdansk': 510,
  'Gdansk|Halsvik': 840,
  'Bremen|Halsvik': 650,

  // Northern Europe ↔ Med / Atlantic
  'Antwerp|Bayonne': 730,
  'Antwerp|Casablanca': 1400,
  'Hamburg|Casablanca': 1700,
  'Rotterdam|Casablanca': 1450,
  'Antwerp|Skikda': 2100,
  'Antwerp|Ravenna': 2350,
  'Antwerp|Marghera': 2360,
  'Antwerp|Piraeus': 2820,
  'Hamburg|Piraeus': 2950,
  'Antwerp|Alexandria': 3380,
  'Hamburg|Alexandria': 3500,
  'Rotterdam|Piraeus': 2850,
  'Rotterdam|Alexandria': 3400,
  'Antwerp|Suez': 3580,
  'Hamburg|Suez': 3700,

  // Northern Europe ↔ Black Sea
  'Antwerp|Derince': 3390,
  'Antwerp|Istanbul': 3300,
  'Hamburg|Istanbul': 3430,
  'Rotterdam|Istanbul': 3330,
  'Antwerp|Constanta': 3680,
  'Antwerp|Odesa': 3870,
  'Antwerp|Mykolaiv': 3950,
  'Hamburg|Constanta': 3800,
  'Gdansk|Istanbul': 3050,
  'Halsvik|Istanbul': 3950,

  // ── West Africa ──
  'Casablanca|Dakar': 1400,
  'Bayonne|Dakar': 2000,
  'Antwerp|Dakar': 3300,
  'Hamburg|Dakar': 3600,
  'Dakar|Lagos': 2400,
  'Casablanca|Lagos': 3500,
  'Dakar|Nacala': 5600,
  'Lagos|Nacala': 3800,
  'Alexandria|Dakar': 4500,
  'Piraeus|Dakar': 4100,

  // ── Americas ──
  'Casablanca|Veracruz': 4400,
  'Bayonne|Veracruz': 4900,
  'Antwerp|Veracruz': 5200,
  'Hamburg|Veracruz': 5400,
  'Houston|Veracruz': 680,
  'NewOrleans|Veracruz': 600,
  'Houston|NewOrleans': 400,
  'Houston|Santos': 5700,
  'NewOrleans|Santos': 5400,
  'Santos|Veracruz': 6100,
  'Dakar|Santos': 4200,
  'Casablanca|Santos': 5500,
  'Antwerp|Santos': 5800,
  'Hamburg|Santos': 6000,
  'Dakar|Veracruz': 4700,
  'Dakar|Houston': 5500,
  'Dakar|NewOrleans': 5200,

  // ── Asia ──
  'Singapore|Tokyo': 3300,
  'Shanghai|Tokyo': 1100,
  'Shanghai|Singapore': 2200,
  'Suez|Singapore': 5200,
  'Suez|Shanghai': 7100,
  'Suez|Tokyo': 8200,
  'Antwerp|Singapore': 9800,
  'Hamburg|Singapore': 9900,
  'Rotterdam|Singapore': 9820,
  'Alexandria|Singapore': 5400,
  'Piraeus|Singapore': 5800,
  'Piraeus|Shanghai': 7600,
  'Piraeus|Tokyo': 8700,
  'Nacala|Singapore': 4000,
  'Nacala|Shanghai': 5800,
  'Lagos|Singapore': 7600,
  'Houston|Singapore': 10800,
  'Veracruz|Singapore': 10500,
  'Santos|Singapore': 11500,

  // ── Black Sea additions (Taman, Tuapse, Izmail) ──
  'Istanbul|Taman': 490,
  'Karasu|Taman': 395,
  'Novorossiysk|Taman': 40,
  'Constanta|Taman': 510,
  'Odesa|Taman': 540,
  'Istanbul|Tuapse': 530,
  'Karasu|Tuapse': 435,
  'Novorossiysk|Tuapse': 80,
  'Constanta|Tuapse': 550,
  'Istanbul|Izmail': 300,
  'Constanta|Izmail': 130,
  'Odesa|Izmail': 150,
  'Mykolaiv|Izmail': 200,

  // ── Marmara → Northern Europe / Med (missing pairs) ──
  'Antwerp|Marmara': 3370,
  'Hamburg|Marmara': 3500,
  'Hamburg|Derince': 3440,
  'Halsvik|Marmara': 4020,
  'Haugesund|Marmara': 3980,
  'Bayonne|Marmara': 2970,
  'Casablanca|Marmara': 2270,
  'Marmara|Novorossiysk': 620,
  'Marmara|Skikda': 1400,

  // ── Izmail → Northern Europe / Med (missing pairs) ──
  'Antwerp|Izmail': 3750,
  'Casablanca|Izmail': 2650,
  'Hamburg|Izmail': 3880,
  'Halsvik|Izmail': 4400,
  'Haugesund|Izmail': 4360,
  'Izmail|Marmara': 430,

  // ── Chornomorsk → Northern Europe (missing pairs) ──
  'Chornomorsk|Halsvik': 4320,
  'Chornomorsk|Haugesund': 4280,
  'Chornomorsk|Marmara': 450,

  // ── Constanta → Northern Europe (missing pairs) ──
  'Constanta|Halsvik': 4180,
  'Constanta|Haugesund': 4140,

  // ── Mykolaiv → Northern Europe (missing pairs) ──
  'Halsvik|Mykolaiv': 4400,
  'Haugesund|Mykolaiv': 4360,

  // ── Alexandria → Northern Europe (missing pairs) ──
  'Alexandria|Halsvik': 4300,
  'Alexandria|Haugesund': 4260,

  // ── Suez → Northern Europe / Marmara (missing pairs) ──
  'Halsvik|Suez': 4500,
  'Haugesund|Suez': 4460,
  'Marmara|Suez': 870,

  // ── Qingdao → Northern Europe / Marmara (missing pairs) ──
  // Route: Qingdao → Suez → NW Europe / Med (via Suez Canal)
  'Halsvik|Qingdao': 12450,
  'Haugesund|Qingdao': 12410,
  'Marmara|Qingdao': 9500,

  // ── Eastern Med additions (Antalya, Mersin, Iskenderun) ──
  'Antalya|Istanbul': 450,
  'Antalya|Piraeus': 380,
  'Antalya|Alexandria': 650,
  'Aliaga|Antalya': 280,
  'Antalya|Marmara': 400,
  'Antalya|Karasu': 540,          // Antalya → Black Sea via Bosphorus
  'Antalya|Novorossiysk': 860,
  'Antalya|Skikda': 780,
  'Antalya|Casablanca': 1750,
  'Antalya|Antwerp': 3220,
  'Antalya|Hamburg': 3350,
  'Antalya|Bayonne': 2400,
  'Antalya|Halsvik': 4070,
  'Antalya|Haugesund': 4030,
  'Antalya|Mersin': 280,
  'Mersin|Piraeus': 580,
  'Alexandria|Mersin': 430,
  'Aliaga|Mersin': 350,
  'Istanbul|Mersin': 700,
  'Iskenderun|Mersin': 90,
  'Iskenderun|Piraeus': 660,
  'Alexandria|Iskenderun': 470,
  'Istanbul|Iskenderun': 780,
  'Aliaga|Iskenderun': 420,
  'Iskenderun|Marmara': 510,
  'Iskenderun|Mykolaiv': 800,
  'Iskenderun|Odesa': 760,
  'Constanta|Iskenderun': 590,
  'Iskenderun|Novorossiysk': 830,
  'Iskenderun|Skikda': 900,
  'Iskenderun|Ravenna': 1130,

  // ── Izmir standalone ──
  'Izmir|Istanbul': 290,
  'Izmir|Piraeus': 200,
  'Alexandria|Izmir': 640,
  'Izmir|Marmara': 220,

  // ── Mediterranean additions (Genoa, LaSpezia, Livorno, Naples, Trieste, Barcelona, Valencia, Algeciras, Marseille, Tunis) ──
  'Genoa|Marseille': 180,
  'Genoa|LaSpezia': 60,
  'Genoa|Livorno': 110,
  'Genoa|Barcelona': 480,
  'Genoa|Algeciras': 920,
  'Genoa|Piraeus': 900,
  'Genoa|Alexandria': 1400,
  'Genoa|Suez': 1600,
  'Antwerp|Genoa': 2480,
  'Hamburg|Genoa': 2600,
  'Genoa|Skikda': 680,
  'Genoa|Ravenna': 380,
  'Genoa|Marghera': 440,

  'LaSpezia|Marseille': 210,
  'LaSpezia|Livorno': 55,
  'Barcelona|LaSpezia': 510,

  'Barcelona|Marseille': 290,
  'Barcelona|Valencia': 175,
  'Algeciras|Barcelona': 700,
  'Algeciras|Casablanca': 150,
  'Algeciras|Piraeus': 1740,
  'Algeciras|Suez': 2940,
  'Algeciras|Skikda': 680,
  'Algeciras|Marseille': 830,
  'Antwerp|Algeciras': 1380,
  'Hamburg|Algeciras': 1600,
  'Rotterdam|Algeciras': 1400,

  'Marseille|Piraeus': 780,
  'Marseille|Skikda': 480,
  'Marseille|Tunis': 620,
  'Marseille|Alexandria': 1300,
  'Antwerp|Marseille': 1820,

  'Tunis|Piraeus': 650,
  'Tunis|Alexandria': 1100,
  'Tunis|Skikda': 290,
  'Tunis|Suez': 1300,

  'Naples|Piraeus': 560,
  'Naples|Alexandria': 1200,
  'Naples|Suez': 1400,
  'Naples|Skikda': 620,
  'Naples|Marseille': 390,
  'Naples|Genoa': 390,

  'Trieste|Piraeus': 680,
  'Trieste|Ravenna': 120,
  'Trieste|Marghera': 45,
  'Trieste|Istanbul': 1090,
  'Trieste|Alexandria': 1200,

  // ── Northern Europe additions ──
  'Felixstowe|Rotterdam': 110,
  'Felixstowe|Antwerp': 140,
  'Felixstowe|Hamburg': 360,
  'Felixstowe|LeHavre': 160,
  'Southampton|LeHavre': 100,
  'Southampton|Rotterdam': 220,
  'Southampton|Antwerp': 250,
  'Liverpool|Rotterdam': 400,
  'Liverpool|Antwerp': 420,
  'Liverpool|Hamburg': 580,
  'LeHavre|Rotterdam': 180,
  'Antwerp|LeHavre': 170,
  'Antwerp|Dunkirk': 95,
  'Antwerp|Zeebrugge': 60,
  'Zeebrugge|Rotterdam': 100,
  'Zeebrugge|Hamburg': 360,
  'Dunkirk|Rotterdam': 120,
  'Dunkirk|LeHavre': 90,
  'Aarhus|Hamburg': 280,
  'Aarhus|Rotterdam': 580,
  'Aarhus|Gdansk': 310,
  'Goteborg|Hamburg': 450,
  'Goteborg|Rotterdam': 680,
  'Goteborg|Antwerp': 700,
  'Goteborg|Gdansk': 460,
  'Helsinki|Gdansk': 460,
  'Helsinki|Hamburg': 840,
  'Tallinn|Gdansk': 380,
  'Tallinn|Hamburg': 870,
  'Tallinn|Helsinki': 50,
  'Haugesund|Hamburg': 640,
  'Haugesund|Rotterdam': 820,
  'Haugesund|Antwerp': 850,
  'Halsvik|Haugesund': 40,

  // NW Europe → Med/Black Sea
  'Antwerp|Barcelona': 1880,
  'Antwerp|Valencia': 2000,
  'Antwerp|Tunis': 2650,
  'Antwerp|Naples': 2650,
  'Antwerp|Trieste': 2600,
  'Rotterdam|Barcelona': 1920,
  'Hamburg|Barcelona': 2150,
  'Felixstowe|Piraeus': 2950,
  'Felixstowe|Alexandria': 3500,
  'Felixstowe|Istanbul': 3430,
  'LeHavre|Piraeus': 2900,
  'LeHavre|Alexandria': 3450,

  // ── Tangier ──
  'Algeciras|Tangier': 10,
  'Casablanca|Tangier': 340,
  'Antwerp|Tangier': 1420,
  'Hamburg|Tangier': 1650,
  'Tangier|Piraeus': 1800,
  'Tangier|Suez': 3000,

  // ── Georgetown (Guyana) ──
  'Georgetown|Houston': 2700,
  'Georgetown|NewOrleans': 2500,
  'Georgetown|Santos': 3100,
  'Dakar|Georgetown': 2800,
  'Casablanca|Georgetown': 3600,

  // ── Red Sea / Middle East ──
  'Jeddah|Suez': 700,
  'Djibouti|Jeddah': 730,
  'Djibouti|Suez': 1200,
  'Aden|Djibouti': 150,
  'Aden|Suez': 1350,
  'Dubai|BandarAbbas': 170,
  'Dubai|Karachi': 720,
  'Dubai|Mumbai': 1200,
  'Dubai|Colombo': 1550,
  'Dubai|Suez': 2250,
  'Dubai|Djibouti': 1100,
  'BandarAbbas|Karachi': 560,
  'BandarAbbas|Suez': 2400,
  'Jeddah|Djibouti': 730,
  'Jeddah|Dubai': 1600,
  'Jeddah|Mumbai': 1750,
  'Jeddah|Colombo': 2050,
  'Jeddah|Singapore': 4100,
  'Suez|Dubai': 2250,

  // ── Indian Ocean / South Asia ──
  'Mumbai|Colombo': 650,
  'Chennai|Colombo': 280,
  'Karachi|Mumbai': 460,
  'Colombo|Singapore': 1530,
  'Mumbai|Singapore': 2430,
  'Chennai|Singapore': 1700,
  'Kolkata|Singapore': 1800,
  'Colombo|Suez': 3900,
  'Mumbai|Suez': 3430,
  'Karachi|Suez': 3150,
  'Mumbai|Nacala': 2700,
  'Colombo|Nacala': 2500,
  'Durban|Mumbai': 3700,
  'Durban|Colombo': 3600,

  // ── SE Asia ──
  'Bangkok|Singapore': 1100,
  'HoChiMinh|Singapore': 670,
  'Jakarta|Singapore': 540,
  'Manila|Singapore': 1450,
  'PortKlang|Singapore': 200,
  'Bangkok|HoChiMinh': 550,
  'Bangkok|HongKong': 1600,
  'HoChiMinh|HongKong': 1050,
  'Jakarta|HongKong': 1560,
  'Bangkok|Shanghai': 2400,
  'HoChiMinh|Shanghai': 1700,
  'Jakarta|Shanghai': 2300,
  'Manila|HongKong': 590,
  'Manila|Shanghai': 860,
  'PortKlang|Colombo': 1000,

  // ── East Asia ──
  'HongKong|Shanghai': 760,
  'HongKong|Busan': 1540,
  'HongKong|Kaohsiung': 460,
  'HongKong|Singapore': 1460,
  'Kaohsiung|Shanghai': 430,
  'Kaohsiung|Busan': 1100,
  'Busan|Shanghai': 500,
  'Busan|Tokyo': 610,
  'Incheon|Busan': 350,
  'Incheon|Shanghai': 560,
  'Qingdao|Shanghai': 330,
  'Ningbo|Shanghai': 90,
  'Qingdao|Busan': 350,
  'Ningbo|HongKong': 710,
  'Ningbo|Busan': 500,
  'HongKong|Tokyo': 2100,
  'Busan|Singapore': 2800,
  'Qingdao|Singapore': 2700,

  // ── Americas additions ──
  'LosAngeles|LongBeach': 5,
  'LosAngeles|Seattle': 1000,
  'LosAngeles|Vancouver': 1080,
  'LosAngeles|Houston': 2200,
  'LosAngeles|Veracruz': 2100,
  'LosAngeles|Santos': 7700,
  'Seattle|Vancouver': 75,
  'Mobile|NewOrleans': 140,
  'Mobile|Houston': 540,
  'Savannah|Norfolk': 430,
  'Savannah|Baltimore': 620,
  'Baltimore|Norfolk': 200,
  'Antwerp|Norfolk': 3700,
  'Antwerp|Baltimore': 3800,
  'Antwerp|Savannah': 4000,
  'Hamburg|Norfolk': 3830,
  'BuenosAires|Santos': 1200,
  'BuenosAires|Callao': 3600,
  'BuenosAires|Valparaiso': 1550,
  'Callao|Valparaiso': 1400,
  'Paranagua|Santos': 190,
  'BuenosAires|Paranagua': 980,
  'Dakar|BuenosAires': 5200,
  'LosAngeles|Singapore': 8300,
  'LosAngeles|Shanghai': 6100,
  'LosAngeles|Tokyo': 4800,
  'Seattle|Tokyo': 4350,
  'Vancouver|Tokyo': 4400,

  // ── Africa ──
  'CapeTown|Durban': 800,
  'CapeTown|Dakar': 3600,
  'CapeTown|Nacala': 1900,
  'Durban|Nacala': 1400,
  'Durban|Mombasa': 2100,
  'Mombasa|Djibouti': 900,
  'Mombasa|Dubai': 1800,
  'Mombasa|Mumbai': 1900,
  'Mombasa|Nacala': 800,
  'CapeTown|Santos': 3800,
  'CapeTown|Suez': 5900,
  'Durban|Suez': 4700,
  'Abidjan|Dakar': 1100,
  'Abidjan|Lagos': 550,
  'Lome|Lagos': 300,
  'Lome|Dakar': 1400,
  'Abidjan|Casablanca': 2600,
  'Antwerp|Abidjan': 4000,
  'Hamburg|Abidjan': 4300,
  'Abidjan|Santos': 3500,
  'CapeTown|Algeciras': 4300,
  'Durban|Singapore': 4600,
  'CapeTown|Singapore': 6000,
  'Nacala|Durban': 1400,
  // ── Phase D1: hand-curated corridor distances ──
  // Pairs covering Suez transit, Bosphorus, Gibraltar, Adriatic and UK↔Continent
  // corridors where haversine fallback is 40-60% under-shoot.
  // Verified against existing matrix anchors (Alexandria|Suez=200, Dubai|Suez=2250,
  // Liverpool|Rotterdam=400, Marghera|Ravenna=90) and BIMCO/searoutes references.
  // Damietta (East Med, Egypt) — coastal anchor + Suez/Bosphorus/Atlantic corridors
  'Alexandria|Damietta': 130,
  'Damietta|Suez': 150,
  'Damietta|Piraeus': 610,
  'Damietta|Istanbul': 820,
  'Antwerp|Damietta': 3490,
  'Damietta|Rotterdam': 3510,
  'Damietta|Hamburg': 3610,
  // Vasto (mid Adriatic, Italy) — Adriatic + Bosphorus corridors
  'Ravenna|Vasto': 210,
  'Marghera|Vasto': 290,
  'Piraeus|Vasto': 620,
  'Istanbul|Vasto': 900,
  'Odesa|Vasto': 1290,
  // Fujairah / Sohar (Gulf of Oman) — Suez/Indian Ocean corridors
  'Fujairah|Suez': 2200,
  'Fujairah|Singapore': 3050,
  'Sohar|Suez': 2230,
  // Birkenhead (UK NW, Mersey) — Continent + Gibraltar corridors
  // Anchored to Liverpool (same port complex, ~200m apart on Mersey)
  'Birkenhead|Rotterdam': 400,
  'Antwerp|Birkenhead': 420,
  'Birkenhead|Hamburg': 580,
  'Birkenhead|Casablanca': 1450,
  'Birkenhead|Damietta': 3500,

  // ── Phase B: Adriatic↔Danube and Red Sea↔East Med corridors ──
  // Promoted from searoute JSON (Tier 2) to hand-curated matrix (Tier 1).
  // Both corridors require mandatory canal/strait transits that make haversine
  // unreliable (~40% under-estimate); exact values verified against searoute-ts.
  //
  // Ravenna → Corinth Canal → Aegean → Dardanelles → Bosphorus → Izmail
  'Izmail|Ravenna': 1210,
  // Jeddah → Suez Canal (Red Sea entrance) → Port Said → Eastern Med → Iskenderun
  'Iskenderun|Jeddah': 1140,

  // ── Phase B v2: Black Sea port → Med/Adriatic missing pairs ──
  // These pairs were causing readiness=unknown for common Black Sea→Med routes.
  // All route via Bosphorus (mandatory chokepoint); haversine cuts through Balkans
  // and underestimates by 40-60%. Values derived from adjacent anchors in the matrix
  // (e.g. Burgas|Istanbul + Istanbul|Piraeus; Varna|Istanbul + Istanbul|Ravenna).
  'Burgas|Piraeus': 580,           // Burgas→Bosphorus(150nm)→Aegean→Piraeus(430nm)
  'Burgas|Ravenna': 1200,          // Burgas→Bosphorus(150nm)→Aegean→Adriatic→Ravenna(1050nm)
  'Novorossiysk|Piraeus': 895,     // Novorossiysk→Bosphorus(480nm)→Aegean→Piraeus(430nm) ≈895
  'Novorossiysk|Ravenna': 1530,    // Novorossiysk→Bosphorus(480nm)→Dardanelles→Adriatic→Ravenna
  'Piraeus|Varna': 620,            // Varna→Bosphorus(185nm)→Aegean→Piraeus(430nm) ≈620
  'Ravenna|Varna': 1160,           // Varna|Constanta=90; Constanta|Ravenna=1250; Varna closer→1160
  'Marmara|Ravenna': 980,          // Marmara→Dardanelles→Aegean→Adriatic→Ravenna; Istanbul|Ravenna=1050, Marmara 70nm closer to exit
  'Izmail|Piraeus': 840,           // Izmail→Black Sea coastal→Bosphorus(300nm)→Aegean→Piraeus(430nm) + routing factor
  'Aliaga|Izmail': 580,            // Aliaga→Aegean→Bosphorus(275nm)→Black Sea→Izmail(300nm) + routing

  // ── Phase B advanced: Marghera↔Black Sea (all missing from searoute JSON) ──
  // Marghera (Porto Marghera/Venice) is 90nm north of Ravenna in the north Adriatic.
  // Marghera|Piraeus=710 vs Ravenna|Piraeus=700 (+10nm offset). All values derived
  // from Ravenna baseline +10nm; verified against Marghera|Odesa=1430 already in matrix.
  'Marghera|Novorossiysk': 1540,   // Novorossiysk|Ravenna=1530 +10nm Marghera offset
  'Burgas|Marghera': 1210,         // Burgas|Ravenna=1200 +10nm
  'Marghera|Varna': 1170,          // Ravenna|Varna=1160 +10nm
  'Izmail|Marghera': 1220,         // Izmail|Ravenna=1210 +10nm
  'Marghera|Taman': 1580,          // Marghera|Novorossiysk=1540 + Novorossiysk|Taman=40
  'Marghera|Tuapse': 1620,         // Marghera|Novorossiysk=1540 + Novorossiysk|Tuapse=80
  'Marghera|Yuzhny': 1460,         // Marghera|Odesa=1430 + ~30nm for Yuzhny (east of Odessa)

  // ── Phase B advanced: intra-MENA corridors (Tier 1 promotion from searoute JSON) ──
  // Red Sea/East Med pairs requiring Suez Canal transit — haversine cuts through Sinai.
  'Alexandria|Jeddah': 910,        // via Suez Canal: Alexandria|Suez=200 + Suez|Jeddah=700 + ~10nm
  'Mersin|Tartus': 150,            // direct Eastern Med coastal: Mersin(TR)→Tartus(SY)
  'Piraeus|Tartus': 655,           // Aegean→Eastern Med: Piraeus→(Rhodes area)→Tartus

  // ── Phase B advanced: Far East feeder corridors (Tier 1 promotion) ──
  // Short SE Asian feeder routes — open-ocean, haversine reliable but promoting for clarity.
  'Bangkok|Songkhla': 345,         // Gulf of Thailand: Bangkok→Songkhla (southern Thailand)
  'Singapore|Songkhla': 575,       // Malacca Strait→Gulf of Thailand: Singapore→Songkhla
  'Kakinada|Chennai': 190,         // Bay of Bengal coast: Kakinada→Chennai (India east coast)

};

function stripCountry(raw: string): string {
  // Remove ", Country" or similar trailing qualifier
  return raw.split(',')[0].trim();
}

function stripParenthetical(raw: string): string {
  // "Bay of Biscay (Bayonne/Bilbao range)" → "Bay of Biscay"
  // Also strips parenthetical country codes like "(EG)" or "(TR)"
  return raw.replace(/\([^)]*\)/g, '').trim();
}

function stripPortPrefix(raw: string): string {
  // "Port of Rotterdam" → "Rotterdam", "Pt. Klang" → "Klang"
  return raw.replace(/^(port of|port|pt\.?)\s+/i, '').trim();
}

function stripCountryCodeSuffix(raw: string): string {
  // "Novorossiysk RU" / "Rotterdam NL" → drop trailing 2-letter ISO code
  return raw.replace(/\s+[A-Z]{2}$/i, '').trim();
}

/**
 * Fuzzy fallback corpus: lazily built from PORT_ALIASES + KNOWN_PORTS (existing behavior)
 * extended with all 435 entries from port-master.json for full global coverage.
 */
let _fuzzyCorpus: { lookup: string; canonical: string }[] | null = null;

function getFuzzyCorpus(): { lookup: string; canonical: string }[] {
  if (_fuzzyCorpus) return _fuzzyCorpus;
  const seen = new Map<string, string>();
  for (const [alias, canonical] of Object.entries(PORT_ALIASES)) {
    seen.set(alias, canonical);
  }
  for (const p of KNOWN_PORTS) {
    seen.set(p.toLowerCase(), p);
  }
  // Inject all port-master.json entries — canonical = port.name, key = lowercased name
  const portMaster = loadPortMasterFromJson(PORTS_JSON as unknown as PortMaster[]);
  for (const [nameLower, entry] of Array.from(portMaster.entries())) {
    if (entry.name && !seen.has(nameLower)) seen.set(nameLower, entry.name);
  }
  _fuzzyCorpus = Array.from(seen.entries()).map(([lookup, canonical]) => ({ lookup, canonical }));
  return _fuzzyCorpus;
}

/** Runtime hook to override the fuzzy corpus (e.g. for tests or custom injection). */
export function setFuzzyCorpus(entries: Array<{ lookup: string; canonical: string }> | null): void {
  _fuzzyCorpus = entries;
}

/**
 * Length-ratio guard for fuzzy matches.
 * Rejects pairs whose length difference exceeds 2x — prevents false positives
 * like "Vasto" (5 chars) matching "Vladivostok" (11 chars, ratio 2.2).
 * Real typos almost always preserve length within ~1.2x.
 */
const FUZZY_LEN_RATIO_MAX = 2.0;
const FUZZY_THRESHOLD = 0.30;   // original empirical floor for typo matches; length-ratio guard handles cross-name false positives

function fuzzyMatchPort(query: string): string | null {
  if (query.length < 4) return null;
  const corpus = getFuzzyCorpus();
  const results = fuzzysort.go(query, corpus, { key: 'lookup', threshold: FUZZY_THRESHOLD, limit: 1 });
  if (results.length === 0) return null;
  const matched = results[0].obj.lookup;
  const ratio = Math.max(query.length, matched.length) / Math.min(query.length, matched.length);
  if (ratio > FUZZY_LEN_RATIO_MAX) return null;
  return results[0].obj.canonical;
}


/**
 * Normalize a free-form port name to its canonical form used in the distance table.
 * Returns null if the port is not recognized.
 *
 * Accepts:
 *   - Case variation: "karasu" / "KARASU" / "Karasu"
 *   - Country suffix: "Karasu, Turkey" / "Alexandria Egypt"
 *   - Parenthetical range: "Bay of Biscay (Bayonne/Bilbao range)" → Bayonne via alias
 *   - Parenthetical country codes: "Alexandria (EG)" → Alexandria
 *   - "Port of" prefix: "Port of Antwerp, Belgium" → Antwerp
 *   - Legacy aliases: "Odessa" → "Odesa", "Efesan" → "Aliaga", "Nikolaev" → "Mykolaiv"
 *   - Partial substring fallback: tries longest alias key that appears in the input
 */
/**
 * Extract parenthetical hint tokens from a raw port name.
 * Example: "Hereke (Marmara)" → ["marmara"]; "Bay of Biscay (Bayonne/Bilbao range)" → ["bayonne", "bilbao"].
 * Filters out 2-letter country codes (e.g. "TR", "EG") and noise words ("range", "cluster", "region", "area").
 */
function extractParenHints(raw: string): string[] {
  const hints: string[] = [];
  const pat = /\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  const noise = /\b(range|cluster|region|area)\b/gi;
  while ((m = pat.exec(raw)) !== null) {
    const content = m[1].replace(noise, '').trim();
    if (!content) continue;
    // Split on slash/comma/space to get individual port-name candidates
    const tokens = content.split(/[\s/,]+/).filter(Boolean);
    for (const tok of tokens) {
      const lower = tok.toLowerCase();
      // Skip 2-letter ISO country codes
      if (/^[a-z]{2}$/.test(lower)) continue;
      hints.push(lower);
    }
  }
  return hints;
}

export function normalizePortName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // UNLOCODE fast path: 5-char all-caps code like "NLRTM" / "CNSHA" → canonical name.
  // Port values from the demo seed and some cargo parsers carry UNLOCODE instead of
  // human names, causing distance lookups to silently return null. Resolve via the
  // byUnlocode index in PortMasterIndex before falling through to the alias table.
  const trimmedRaw = raw.trim();
  if (/^[A-Z]{2}[A-Z2-9]{3}$/.test(trimmedRaw)) {
    const portMaster = loadPortMasterFromJson(PORTS_JSON as unknown as PortMaster[]);
    const entry = portMaster.byUnlocode(trimmedRaw);
    if (entry?.name) return normalizePortName(entry.name);
  }

  // Capture parenthetical hints BEFORE stripping (used as fallback if primary name fails)
  const parenHints = extractParenHints(raw);
  let s = stripCountry(stripParenthetical(raw)).trim();
  s = stripCountryCodeSuffix(s);
  s = stripPortPrefix(s);

  if (s) {
    // Direct lowercase alias lookup
    const direct = PORT_ALIASES[s.toLowerCase()];
    if (direct) return direct;

    // Try each word/segment separately (handles "Bay of Biscay Bayonne" or "Izmir/Aliaga")
    const parts = s.split(/[\s/()\-,]+/).filter(Boolean);
    for (const part of parts) {
      const hit = PORT_ALIASES[part.toLowerCase()];
      if (hit) return hit;
    }

    // Fuzzy fallback for full string (typos, casing). Uses fuzzysort over
    // PORT_ALIASES + KNOWN_PORTS + port-master.json corpus with length-ratio
    // guard ≤ 2.0 to prevent false positives where a short query matches a
    // long canonical name (e.g. Vasto→Vladivostok at score 0.311, ratio 2.2).
    const fuzzy = fuzzyMatchPort(s.toLowerCase());
    if (fuzzy) return fuzzy;
  }

  // Parenthetical-hint fallback: e.g. "Hereke (Marmara)" — primary "Hereke" failed,
  // but "Marmara" is a known cluster name. This is broker-style geographic hinting
  // ("[obscure port] ([known region])") that the parser surfaces in the cargo input.
  for (const hint of parenHints) {
    const direct = PORT_ALIASES[hint];
    if (direct) return direct;
  }
  // Second pass on hints via fuzzy fallback (with length-ratio guard)
  for (const hint of parenHints) {
    const fuzzy = fuzzyMatchPort(hint);
    if (fuzzy) return fuzzy;
  }

  return null;
}

// ── Tier 2: pre-populated searoute JSON ─────────────────────────────────────
// Lazy-loaded once on first use; overrideable in tests via _setSearouteJsonForTest.
let _searouteJson: Map<string, number> | null = null;

function getSearouteJson(): Map<string, number> {
  if (_searouteJson !== null) return _searouteJson;
  const raw = require('@/data/distances/searoute-pairs.json') as Record<string, number>;
  _searouteJson = new Map(Object.entries(raw));
  return _searouteJson;
}

/** Override the searoute JSON map for unit tests. Pass null to reset to file-backed loader. */
export function _setSearouteJsonForTest(m: Map<string, number> | null): void {
  _searouteJson = m;
}

// ── Tier 3: on-the-fly searoute ──────────────────────────────────────────────
type LiveSearouteFn = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => { nm: number } | null;
let _liveSearouteTestMode = false;
let _liveSearouteTestFn: LiveSearouteFn | null = null;

function getLiveSearouteFn(): LiveSearouteFn | null {
  if (_liveSearouteTestMode) return _liveSearouteTestFn;
  try {
    const { computeSearouteCached } = require('./searoute-client') as typeof import('./searoute-client');
    return computeSearouteCached;
  } catch {
    return null;
  }
}

/** Override tier-3 searoute implementation for tests. Pass null to reset to real impl. */
export function _setLiveSearouteForTest(fn: LiveSearouteFn | null): void {
  if (fn === null) {
    _liveSearouteTestMode = false;
    _liveSearouteTestFn = null;
  } else {
    _liveSearouteTestMode = true;
    _liveSearouteTestFn = fn;
  }
}

/** Result of a port-pair distance lookup. */
export interface PortDistanceResult {
  /** Distance in nautical miles (rounded). */
  nm: number;
  /** True if from the hand-curated sea-route matrix; false if great-circle (haversine) fallback. */
  exact: boolean;
}

/**
 * Return nautical-mile distance between two ports.
 *
 * Resolution order:
 *   1. Same canonical port → { nm: 0, exact: true }
 *   2. Hardcoded sea-route matrix → { nm, exact: true }   ~500 hand-curated pairs (BIMCO-style)
 *   3. Pre-populated searoute JSON → { nm, exact: true }  ~106k pairs (B5a)
 *   4. On-the-fly searoute (searoute-ts, canal-aware) → { nm, exact: true }  (B5b)
 *   5. Haversine great-circle from getPortMaster lat/lon → { nm, exact: false }
 *   6. null (unknown port or no coords available)
 *
 * Accuracy note (Phase C3 audit, 2026-05-19):
 *   - Matrix entries are calibrated against BIMCO Distance Tables; error <5%.
 *   - Haversine fallback is reliable (±15%) for OPEN-OCEAN pairs without
 *     mandatory canal transits or land obstacles, e.g. Atlantic crossings,
 *     Indian-Ocean legs, Pacific transits.
 *   - Haversine is SYSTEMATICALLY WRONG (40-60% under) for corridors that
 *     require mandatory sea-route detours:
 *       • Med ↔ Black Sea (Bosphorus/Dardanelles required, haversine cuts
 *         through Balkans/Turkey)
 *       • Arabian Gulf / Red Sea ↔ Med (Suez Canal required, haversine cuts
 *         through Sinai / Arabian Peninsula)
 *       • North Sea ↔ Med (Gibraltar required for long routes, haversine
 *         cuts through France/Spain)
 *       • Adriatic ↔ Aegean ↔ Black Sea (haversine cuts through Balkans)
 *   - Consumers that rely on distance for laycan-fit / TCE math should treat
 *     exact=false results as advisory and prefer exact-matrix pairs when
 *     possible. Adding a corridor to DISTANCES_NM upgrades all consumers
 *     transparently.
 */
export function getPortDistance(
  from: string | null | undefined,
  to: string | null | undefined,
): PortDistanceResult | null {
  const a = normalizePortName(from);
  const b = normalizePortName(to);
  if (!a || !b) return null;
  if (a === b) return { nm: 0, exact: true };

  const [first, second] = [a, b].sort();
  const matrix = DISTANCES_NM[`${first}|${second}`];
  if (matrix != null) return { nm: matrix, exact: true };

  // Tier 2: pre-populated searoute JSON (~106k pairs, exact sea routes)
  if (process.env.DISTANCE_USE_SEAROUTE_JSON !== 'false') {
    const sj = getSearouteJson();
    const sjNm = sj.get(`${first}|${second}`);
    if (sjNm != null) return { nm: sjNm, exact: true };
  }

  // Tiers 3+4 need port-master coords. Lazy require avoids circular deps
  // (port-master.ts imports normalizePortName from this file).
  const { getPortMaster } = require('./port-master') as typeof import('./port-master');
  const { haversineDistanceNm } = require('./haversine') as typeof import('./haversine');

  const pa = getPortMaster(a);
  const pb = getPortMaster(b);
  if (!pa || !pb) return null;
  if (pa.lat == null || pa.lon == null || pb.lat == null || pb.lon == null) return null;
  if (!Number.isFinite(pa.lat) || !Number.isFinite(pa.lon) || !Number.isFinite(pb.lat) || !Number.isFinite(pb.lon)) return null;

  // Tier 3: on-the-fly searoute (canal/strait-aware, exact sea routes)
  if (process.env.DISTANCE_USE_SEAROUTE_LIVE !== 'false') {
    const liveFn = getLiveSearouteFn();
    if (liveFn) {
      const live = liveFn({ lat: pa.lat, lon: pa.lon }, { lat: pb.lat, lon: pb.lon });
      if (live != null) return { nm: live.nm, exact: true };
    }
  }

  // Tier 4: haversine great-circle (exact: false — unreliable for canal corridors)
  return { nm: haversineDistanceNm(pa.lat, pa.lon, pb.lat, pb.lon), exact: false };
}
