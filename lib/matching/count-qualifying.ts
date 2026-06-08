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

/** Count qualifying matches for a user: deduped, fit_percent >= fitFloor, null excluded. */
export function countQualifyingMatches(
  db: Database.Database,
  opts: CountQualifyingOpts,
): number {
  const floor = opts.fitFloor ?? 60;
  const raw = listMatches(db, { ...opts, sortBy: 'fit_percent', sortDir: 'desc' });
  const deduped = dedupMatches(raw);
  return deduped.filter((m) => m.fit_percent != null && m.fit_percent >= floor).length;
}
