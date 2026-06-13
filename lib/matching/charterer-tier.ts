import type Database from 'better-sqlite3';
import type { ParsedCargo } from '@/lib/types';
import { listCharterers } from '@/lib/market/charterers-repository';

export type ChartererTier = 'blue-chip' | 'second' | 'weak';

/** Lowercase, collapse all non-alphanumerics to single spaces, trim. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Resolve a cargo's charterer credit tier from the charterers table by
 * normalized-name lookup on `cargo.chartererName` (audit A.1).
 *
 * @returns the tier, or null when no charterer can be resolved.
 */
export function resolveChartererTier(db: Database.Database, cargo: ParsedCargo): ChartererTier | null {
  const raw = cargo.chartererName;
  if (!raw || typeof raw !== 'string') return null;
  const needle = normalizeName(raw);
  if (!needle) return null;
  for (const row of listCharterers(db)) {
    if (normalizeName(row.name) === needle) return row.tier;
  }
  return null;
}
