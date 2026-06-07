import type Database from 'better-sqlite3';
import type { ParsedCargo } from '@/lib/types';
import { getCharterer, listCharterers } from '@/lib/market/charterers-repository';

export type ChartererTier = 'blue-chip' | 'second' | 'weak';

/**
 * Resolve a cargo's charterer credit tier from the charterers table.
 *
 * GAP (2026-06-07): ParsedCargo carries no charterer identity field, and the
 * demo corpus anonymizes charterer names in the email body. Until a
 * `cargo.chartererName` field exists, there is no reliable key → this returns
 * null (→ unknown → neutral fit, no penalty). The scoring path that CONSUMES
 * this value is fully wired + tested (computeFitBreakdown.chartererTier), so
 * activation is a one-line change here once the parser provides the name.
 *
 * @returns the tier, or null when no charterer can be resolved.
 */
export function resolveChartererTier(_db: Database.Database, _cargo: ParsedCargo): ChartererTier | null {
  // TODO(charterer-field): once ParsedCargo gains chartererName, resolve via
  //   getCharterer(db, deterministicId(name)) or a name lookup over
  //   listCharterers(db), and return row.tier. Helpers imported above are the
  //   exact functions to call — kept referenced so this stays a one-line edit.
  void getCharterer; void listCharterers;
  return null;
}
