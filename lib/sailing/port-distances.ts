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

/** Canonical port names used as map keys. */
export const KNOWN_PORTS = [
  // Black Sea
  'Karasu', 'Istanbul', 'Mykolaiv', 'Odesa', 'Chornomorsk', 'Constanta', 'Varna', 'Burgas', 'Novorossiysk',
  'Taman', 'Tuapse', 'Izmail',
  // Aegean / Eastern Med
  'Piraeus', 'Aliaga', 'Marmara', 'Antalya', 'Mersin', 'Iskenderun',
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
  'derince': 'Marmara',         // Derince/Izmit is Sea of Marmara
  'izmit': 'Marmara',
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

  // ── Eastern Med additions (Antalya, Mersin, Iskenderun) ──
  'Antalya|Istanbul': 450,
  'Antalya|Piraeus': 380,
  'Antalya|Alexandria': 650,
  'Aliaga|Antalya': 280,
  'Marmara|Antalya': 400,
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
  'Durban|CapeTown': 800,
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

/**
 * Approximate port coordinates (lat/lon) for haversine fallback.
 * Used when a port pair is not in the static DISTANCES_NM table.
 * Values are representative anchors for the port / port complex.
 */
const PORT_COORDS: Record<KnownPort, { lat: number; lon: number }> = {
  // Black Sea
  Karasu:        { lat: 41.12, lon: 30.68 },
  Istanbul:      { lat: 41.01, lon: 28.98 },
  Mykolaiv:      { lat: 46.97, lon: 31.99 },
  Odesa:         { lat: 46.49, lon: 30.74 },
  Chornomorsk:   { lat: 46.30, lon: 30.66 },
  Constanta:     { lat: 44.18, lon: 28.65 },
  Varna:         { lat: 43.20, lon: 27.92 },
  Burgas:        { lat: 42.49, lon: 27.47 },
  Novorossiysk:  { lat: 44.72, lon: 37.77 },
  Taman:         { lat: 45.22, lon: 36.72 },
  Tuapse:        { lat: 44.10, lon: 39.08 },
  Izmail:        { lat: 45.35, lon: 28.84 },  // Danube delta port
  // Aegean / Eastern Med
  Piraeus:       { lat: 37.94, lon: 23.62 },
  Aliaga:        { lat: 38.80, lon: 26.97 },
  Marmara:       { lat: 40.62, lon: 27.59 },
  Antalya:       { lat: 36.84, lon: 30.56 },
  Mersin:        { lat: 36.81, lon: 34.63 },
  Iskenderun:    { lat: 36.58, lon: 36.17 },
  Izmir:         { lat: 38.43, lon: 27.15 },
  // Eastern Med / Suez
  Alexandria:    { lat: 31.20, lon: 29.89 },
  Suez:          { lat: 29.97, lon: 32.55 },
  // Central / Western Med
  Ravenna:       { lat: 44.42, lon: 12.20 },
  Marghera:      { lat: 45.45, lon: 12.23 },
  Skikda:        { lat: 36.88, lon: 6.90  },
  Casablanca:    { lat: 33.60, lon: -7.62 },
  Genoa:         { lat: 44.41, lon: 8.93  },
  LaSpezia:      { lat: 44.10, lon: 9.83  },
  Livorno:       { lat: 43.55, lon: 10.31 },
  Naples:        { lat: 40.84, lon: 14.25 },
  Trieste:       { lat: 45.65, lon: 13.77 },
  Barcelona:     { lat: 41.35, lon: 2.18  },
  Valencia:      { lat: 39.46, lon: -0.32 },
  Algeciras:     { lat: 36.13, lon: -5.46 },
  Marseille:     { lat: 43.31, lon: 5.36  },
  Tunis:         { lat: 36.81, lon: 10.18 },
  // Northern Europe
  Antwerp:       { lat: 51.23, lon: 4.40  },
  Hamburg:       { lat: 53.55, lon: 9.99  },
  Rotterdam:     { lat: 51.90, lon: 4.48  },
  Bremen:        { lat: 53.07, lon: 8.80  },
  Halsvik:       { lat: 59.76, lon: 5.44  },
  Gdansk:        { lat: 54.35, lon: 18.65 },
  Felixstowe:    { lat: 51.96, lon: 1.35  },
  Southampton:   { lat: 50.90, lon: -1.40 },
  Liverpool:     { lat: 53.40, lon: -3.00 },
  LeHavre:       { lat: 49.49, lon: 0.10  },
  Dunkirk:       { lat: 51.03, lon: 2.37  },
  Zeebrugge:     { lat: 51.33, lon: 3.20  },
  Aarhus:        { lat: 56.16, lon: 10.22 },
  Goteborg:      { lat: 57.69, lon: 11.86 },
  Helsinki:      { lat: 60.15, lon: 24.96 },
  Tallinn:       { lat: 59.44, lon: 24.75 },
  Haugesund:     { lat: 59.41, lon: 5.27  },
  // Atlantic
  Bayonne:       { lat: 43.49, lon: -1.47 },
  Dakar:         { lat: 14.69, lon: -17.44 },
  Lagos:         { lat: 6.45,  lon: 3.40  },
  Nacala:        { lat: -14.54, lon: 40.67 },
  Georgetown:    { lat: 6.80,  lon: -58.17 },  // Guyana
  Tangier:       { lat: 35.77, lon: -5.81 },
  // Americas
  Veracruz:      { lat: 19.20, lon: -96.13 },
  NewOrleans:    { lat: 29.95, lon: -90.07 },
  Houston:       { lat: 29.75, lon: -95.27 },
  Santos:        { lat: -23.95, lon: -46.33 },
  LosAngeles:    { lat: 33.73, lon: -118.26 },
  LongBeach:     { lat: 33.75, lon: -118.19 },
  Seattle:       { lat: 47.60, lon: -122.33 },
  Vancouver:     { lat: 49.29, lon: -123.12 },
  Mobile:        { lat: 30.69, lon: -88.05 },
  Savannah:      { lat: 32.08, lon: -81.08 },
  Baltimore:     { lat: 39.27, lon: -76.58 },
  Norfolk:       { lat: 36.90, lon: -76.30 },
  BuenosAires:   { lat: -34.60, lon: -58.37 },
  Paranagua:     { lat: -25.52, lon: -48.53 },
  Callao:        { lat: -12.05, lon: -77.15 },
  Valparaiso:    { lat: -33.04, lon: -71.63 },
  // Red Sea / Middle East
  Jeddah:        { lat: 21.54, lon: 39.17 },
  Djibouti:      { lat: 11.60, lon: 43.15 },
  Aden:          { lat: 12.78, lon: 45.01 },
  Dubai:         { lat: 25.01, lon: 55.06 },
  BandarAbbas:   { lat: 27.18, lon: 56.28 },
  // Indian Ocean / South Asia
  Mumbai:        { lat: 18.94, lon: 72.84 },
  Chennai:       { lat: 13.10, lon: 80.30 },
  Kolkata:       { lat: 22.55, lon: 88.31 },
  Colombo:       { lat: 6.95,  lon: 79.84 },
  Karachi:       { lat: 24.83, lon: 66.99 },
  // SE Asia
  PortKlang:     { lat: 3.00,  lon: 101.40 },
  Jakarta:       { lat: -6.11, lon: 106.88 },
  Manila:        { lat: 14.60, lon: 120.97 },
  HoChiMinh:     { lat: 10.77, lon: 106.80 },
  Bangkok:       { lat: 13.08, lon: 100.88 },
  // East Asia
  HongKong:      { lat: 22.33, lon: 114.13 },
  Kaohsiung:     { lat: 22.55, lon: 120.32 },
  Busan:         { lat: 35.10, lon: 129.04 },
  Incheon:       { lat: 37.46, lon: 126.60 },
  Qingdao:       { lat: 36.08, lon: 120.38 },
  Ningbo:        { lat: 29.87, lon: 121.54 },
  // Asia
  Singapore:     { lat: 1.26,  lon: 103.82 },
  Tokyo:         { lat: 35.45, lon: 139.77 },
  Shanghai:      { lat: 31.23, lon: 121.47 },
  // Africa
  Durban:        { lat: -29.87, lon: 31.03 },
  CapeTown:      { lat: -33.91, lon: 18.44 },
  Mombasa:       { lat: -4.04,  lon: 39.67 },
  Abidjan:       { lat: 5.31,  lon: -4.02 },
  Lome:          { lat: 6.13,  lon: 1.29  },
};

/**
 * Haversine great-circle distance in nautical miles between two lat/lon points.
 */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const EARTH_RADIUS_NM = 3440.065;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

/** Sea-route multiplier: real ship routes average ~25% longer than great-circle. */
const SEA_ROUTE_MULTIPLIER = 1.25;

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
  // "Port of Antwerp" → "Antwerp", "Port Hamburg" → "Hamburg"
  return raw.replace(/^port\s+of\s+/i, '').replace(/^port\s+/i, '').trim();
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
export function normalizePortName(raw: string | null | undefined): KnownPort | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = stripPortPrefix(stripCountry(stripParenthetical(raw))).trim();
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

  // Partial substring fallback: find the longest alias key that appears in the input
  const lc = s.toLowerCase();
  let bestKey = '';
  let bestPort: KnownPort | null = null;
  for (const [key, port] of Object.entries(PORT_ALIASES)) {
    if (lc.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestPort = port;
    }
  }
  if (bestPort) return bestPort;

  return null;
}

/**
 * Return nautical-mile distance between two ports, or null if either is unknown.
 *
 * Resolution order:
 *   1. Static DISTANCES_NM table (human-curated, accounts for real sea routing).
 *   2. Haversine great-circle × SEA_ROUTE_MULTIPLIER (1.25) using PORT_COORDS.
 *   3. null — if coordinates are missing for either port.
 */
export function getPortDistance(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = normalizePortName(from);
  const b = normalizePortName(to);
  if (!a || !b) return null;
  if (a === b) return 0;

  // 1. Prefer static table (human-curated, accounts for real routing)
  const [first, second] = [a, b].sort();
  const key = `${first}|${second}`;
  const staticDist = DISTANCES_NM[key];
  if (staticDist != null) return staticDist;

  // 2. Fall back to haversine × 1.25 using coordinates
  const coordsA = PORT_COORDS[a];
  const coordsB = PORT_COORDS[b];
  if (!coordsA || !coordsB) return null;
  const greatCircle = haversineNm(coordsA.lat, coordsA.lon, coordsB.lat, coordsB.lon);
  return Math.round(greatCircle * SEA_ROUTE_MULTIPLIER);
}
