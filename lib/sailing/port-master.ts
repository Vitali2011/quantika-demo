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

import PORTS_JSON from '@/data/ports/port-master.json';
import { loadPortMasterFromJson, portLookupKey } from './port-master-loader';
import { PortRegion, getPortRegion } from './port-regions';
import type { KnownPort } from './port-distances';

export type { PortRegion };

export interface PortMaster {
  /** UN/LOCODE (5 uppercase chars, e.g. "NLRTM"). Optional — not available for hardcoded entries. */
  unlocode?: string;
  /** Canonical English name (e.g. "Rotterdam"). Optional — not available for hardcoded entries. */
  name?: string;
  /** ISO-3166 alpha-2 country code (e.g. "NL"). Optional — not available for hardcoded entries. */
  country?: string;
  /** Latitude (WGS84 decimal degrees, positive = N). Optional — not available for hardcoded entries. */
  lat?: number;
  /** Longitude (WGS84 decimal degrees, positive = E). Optional — not available for hardcoded entries. */
  lon?: number;
  /** Max permissible vessel draft in metres (salt water, summer). */
  maxDraftM: number;
  /** True if port has shore cranes (so gearless vessels can load/discharge). */
  hasShoreCranes: boolean;
  /** Primary berth infrastructure type (for stowage planning). */
  berthType: 'river' | 'deep-sea' | 'bay' | 'terminal';
  /** Geographic basin — null for unknown ports. */
  region?: PortRegion;
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
  /** Alternative names / variants used for fuzzy name lookup (e.g. "Antwerpen", "Anvers"). */
  aliases?: string[];
  /** Max crane safe-working-load in tonnes (from World Port Index / NGA Pub 150). */
  craneSWL?: number;
  /** Shore-crane type, when known. */
  craneType?: 'mobile' | 'gantry' | 'floating' | 'STS';
  /** Terminal operator company name (manual curation, top-20 demo ports). */
  terminalOperator?: string;
  /** As-of date for crane/operator data, e.g. "2025-Q4" or "WPI-2025". */
  craneDataAsOf?: string;
}

/** Lookup port master data. Returns null for unknown ports (not an error — caller decides). */
export function getPortMaster(rawName: string | null | undefined): PortMaster | null {
  if (!rawName) return null;
  // Lazy require to avoid circular dep (port-distances imports port-master)
   
  const { normalizePortName } = require('./port-distances') as { normalizePortName: (s: string) => string | null };
  const canonical = normalizePortName(rawName);
  if (!canonical) return null;
  const map = loadPortMasterFromJson(PORTS_JSON as unknown as PortMaster[]);
  const entry = map.get(portLookupKey(canonical)) ?? null;
  if (!entry) return null;
  const region = getPortRegion(canonical as KnownPort) ?? undefined;
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

export interface LOACheckResult {
  ok: boolean;
  portLoaM: number | null;
  reason?: string;
}

/**
 * Check whether a vessel's overall length (LOA) fits a port's berth max LOA.
 * Mirrors {@link portCanHandleDraft}: ok=true on any missing input — a missing
 * data point is never a failure (graceful pass). The Black Sea inner ports
 * (Odesa, Mykolaiv, Kherson, Novorossiysk) currently lack `maxLOA` in
 * port-master.json, so they pass honestly until backfilled.
 */
export function portCanHandleLOA(
  port: string | null | undefined,
  vesselLoaM: number | null | undefined,
): LOACheckResult {
  const master = getPortMaster(port);
  if (!master) return { ok: true, portLoaM: null, reason: 'port unknown — LOA not verified' };
  if (vesselLoaM == null || !Number.isFinite(vesselLoaM) || vesselLoaM <= 0) {
    return { ok: true, portLoaM: master.maxLOA ?? null, reason: 'vessel LOA unknown — not verified' };
  }
  if (master.maxLOA == null) return { ok: true, portLoaM: null, reason: 'port berth max LOA unknown — not verified' };
  if (vesselLoaM > master.maxLOA) {
    return {
      ok: false,
      portLoaM: master.maxLOA,
      reason: `vessel LOA ${vesselLoaM}m exceeds berth max LOA ${master.maxLOA}m${master.name ? ` at ${master.name}` : ''}`,
    };
  }
  return { ok: true, portLoaM: master.maxLOA };
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
