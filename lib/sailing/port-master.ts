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
 *
 * Schema (v2, Wave 4): extended with UN/LOCODE, coordinates, and optional
 * LLM-derived fields (maxLOA, cargoBerthTypes, tidal, icePort, dataConfidence,
 * sourceNote) to support global port coverage via scripts/generate-port-master.ts.
 */

import { normalizePortName } from './port-distances';

export interface PortMaster {
  /** UN/LOCODE (5 uppercase chars, e.g. "NLRTM"). */
  unlocode: string;
  /** Canonical English name (e.g. "Rotterdam"). */
  name: string;
  /** ISO-3166 alpha-2 country code (e.g. "NL"). */
  country: string;
  /** Latitude (WGS84 decimal degrees, positive = N). */
  lat: number;
  /** Longitude (WGS84 decimal degrees, positive = E). */
  lon: number;
  /** Max permissible vessel draft in metres (salt water, summer). */
  maxDraftM: number;
  /** True if port has shore cranes (so gearless vessels can load/discharge). */
  hasShoreCranes: boolean;
  /** Primary berth infrastructure type (for stowage planning). */
  berthType: 'river' | 'deep-sea' | 'bay' | 'terminal';
  /** Short human-readable note. */
  note?: string;
  /** Max LOA in metres (LLM-derived for new ports, optional). */
  maxLOA?: number;
  /** Cargo types the port equipment can handle (LLM-derived, optional). */
  cargoBerthTypes?: Array<'bulk' | 'container' | 'general' | 'RORO' | 'tanker'>;
  /** Tidal port (affects ETA buffer, LLM-derived, optional). */
  tidal?: boolean;
  /** Ice-bound in winter (Baltic/Arctic, LLM-derived, optional). */
  icePort?: boolean;
  /** Confidence of LLM-derived data (new ports only, optional). */
  dataConfidence?: 'high' | 'medium' | 'low';
  /** Source for LLM-derived data (authority name or handbook reference). */
  sourceNote?: string;
}

/**
 * Hardcoded port master for the 15 demo-scope ports (Wave 1-3 legacy).
 * Draft values are "safe" working draft, typically dredged depth minus UKC
 * (under-keel clearance, usually 1-1.5m). UN/LOCODEs + coordinates added
 * in Wave 4 ahead of the JSON-backed refactor.
 */
const PORT_MASTER: Record<string, PortMaster> = {
  // ── Black Sea ──
  Karasu: {
    unlocode: 'TRKRS', name: 'Karasu', country: 'TR', lat: 41.113, lon: 30.683,
    maxDraftM: 11.0, hasShoreCranes: true, berthType: 'deep-sea',
    note: 'Turkish Black Sea port, steel/grain',
  },
  Istanbul: {
    unlocode: 'TRIST', name: 'Istanbul', country: 'TR', lat: 41.008, lon: 28.978,
    maxDraftM: 13.0, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Mykolaiv: {
    unlocode: 'UANLK', name: 'Mykolaiv', country: 'UA', lat: 46.950, lon: 31.992,
    maxDraftM: 10.5, hasShoreCranes: true, berthType: 'river',
    note: 'Buh river, pilotage required',
  },
  Odesa: {
    unlocode: 'UAODS', name: 'Odesa', country: 'UA', lat: 46.485, lon: 30.742,
    maxDraftM: 13.0, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Constanta: {
    unlocode: 'ROCND', name: 'Constanta', country: 'RO', lat: 44.183, lon: 28.650,
    maxDraftM: 14.5, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Varna: {
    unlocode: 'BGVAR', name: 'Varna', country: 'BG', lat: 43.204, lon: 27.914,
    maxDraftM: 11.5, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Burgas: {
    unlocode: 'BGBOJ', name: 'Burgas', country: 'BG', lat: 42.495, lon: 27.473,
    maxDraftM: 12.5, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Novorossiysk: {
    unlocode: 'RUNVS', name: 'Novorossiysk', country: 'RU', lat: 44.723, lon: 37.767,
    maxDraftM: 14.0, hasShoreCranes: true, berthType: 'deep-sea',
  },
  // ── Aegean / Eastern Med ──
  Piraeus: {
    unlocode: 'GRPIR', name: 'Piraeus', country: 'GR', lat: 37.942, lon: 23.642,
    maxDraftM: 17.0, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Aliaga: {
    unlocode: 'TRALI', name: 'Aliaga', country: 'TR', lat: 38.800, lon: 26.970,
    maxDraftM: 14.0, hasShoreCranes: true, berthType: 'terminal',
    note: 'Aliaga bay incl. Efesan',
  },
  // ── Mediterranean ──
  Alexandria: {
    unlocode: 'EGALY', name: 'Alexandria', country: 'EG', lat: 31.200, lon: 29.870,
    maxDraftM: 12.5, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Ravenna: {
    unlocode: 'ITRAN', name: 'Ravenna', country: 'IT', lat: 44.485, lon: 12.284,
    maxDraftM: 10.5, hasShoreCranes: true, berthType: 'deep-sea',
    note: 'Adriatic, channel-access',
  },
  Skikda: {
    unlocode: 'DZSKI', name: 'Skikda', country: 'DZ', lat: 36.876, lon: 6.898,
    maxDraftM: 12.0, hasShoreCranes: false, berthType: 'deep-sea',
    note: 'Mostly oil/LNG, limited dry-bulk cranes',
  },
  // ── Atlantic ──
  Casablanca: {
    unlocode: 'MACAS', name: 'Casablanca', country: 'MA', lat: 33.600, lon: -7.620,
    maxDraftM: 12.0, hasShoreCranes: true, berthType: 'deep-sea',
  },
  Bayonne: {
    unlocode: 'FRBAY', name: 'Bayonne', country: 'FR', lat: 43.523, lon: -1.478,
    maxDraftM: 9.5, hasShoreCranes: true, berthType: 'bay',
    note: 'Bayonne/Bilbao range, tidal',
  },
};

/** Lookup port master data. Returns null for unknown ports (not an error — caller decides). */
export function getPortMaster(rawName: string | null | undefined): PortMaster | null {
  const canonical = normalizePortName(rawName);
  if (!canonical) return null;
  return PORT_MASTER[canonical] ?? null;
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
