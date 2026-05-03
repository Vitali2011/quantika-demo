/**
 * Input Contract:
 *   portCode   — truthy string; empty string → null
 *   vesselDwt  — finite, positive number; NaN / ±Infinity / ≤0 → null
 *   cargoType  — optional; unknown value falls back to 'general'
 *
 * BC note: getPortDa also accepts { port: ResolvedPort, vesselDwt, cargoType? }
 * in addition to the legacy { portCode: string, ... } form.
 */
import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import type { PortDaQuery, PortDaBreakdown } from './types';
import type { ResolvedPort } from '@/lib/ports/resolve';

/** Extended query type: accepts either a raw portCode string or a ResolvedPort object. */
type PortDaQueryExtended =
  | PortDaQuery
  | { port: ResolvedPort; vesselDwt: number; cargoType?: string };

const VALID_CARGO_TYPES = new Set(['general', 'bulk', 'container', 'tanker']);

/** Confidence ordering: higher index = higher priority */
const CONFIDENCE_RANK: Record<string, number> = {
  low: 0,
  estimated: 1,
  verified: 2,
};

type PortDaRow = {
  port_code: string;
  vessel_dwt_min: number;
  vessel_dwt_max: number;
  port_dues_usd: number;
  pilotage_usd: number;
  tugs_usd: number;
  stevedoring_usd_per_mt: number;
  cargo_type: string;
  confidence: string;
  source: string;
};

function rowToBreakdown(row: PortDaRow, vesselDwt: number): PortDaBreakdown {
  return {
    portCode: row.port_code,
    vesselDwt,
    portDuesUsd: row.port_dues_usd,
    pilotageUsd: row.pilotage_usd,
    tugsUsd: row.tugs_usd,
    stevedoringUsdPerMt: row.stevedoring_usd_per_mt,
    totalFixedUsd: row.port_dues_usd + row.pilotage_usd + row.tugs_usd,
    confidence: row.confidence as PortDaBreakdown['confidence'],
    source: row.source,
  };
}

export function getPortDa(
  q: PortDaQueryExtended,
  db?: Database.Database,
): PortDaBreakdown | null {
  // Normalize: extract portCode from either ResolvedPort form or raw portCode string
  const portCode = 'port' in q ? q.port.portCode : q.portCode;
  const { vesselDwt, cargoType } = q;

  if (!portCode) return null;
  if (!Number.isFinite(vesselDwt) || vesselDwt <= 0) return null;

  const resolvedCargoType = cargoType && VALID_CARGO_TYPES.has(cargoType)
    ? cargoType
    : 'general';

  const database = db ?? getStore().getDatabase();

  const rows = database.prepare<[string, number, number, string], PortDaRow>(`
    SELECT port_code, vessel_dwt_min, vessel_dwt_max,
           port_dues_usd, pilotage_usd, tugs_usd,
           stevedoring_usd_per_mt, cargo_type, confidence, source
    FROM port_da_estimates
    WHERE port_code = ?
      AND vessel_dwt_min <= ?
      AND vessel_dwt_max >= ?
      AND cargo_type = ?
  `).all(portCode, vesselDwt, vesselDwt, resolvedCargoType);

  if (rows.length === 0) return null;

  // Pick highest confidence; stable sort tie-break by insertion order
  const best = rows.reduce((a, b) =>
    (CONFIDENCE_RANK[b.confidence] ?? -1) > (CONFIDENCE_RANK[a.confidence] ?? -1) ? b : a,
  );

  return rowToBreakdown(best, vesselDwt);
}
