/**
 * Voyage basin classification — used by the bunker-recommendation API to filter
 * candidate bunker hubs that are physically not on the route's maritime corridor.
 *
 * Bug 1 motivation: a "Constanta → Liverpool" voyage was including Los Angeles
 * (USLAX) as an on-route candidate because the haversine distance fallback
 * under-estimates the leg by 40–60 % for non-matrix pairs, so the detour
 * check passed it through. Classifying ports by maritime basin and excluding
 * candidates outside the route's basin corridor kills this class of bug at
 * the root.
 *
 * Approach: every port is assigned to one of 11 basins (either by an explicit
 * UNLOCODE override or by a lat/lon bounding box). A voyage's basin corridor
 * is a BFS shortest-path through a basin-adjacency graph. A candidate is
 * "in the corridor" iff its basin appears on that path. Endpoint or candidate
 * with an unknown basin fail open (preserves existing behavior for novel
 * ports).
 */

import PORTS_JSON from '@/data/ports/port-master.json';

export type Basin =
  | 'BlackSea'
  | 'EastMed'
  | 'WestMed'
  | 'AtlanticNorth'
  | 'AtlanticSouth'
  | 'NorthEurope'
  | 'RedSea'
  | 'Gulf'
  | 'IndianOcean'
  | 'EastAsia'
  | 'Pacific'
  | 'SouthAfrica';

interface PortRow {
  unlocode: string;
  name: string;
  lat: number;
  lon: number;
  aliases?: string[];
}

const PORTS = PORTS_JSON as PortRow[];

/** Explicit basin assignments — preferred over lat/lon bbox where ambiguous. */
const BASIN_OVERRIDES: Record<string, Basin> = {
  // BlackSea
  ROCND: 'BlackSea', UAODS: 'BlackSea', UANLK: 'BlackSea', BGVAR: 'BlackSea',
  BGBOJ: 'BlackSea', RUNVS: 'BlackSea', TRKRS: 'BlackSea', UAILK: 'BlackSea',
  UACRN: 'BlackSea', UAIZM: 'BlackSea', UAYUZ: 'BlackSea', RUTUA: 'BlackSea',
  RUTAM: 'BlackSea',

  // EastMed — Aegean, Levant, Suez gateway, Bosphorus/Marmara
  TRIST: 'EastMed', GRPIR: 'EastMed', EGALY: 'EastMed', EGPSD: 'EastMed',
  CYLMS: 'EastMed', TRMER: 'EastMed', SYTTS: 'EastMed', EGDAM: 'EastMed',
  TRISK: 'EastMed', TRALI: 'EastMed', TRIZM: 'EastMed', TRANT: 'EastMed',
  TRMAR: 'EastMed', TRDER: 'EastMed', EGSUZ: 'EastMed',

  // WestMed — Sicily, Maltese channel, Tyrrhenian, Adriatic, Catalan, French Med, Maghreb Med
  GIGIB: 'WestMed', ESALG: 'WestMed', ITAUG: 'WestMed', MTMLA: 'WestMed',
  ESCEU: 'WestMed', ITGOA: 'WestMed', FRMRS: 'WestMed', ESBCN: 'WestMed',
  ITRAV: 'WestMed', ITNAP: 'WestMed', ITLSP: 'WestMed', ITLIV: 'WestMed',
  ITTRS: 'WestMed', ESVLC: 'WestMed', TNTUN: 'WestMed', DZSKI: 'WestMed',
  DZBJA: 'WestMed', ITMGH: 'WestMed', ITVST: 'WestMed', ITTRP: 'WestMed',
  ITPZL: 'WestMed', ITSAV: 'WestMed', ITVDL: 'WestMed',

  // AtlanticNorth — N.America east, Mid-Atlantic, Panama Atlantic side, W.Africa north of equator, Iberian Atlantic
  USHOU: 'AtlanticNorth', USNYC: 'AtlanticNorth', ESLPA: 'AtlanticNorth',
  USVER: 'AtlanticNorth', USNEW: 'AtlanticNorth', USMOB: 'AtlanticNorth',
  USBAL: 'AtlanticNorth', USSAV: 'AtlanticNorth', USORF: 'AtlanticNorth',
  PABLB: 'AtlanticNorth', SNDKR: 'AtlanticNorth', MACAS: 'AtlanticNorth',
  MATAN: 'AtlanticNorth', GYGEO: 'AtlanticNorth', FRBAY: 'AtlanticNorth',
  // AtlanticSouth — S.America east, W.Africa south of equator
  BRSSZ: 'AtlanticSouth', ARBUE: 'AtlanticSouth', BRPNG: 'AtlanticSouth',
  NGLAG: 'AtlanticSouth', CIABJ: 'AtlanticSouth', TGLFW: 'AtlanticSouth',

  // NorthEurope — ARA range, UK, Baltic
  NLRTM: 'NorthEurope', BEANR: 'NorthEurope', DEHAM: 'NorthEurope',
  GBLIV: 'NorthEurope', GBSOU: 'NorthEurope', FRLEH: 'NorthEurope',
  GBFXT: 'NorthEurope', FRDKK: 'NorthEurope', BEZEE: 'NorthEurope',
  DEBRE: 'NorthEurope', PLGDN: 'NorthEurope', NOHAU: 'NorthEurope',
  NOHSV: 'NorthEurope', DKAAR: 'NorthEurope', SEGOT: 'NorthEurope',
  FIHEL: 'NorthEurope', EETLL: 'NorthEurope', GBBKH: 'NorthEurope',
  IEGRN: 'NorthEurope', PTFDF: 'NorthEurope',

  // RedSea
  SAJED: 'RedSea', SDPZU: 'RedSea', YEHOD: 'RedSea', DJJIB: 'RedSea',
  YEADE: 'RedSea',

  // Gulf — Persian Gulf + Gulf of Oman
  AEFJR: 'Gulf', AEDXB: 'Gulf', IRBND: 'Gulf', OMSOH: 'Gulf',

  // IndianOcean
  INBOM: 'IndianOcean', INCCU: 'IndianOcean', INMAA: 'IndianOcean',
  LKCMB: 'IndianOcean', PKKHI: 'IndianOcean', INKAK: 'IndianOcean',
  KEMBA: 'IndianOcean',

  // EastAsia
  SGSIN: 'EastAsia', CNZOS: 'EastAsia', HKHKG: 'EastAsia', KRPUS: 'EastAsia',
  CNSHA: 'EastAsia', TWKHH: 'EastAsia', VNSGN: 'EastAsia', PHMNL: 'EastAsia',
  IDJKT: 'EastAsia', MYPKG: 'EastAsia', THBKK: 'EastAsia', CNQIN: 'EastAsia',
  CNNGB: 'EastAsia', JPTYO: 'EastAsia', KRINC: 'EastAsia', THSGZ: 'EastAsia',

  // Pacific — N.America west, S.America west
  USLAX: 'Pacific', USLGB: 'Pacific', USSEA: 'Pacific', CAVAN: 'Pacific',
  CLVAP: 'Pacific', PECLL: 'Pacific',

  // SouthAfrica
  ZADUR: 'SouthAfrica', ZACPT: 'SouthAfrica', MZNAC: 'SouthAfrica',
};

/**
 * Adjacency graph for basin connectivity. Edges represent direct maritime
 * connection (no land barrier between them, ignoring polar passages).
 *
 * Notable choices:
 * - BlackSea ↔ EastMed only — Bosphorus is the only outlet.
 * - EastMed ↔ WestMed — both halves of the Mediterranean, connected via the Strait of Sicily.
 * - EastMed ↔ RedSea — Suez Canal.
 * - WestMed ↔ Atlantic — Strait of Gibraltar.
 * - Atlantic ↔ Pacific — Panama Canal.
 * - EastAsia ↔ Pacific — direct (Trans-Pacific routes).
 * - Atlantic ↔ NorthEurope — Iberian to ARA range.
 * - SouthAfrica is the hinge between Atlantic and IndianOcean (Cape of Good Hope).
 */
const ADJACENCY: Record<Basin, Basin[]> = {
  BlackSea:      ['EastMed'],
  EastMed:       ['BlackSea', 'WestMed', 'RedSea'],
  WestMed:       ['EastMed', 'AtlanticNorth'],
  AtlanticNorth: ['WestMed', 'NorthEurope', 'AtlanticSouth', 'Pacific'],
  AtlanticSouth: ['AtlanticNorth', 'SouthAfrica'],
  NorthEurope:   ['AtlanticNorth'],
  RedSea:        ['EastMed', 'IndianOcean'],
  IndianOcean:   ['RedSea', 'Gulf', 'EastAsia', 'SouthAfrica'],
  Gulf:          ['IndianOcean'],
  EastAsia:      ['IndianOcean', 'Pacific'],
  Pacific:       ['EastAsia', 'AtlanticNorth'],
  SouthAfrica:   ['AtlanticSouth', 'IndianOcean'],
};

/** Lat/lon bounding boxes — used only when no override exists. Order matters:
 *  first hit wins, so narrower regions appear before broader ones. */
const BASIN_BBOX: Array<{ basin: Basin; lat: [number, number]; lon: [number, number] }> = [
  // BlackSea — Bosphorus/Sea of Azov enclosed water
  { basin: 'BlackSea',    lat: [40.5, 47.5], lon: [27.5, 42] },
  // RedSea — narrow strip between Africa & Arabia
  { basin: 'RedSea',      lat: [12, 31],     lon: [32, 44] },
  // Gulf — Persian Gulf + Gulf of Oman
  { basin: 'Gulf',        lat: [22, 30],     lon: [48, 58] },
  // EastMed — Aegean to Levant, Suez approaches
  { basin: 'EastMed',     lat: [30, 41.5],   lon: [18, 36.5] },
  // WestMed — Tyrrhenian/Adriatic/Catalan
  { basin: 'WestMed',     lat: [30, 45.5],   lon: [-6, 18] },
  // NorthEurope — ARA + UK + Baltic
  { basin: 'NorthEurope', lat: [48, 70],     lon: [-12, 32] },
  // IndianOcean — bay of Bengal, Arabian Sea, southern IO
  { basin: 'IndianOcean', lat: [-35, 22],    lon: [35, 100] },
  // EastAsia — China Sea, Japan Sea, Malacca Strait
  { basin: 'EastAsia',    lat: [-10, 45],    lon: [100, 150] },
  // SouthAfrica — sub-equatorial east African coast
  { basin: 'SouthAfrica',   lat: [-35, -10],   lon: [10, 41] },
  // Pacific — W.coast of Americas
  { basin: 'Pacific',       lat: [-55, 65],    lon: [-180, -100] },
  // AtlanticSouth — S.America east coast, W.Africa south of equator
  { basin: 'AtlanticSouth', lat: [-55, 0],     lon: [-65, 15] },
  // AtlanticNorth — N.America east, Mid-Atlantic, W.Africa north of equator, Iberian Atlantic
  { basin: 'AtlanticNorth', lat: [0, 65],      lon: [-95, -6] },
];

let _portByLocode: Map<string, PortRow> | null = null;
let _portByName: Map<string, PortRow> | null = null;

function getLocodeIndex(): Map<string, PortRow> {
  if (_portByLocode) return _portByLocode;
  const m = new Map<string, PortRow>();
  for (const p of PORTS) {
    if (p.unlocode) m.set(p.unlocode.toUpperCase(), p);
  }
  _portByLocode = m;
  return m;
}

function getNameIndex(): Map<string, PortRow> {
  if (_portByName) return _portByName;
  const m = new Map<string, PortRow>();
  for (const p of PORTS) {
    if (p.name) m.set(p.name.toLowerCase(), p);
    if (Array.isArray(p.aliases)) {
      for (const a of p.aliases) m.set(a.toLowerCase(), p);
    }
  }
  _portByName = m;
  return m;
}

function resolvePort(ref: string): PortRow | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  const byLocode = getLocodeIndex().get(upper);
  if (byLocode) return byLocode;
  const lower = trimmed.toLowerCase();
  return getNameIndex().get(lower) ?? null;
}

function basinFromCoords(lat: number, lon: number): Basin | null {
  for (const b of BASIN_BBOX) {
    if (lat >= b.lat[0] && lat <= b.lat[1] && lon >= b.lon[0] && lon <= b.lon[1]) {
      return b.basin;
    }
  }
  return null;
}

export function portBasin(portRef: string): Basin | null {
  const port = resolvePort(portRef);
  if (!port) return null;
  const override = BASIN_OVERRIDES[port.unlocode.toUpperCase()];
  if (override) return override;
  if (typeof port.lat === 'number' && typeof port.lon === 'number') {
    return basinFromCoords(port.lat, port.lon);
  }
  return null;
}

/** BFS shortest basin path from `start` to `end`, inclusive. Empty if unreachable. */
function shortestBasinPath(start: Basin, end: Basin): Basin[] {
  if (start === end) return [start];
  const visited = new Set<Basin>([start]);
  const queue: Array<{ basin: Basin; path: Basin[] }> = [{ basin: start, path: [start] }];
  while (queue.length > 0) {
    const { basin, path } = queue.shift()!;
    for (const next of ADJACENCY[basin] ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      const newPath = [...path, next];
      if (next === end) return newPath;
      queue.push({ basin: next, path: newPath });
    }
  }
  return [];
}

/**
 * Returns the set of basins the voyage's natural shortest corridor passes
 * through, inclusive of both endpoints.
 *
 * - Both endpoints classifiable → BFS shortest path (original behaviour).
 * - One endpoint unknown → conservative corridor: known basin + its 1-hop
 *   neighbours. Prevents global hubs (Pacific, EastAsia, AtlanticSouth …)
 *   from passing through when the unknown endpoint also has no route distance
 *   (distanceNm null), which would otherwise bypass the detour check too.
 * - Both endpoints unknown → empty set (callers treat as fail-open).
 */
export function voyageBasins(from: string, to: string): Set<Basin> {
  const fromBasin = portBasin(from);
  const toBasin = portBasin(to);
  if (!fromBasin && !toBasin) return new Set();
  if (fromBasin && toBasin) {
    const path = shortestBasinPath(fromBasin, toBasin);
    return new Set(path);
  }
  // One endpoint known — use its basin + direct neighbours as a conservative
  // corridor. This is intentionally narrow: it excludes basins that are
  // reachable but require crossing open ocean (e.g. Pacific from BlackSea).
  const known = fromBasin ?? toBasin!;
  return new Set([known, ...ADJACENCY[known]]);
}

/**
 * True if `candidateLocode` is plausibly on-route for a voyage `from → to`.
 *
 * - If candidate's basin is in the voyage's basin corridor → true.
 * - If either endpoint is unclassifiable → true (fail-open).
 * - If candidate is unclassifiable → false (conservative; unknown candidates
 *   are not silently included).
 */
export function isCandidateInVoyageBasins(
  candidateLocode: string,
  from: string,
  to: string,
): boolean {
  const corridor = voyageBasins(from, to);
  if (corridor.size === 0) return true;
  const candidateBasin = portBasin(candidateLocode);
  if (!candidateBasin) return false;
  return corridor.has(candidateBasin);
}
