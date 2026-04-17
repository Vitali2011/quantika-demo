/**
 * UN/LOCODE CSV parser — extracts {unlocode, name, country, lat, lon} from
 * UNECE's code list format.
 *
 * Format reference: https://unece.org/trade/cefact/unlocode-code-list
 *
 * CSV columns (12): Change, Country, Location, Name, NameWoDiacritics,
 * Subdivision, Status, Function, Date, IATA, Coordinates, Remarks
 *
 * "Function" is an 8-char bitmap. Position 1 (0-indexed: byte 1) is the
 * seaport flag — "1" means it's a seaport. Positions may contain digits or "-".
 *
 * "Status" filters: we accept AA (Approved) and AI (Approved, Information
 * request). Rejected: QQ/XX/RR/RL/RN/RB (provisional, deleted, renamed).
 *
 * "Coordinates" format: "DDMM[N|S] DDDMM[E|W]". Some entries are empty — we
 * skip those since we need lat/lon for haversine distance fallback.
 */

export interface ParsedCoords {
  lat: number;
  lon: number;
}

export interface ParsedUnlocodeRow {
  unlocode: string;        // 5-char: country + location (e.g. "NLRTM")
  country: string;         // ISO-2
  name: string;            // canonical name from "Name" column
  lat: number | null;      // null when CSV "Coordinates" cell is empty
  lon: number | null;
  subdivision?: string;    // e.g. "ZH" for Zuid-Holland
  function: string;        // 8-char bitmap
}

/**
 * Status codes we accept (all "Approved" variants by different national bodies).
 * Deliberately excludes RL/RN/RR/RB (renamed/restored) and XX/QQ (to-remove)
 * since those are deprecated or in-flux — we'd rather skip and patch via the
 * curated target list than emit a soon-to-be-invalid UNLOCODE.
 *
 * Reference: https://service.unece.org/trade/locode/Service/LocodeColumn.htm
 */
const ACCEPTED_STATUS = new Set([
  'AA', // Approved
  'AC', // Approved (by competent national body)
  'AF', // Approved (by national facilitation body)
  'AI', // Approved (by competent authority)
  'AM', // Approved (by other means)
  'AQ', // Entry approved, function unknown
  'AS', // Approved (by national standardization body)
  'RQ', // Entry reserved (qualifier)
  // RL/RN/RR are "renamed" entries — UN/LOCODE flags them as deprecated but
  // the underlying port is operational and the code is still in commercial
  // use (Port Klang MYPKG, Tanjung Priok IDTPP, Hazira INHZR, Ajman AEAJM
  // are all currently-active major ports flagged RL because their reference
  // changed at some past revision). We accept these. Skip XX/QQ which are
  // scheduled for removal.
  'RL', // Renamed
  'RN', // New name approved
  'RR', // Restored / reactivated
]);

/** Round to 3 decimals (cleaner output, avoids floating-point noise). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Parse a UN/LOCODE coordinate string like "5155N 00429E" → {lat, lon}.
 * Returns null on any malformed/empty input.
 */
export function parseUnlocodeCoords(raw: string | null | undefined): ParsedCoords | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // Pattern: DDMM[NS] DDDMM[EW]
  const m = s.match(/^(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})([EW])$/);
  if (!m) return null;

  const [, latDegStr, latMinStr, latHem, lonDegStr, lonMinStr, lonHem] = m;
  const latDeg = Number(latDegStr);
  const latMin = Number(latMinStr);
  const lonDeg = Number(lonDegStr);
  const lonMin = Number(lonMinStr);

  if (latDeg > 90 || latMin >= 60) return null;
  if (lonDeg > 180 || lonMin >= 60) return null;

  let lat = latDeg + latMin / 60;
  let lon = lonDeg + lonMin / 60;
  if (latHem === 'S') lat = -lat;
  if (lonHem === 'W') lon = -lon;

  return { lat: round3(lat), lon: round3(lon) };
}

/**
 * Minimal CSV line splitter — handles quoted fields with embedded commas.
 * Assumes UN/LOCODE CSV format (no escaped quotes, no multi-line values).
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * Parse a single UN/LOCODE CSV row. Returns null if:
 *   - row is not a seaport (Function byte 1 != "1")
 *   - status is not AA/AI
 *   - coordinates are missing/invalid
 *   - location code is empty (country header row)
 */
export function parseUnlocodeRow(line: string): ParsedUnlocodeRow | null {
  const fields = parseCsvLine(line);
  if (fields.length < 11) return null;

  // UN/LOCODE CSV field order (confirmed from 2024-2 CodeList):
  // 0:Change 1:Country 2:Location 3:Name 4:NameWoDiacritics 5:Subdivision
  // 6:Function 7:Status 8:Date 9:IATA 10:Coordinates 11:Remarks
  const country = fields[1]?.trim();
  const location = fields[2]?.trim();
  const name = fields[3]?.trim();
  const subdivision = fields[5]?.trim();
  const funcStr = fields[6]?.trim();
  const status = fields[7]?.trim();
  const coordsStr = fields[10]?.trim();

  if (!country || !location || !name) return null;
  if (!ACCEPTED_STATUS.has(status)) return null;
  if (!funcStr || funcStr.length < 1) return null;

  // Function is 8-char bitmap. Leftmost position (index 0) is "seaport" —
  // "1" if the location is a seaport, "-" otherwise. Other positions encode
  // rail/road/airport/etc with matching digit markers.
  if (funcStr[0] !== '1') return null;

  // UN/LOCODE often omits coordinates for major ports (Felixstowe, Algeciras,
  // Bremen, etc.). We accept these rows — coords are filled later from the
  // curated target list or LLM enrichment.
  const coords = parseUnlocodeCoords(coordsStr);

  return {
    unlocode: (country + location).toUpperCase(),
    country: country.toUpperCase(),
    name,
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    subdivision: subdivision || undefined,
    function: funcStr,
  };
}
