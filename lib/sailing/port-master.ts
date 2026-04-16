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

export interface PortMaster {
  /** Max permissible vessel draft in metres (salt water, summer). */
  maxDraftM: number;
  /** True if port has shore cranes (so gearless vessels can load/discharge). */
  hasShoreCranes: boolean;
  /** Primary berth type (for stowage planning). */
  berthType: 'river' | 'deep-sea' | 'bay' | 'terminal';
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
  'Constanta':    { maxDraftM: 14.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Varna':        { maxDraftM: 11.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Burgas':       { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Novorossiysk': { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  // ── Aegean / Eastern Med ──
  'Piraeus':      { maxDraftM: 17.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Aliaga':       { maxDraftM: 14.0, hasShoreCranes: true,  berthType: 'terminal', note: 'Aliaga bay incl. Efesan' },
  // ── Mediterranean ──
  'Alexandria':   { maxDraftM: 12.5, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Ravenna':      { maxDraftM: 10.5, hasShoreCranes: true,  berthType: 'deep-sea', note: 'Adriatic, channel-access' },
  'Skikda':       { maxDraftM: 12.0, hasShoreCranes: false, berthType: 'deep-sea', note: 'Mostly oil/LNG, limited dry-bulk cranes' },
  // ── Atlantic ──
  'Casablanca':   { maxDraftM: 12.0, hasShoreCranes: true,  berthType: 'deep-sea' },
  'Bayonne':      { maxDraftM: 9.5,  hasShoreCranes: true,  berthType: 'bay',      note: 'Bayonne/Bilbao range, tidal' },
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
