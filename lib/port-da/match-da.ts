import type Database from 'better-sqlite3';
import { getPortDa } from './repository';
import { resolvePort } from '@/lib/ports/resolve';
import { resolveVaguePort } from '@/lib/ports/resolve-vague';
import type { PortDaBreakdown } from './types';

/** Confidence ordering for min-aggregation: lower index = lower confidence */
const CONFIDENCE_ORDER: PortDaBreakdown['confidence'][] = ['low', 'estimated', 'verified'];

function minConfidence(
  a: PortDaBreakdown['confidence'],
  b: PortDaBreakdown['confidence'],
): PortDaBreakdown['confidence'] {
  return CONFIDENCE_ORDER.indexOf(a) <= CONFIDENCE_ORDER.indexOf(b) ? a : b;
}

export interface PortDaSumResult {
  totalUsd: number;
  /** Minimum confidence across all resolved ports. 'verified' when no ports resolved. */
  confidence: PortDaBreakdown['confidence'];
}

/**
 * Sum port disbursement (fixed) cost across a set of match-path port NAMES.
 * Returns {totalUsd, confidence} — W6a surfaces the confidence via DataQualityBadge.
 *
 * Mirrors the detail-page resolveDaUsd (app/api/voyage/tce/route.ts) so the
 * match-LIST TCE and the voyage detail page agree: both sum getPortDa().totalFixedUsd
 * (port dues + pilotage + tugs) for the load and discharge ports, and both treat a
 * missing/unresolvable port as a 0 contribution rather than crashing or inventing a number.
 *
 * Port infrastructure costs (dues, pilotage, tugs) are cargo-agnostic — the same
 * pilot and tug service is rendered regardless of whether the vessel carries bulk,
 * general cargo, or containers.  The seed data is 'general'-only, so passing the
 * cargo-specific type (e.g. 'bulk') was silently returning 0 rows and dropping DA
 * from the list TCE entirely.  We always resolve against the 'general' tariff row
 * (getPortDa default), matching exactly what resolveDaUsd in the detail route does
 * (it passes cargoType from the optional request field, which is absent in the
 * standard TCE call-path and therefore also falls through to 'general').
 *
 * @param portNames  free-text port names (load, discharge); null/empty entries skipped
 * @param vesselDwt  vessel DWT for the DA band lookup
 * @param _cargoType unused — kept in the signature for call-site compatibility;
 *                   DA lookup is always cargo-agnostic ('general' default)
 * @param db         match-path db handle (port_da_estimates lives in demo-seed.db)
 */
export function sumMatchPortDaUsd(
  portNames: Array<string | null | undefined>,
  vesselDwt: number,
  _cargoType: string | null | undefined,
  db: Database.Database,
): PortDaSumResult {
  let total = 0;
  let confidence: PortDaBreakdown['confidence'] = 'verified';
  let anyResolved = false;
  // Pre-resolve each name (no context) so a sibling can act as the homonym
  // counterpart — a bare "Cartagena" then resolves to the basin of the other leg.
  const rawResolved = portNames.map((n) => (n ? resolvePort(n) : null));
  for (let i = 0; i < portNames.length; i++) {
    const name = portNames[i];
    if (!name) continue;
    try {
      const counterpart = rawResolved.find((r, j) => j !== i && r) ?? null;
      // Exact match first; fall back to vague-descriptor resolution (ARA, "European
      // Continent", etc.) exactly as resolvePortOrPassthrough does in the detail route,
      // so the LIST path no longer silently drops discharge DA for range descriptors.
      const resolved = resolvePort(name, { counterpart }) ?? resolveVaguePort(name);
      if (!resolved) continue;
      // Pass cargoType=undefined → getPortDa resolves to 'general' (the only seed
      // cargo type).  This mirrors resolveDaUsd in the detail route and guarantees
      // list DA == detail DA for the same (port, dwt) pair.
      const da = getPortDa({ port: resolved, vesselDwt }, db);
      if (da) {
        total += da.totalFixedUsd;
        confidence = anyResolved ? minConfidence(confidence, da.confidence) : da.confidence;
        anyResolved = true;
      }
    } catch {
      // Unresolvable port / lookup failure → 0 contribution (matches detail page).
    }
  }
  return { totalUsd: total, confidence: anyResolved ? confidence : 'verified' };
}
