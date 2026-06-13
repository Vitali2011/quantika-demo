/**
 * Server-only: resolve live port-master draft limits for stored matches.
 *
 * Why this exists: `getPortMaster` statically imports `data/ports/port-master.json`
 * (~225 KB, 483 ports). Calling it from a "use client" component (MatchesClient)
 * dragged that whole JSON into the /matches browser bundle (qa-956, ~80-100 KB gzip).
 * Resolving the two numbers we actually need (load/discharge max draft) here — on the
 * server — keeps the port corpus out of the client bundle. The numbers are attached as
 * plain fields and threaded to DraftCalcBreakdown via props.
 *
 * MUST only be imported from server files (RSC pages, route handlers). Never from a
 * "use client" module — that would re-introduce the bundle bloat this file removes.
 */
import { getPortMaster } from '@/lib/sailing/port-master';

/** Fields appended to each row by {@link attachPortLimits}. */
export interface PortLimitFields {
  /** Live port-master max draft (m) for the worksheet load port, or null when unknown. */
  load_port_limit_m: number | null;
  /** Live port-master max draft (m) for the worksheet discharge port, or null when unknown. */
  discharge_port_limit_m: number | null;
}

/**
 * Attach `load_port_limit_m` / `discharge_port_limit_m` to each row, resolved from the
 * row's worksheet ports via `getPortMaster`. Ports are read from `worksheet_json`
 * (`cargo.loadPort` / `cargo.dischargePort`) — the exact source the client used before —
 * so the rendered "(live ref.)" annotation is byte-for-byte identical, just computed
 * server-side. Missing/unparseable worksheet or unknown port → null (display-only;
 * DraftCalcBreakdown falls back to "limit unknown").
 */
export function attachPortLimits<T extends { worksheet_json?: string | null }>(
  rows: T[],
): (T & PortLimitFields)[] {
  return rows.map((row) => {
    let loadPort: string | null = null;
    let dischargePort: string | null = null;
    if (row.worksheet_json) {
      try {
        const ws = JSON.parse(row.worksheet_json) as { cargo?: { loadPort?: string | null; dischargePort?: string | null } };
        loadPort = ws?.cargo?.loadPort ?? null;
        dischargePort = ws?.cargo?.dischargePort ?? null;
      } catch {
        // Malformed worksheet → leave both null (same as a missing worksheet).
      }
    }
    return {
      ...row,
      load_port_limit_m: loadPort ? (getPortMaster(loadPort)?.maxDraftM ?? null) : null,
      discharge_port_limit_m: dischargePort ? (getPortMaster(dischargePort)?.maxDraftM ?? null) : null,
    };
  });
}
