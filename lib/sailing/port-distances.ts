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
  'Taman', 'Tuapse', 'Izmail',
  // Aegean / Eastern Med
  'Piraeus', 'Aliaga', 'Marmara', 'Derince', 'Antalya', 'Mersin', 'Iskenderun',
  // Eastern Med / Suez
  'Alexandria', 'Suez',
  // Central / Western Med
  'Ravenna', 'Marghera', 'Skikda', 'Casablanca',
  'Genoa', 'LaSpezia', 'Livorno', 'Naples', 'Trieste',
  'Barcelona', 'Valencia', 'Algeciras', 'Marseille',
  'Tunis', 'Izmir',
  // Northern Europe
  'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk',
  'Felixstowe', 'Southampton', 'Liverpool', 'LeHavre', 'Dunkirk', 'Zeebrugge',
  'Aarhus', 'Goteborg', 'Helsinki', 'Tallinn',
  'Haugesund',
  // Atlantic
  'Bayonne', 'Dakar', 'Lagos', 'Nacala',
  'Georgetown',
  'Tangier',
  // Americas
  'Veracruz', 'NewOrleans', 'Houston', 'Santos',
  'LosAngeles', 'LongBeach', 'Seattle', 'Vancouver',
  'Mobile', 'Savannah', 'Baltimore', 'Norfolk',
  'BuenosAires', 'Paranagua', 'Callao', 'Valparaiso',
  // Red Sea / Middle East
  'Jeddah', 'Djibouti', 'Aden', 'Dubai', 'BandarAbbas',
  // Indian Ocean / South Asia
  'Mumbai', 'Chennai', 'Kolkata', 'Colombo', 'Karachi',
  // SE Asia
  'PortKlang', 'Jakarta', 'Manila', 'HoChiMinh', 'Bangkok',
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
  'varna': 'Varna',
  'burgas': 'Burgas',
  'bourgas': 'Burgas',
  'novorossiysk': 'Novorossiysk',
  'novorossiisk': 'Novorossiysk',
  'taman': 'Taman',
  'tuapse': 'Tuapse',
  'izmail': 'Izmail',
  'reni': 'Izmail',             // Reni is a nearby Danube port, use Izmail as proxy
  'izmail / reni': 'Izmail',
  'izmayil': 'Izmail',
  // Aegean
  'piraeus': 'Piraeus',
  'pireus': 'Piraeus',
  'aliaga': 'Aliaga',
  'efesan': 'Aliaga',           // Efesan terminal in Aliaga bay
  'izmir': 'Izmir',
  'smyrna': 'Izmir',            // former name
  'marmara': 'Marmara',
  'marmara island': 'Marmara',
  'bandirma': 'Marmara',        // same Sea of Marmara region
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
  'ain sokhna': 'Suez',         // Ain Sokhna is on Suez Gulf, use Suez as proxy
  'sokhna': 'Suez',
  'suez': 'Suez',
  'port suez': 'Suez',
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

  'Constanta|Piraeus': 630,
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
export function normalizePortName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = stripCountry(stripParenthetical(raw)).trim();
  s = stripCountryCodeSuffix(s);
  s = stripPortPrefix(s);
  if (!s) return null;

  // Direct lowercase alias lookup
  const direct = PORT_ALIASES[s.toLowerCase()];
  if (direct) return direct;

  // Try each word/segment separately (handles "Bay of Biscay Bayonne" or "Izmir/Aliaga")
  const parts = s.split(/[\s/()\-,]+/).filter(Boolean);
  for (const part of parts) {
    const hit = PORT_ALIASES[part.toLowerCase()];
    if (hit) return hit;
  }

  // Fuzzy fallback (typos, casing) — uses fuzzysort over alias + canonical
  // names. fuzzysort v3 scores are in [0,1] (not the legacy negative scale).
  // Threshold 0.3 is the empirical floor that catches single-letter typos
  // ("Karsu"→Karasu scores ~0.35) while filtering near-garbage subsequences.
  // Minimum length guard: inputs shorter than 4 chars are too ambiguous for
  // fuzzy matching and are left to the direct alias table above.
  const corpus = getFuzzyCorpus();
  const cleaned = s.toLowerCase();
  if (cleaned.length < 4) return null;
  const results = fuzzysort.go(cleaned, corpus, { key: 'lookup', threshold: 0.3, limit: 1 });
  if (results.length > 0) {
    return results[0].obj.canonical;
  }

  return null;
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
 *   2. Hardcoded sea-route matrix → { nm, exact: true }
 *   3. Haversine great-circle from getPortMaster lat/lon → { nm, exact: false }
 *   4. null (unknown port or no coords available)
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

  // Haversine fallback — needs lat/lon from port-master. Lazy import to avoid
  // a circular dependency between port-master.ts (which imports normalizePortName
  // from us) and this file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPortMaster } = require('./port-master') as typeof import('./port-master');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { haversineDistanceNm } = require('./haversine') as typeof import('./haversine');

  const pa = getPortMaster(a);
  const pb = getPortMaster(b);
  if (!pa || !pb) return null;
  if (pa.lat == null || pa.lon == null || pb.lat == null || pb.lon == null) return null;
  if (!Number.isFinite(pa.lat) || !Number.isFinite(pa.lon) || !Number.isFinite(pb.lat) || !Number.isFinite(pb.lon)) return null;

  return { nm: haversineDistanceNm(pa.lat, pa.lon, pb.lat, pb.lon), exact: false };
}
