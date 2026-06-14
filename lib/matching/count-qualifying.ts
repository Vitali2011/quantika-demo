import type Database from 'better-sqlite3';
import { listMatches, type ListMatchesOptions, type StoredMatch } from './matches-repository';

function dedupMatches(rows: StoredMatch[]): StoredMatch[] {
  const seen = new Map<string, StoredMatch>();
  for (const r of rows) {
    const k = `${r.vessel_name ?? ''}|${r.cargo_ref ?? r.cargo_id}|${r.load_port ?? ''}|${r.laycan_start ?? ''}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()];
}

export interface CountQualifyingOpts extends Omit<ListMatchesOptions, 'sortBy' | 'sortDir'> {
  /** Minimum fit_percent to qualify. Default 60. null fit_percent always excluded. */
  fitFloor?: number;
}

/**
 * The deduped, qualifying match rows for a user — the single source of truth that
 * BOTH the dashboard "open matches" KPI and the match lists below it must derive
 * from. Rows are deduped by vessel/cargo/port/laycan (same key as the count),
 * filtered to fit_percent >= fitFloor (null excluded), ordered by fit_percent DESC.
 *
 * Using one function for count and lists keeps them in lockstep: a session match
 * that re-patches below 60, or a duplicate row, is dropped from both surfaces
 * identically, so `listQualifyingMatches(...).length === countQualifyingMatches(...)`.
 */
export function listQualifyingMatches(
  db: Database.Database,
  opts: CountQualifyingOpts,
): StoredMatch[] {
  const floor = opts.fitFloor ?? 60;
  const raw = listMatches(db, { ...opts, sortBy: 'fit_percent', sortDir: 'desc' });
  const deduped = dedupMatches(raw);
  return deduped.filter((m) => m.fit_percent != null && m.fit_percent >= floor);
}

/** Count qualifying matches for a user: deduped, fit_percent >= fitFloor, null excluded. */
export function countQualifyingMatches(
  db: Database.Database,
  opts: CountQualifyingOpts,
): number {
  return listQualifyingMatches(db, opts).length;
}
