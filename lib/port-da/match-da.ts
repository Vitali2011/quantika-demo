import type Database from 'better-sqlite3';
import { getPortDa } from './repository';
import { resolvePort } from '@/lib/ports/resolve';

/**
 * Sum port disbursement (fixed) cost across a set of match-path port NAMES.
 *
 * Mirrors the detail-page resolveDaUsd (app/api/voyage/tce/route.ts) so the
 * match-LIST TCE and the voyage detail page agree: both sum getPortDa().totalFixedUsd
 * (port dues + pilotage + tugs) for the load and discharge ports, and both treat a
 * missing/unresolvable port as a 0 contribution rather than crashing or inventing a number.
 *
 * @param portNames  free-text port names (load, discharge); null/empty entries skipped
 * @param vesselDwt  vessel DWT for the DA band lookup
 * @param cargoType  free-text cargo class; getPortDa maps unknown → 'general'
 * @param db         match-path db handle (port_da_estimates lives in demo-seed.db)
 */
export function sumMatchPortDaUsd(
  portNames: Array<string | null | undefined>,
  vesselDwt: number,
  cargoType: string | null | undefined,
  db: Database.Database,
): number {
  let total = 0;
  for (const name of portNames) {
    if (!name) continue;
    try {
      const resolved = resolvePort(name);
      if (!resolved) continue;
      const da = getPortDa(
        { port: resolved, vesselDwt, cargoType: cargoType?.toLowerCase() },
        db,
      );
      if (da) total += da.totalFixedUsd;
    } catch {
      // Unresolvable port / lookup failure → 0 contribution (matches detail page).
    }
  }
  return total;
}
