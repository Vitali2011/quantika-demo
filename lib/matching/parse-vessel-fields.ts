/**
 * Pure parsers for vessel speed/consumption fields — NO server imports.
 *
 * Extracted from tce-calculator.ts (which transitively pulls better-sqlite3 via
 * the canal modules) so client components (e.g. components/match/EconomicsTab.tsx)
 * can reuse the EXACT same parsing without dragging server-only deps into the
 * client bundle. tce-calculator re-exports these for existing server callers.
 */

export const DEFAULT_CONSUMPTION_MT_PER_DAY = 25;

// Parse a leading number from strings like "12.5 knots", "25 mt/day", a raw
// number (LLM-parsed fields can arrive as numbers, not strings), or a
// ConfidenceField object ({ value, confidence, source_text }). Real/demo parsed
// data stores speed/consumption as any of these despite the string typing, so
// tolerate all rather than throw on `.match`.
export function parseLeadingNumber(s: unknown): number {
  if (s == null) return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  if (typeof s === 'object' && 'value' in (s as Record<string, unknown>)) {
    return parseLeadingNumber((s as { value: unknown }).value);
  }
  if (typeof s !== 'string') return 0;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

// Matches an explicit MT/D unit: "3.7MT/D", "14 mt/day", "25 t/day"
const MT_PER_DAY_RE = /(\d+(?:\.\d+)?)\s*(?:MT\/?D|mt\/?day|t\/day)/i;
// Fuel-grade tokens that appear before the actual consumption figure
const FUEL_GRADE_RE = /\b(?:IFO|VLSFO|LSMGO|MGO|HFO|HSFO)\s*\d+(?:\/\d+)?\b|M\/E|A\/E/gi;

/**
 * Parse a fuel-consumption field, skipping fuel-grade tokens like "IFO 180".
 *
 * parseLeadingNumber grabs the first digit sequence, which is the grade number
 * (e.g. 180 from "IFO 180 M/E 3.7MT/D") rather than the actual MT/day figure.
 * This function looks for an explicit MT/D unit first; if absent it strips grade
 * tokens before falling back to a leading-number heuristic. Strings with no
 * recoverable consumption figure return DEFAULT_CONSUMPTION_MT_PER_DAY.
 */
export function parseConsumption(s: unknown): number {
  if (s == null) return DEFAULT_CONSUMPTION_MT_PER_DAY;
  if (typeof s === 'number') return Number.isFinite(s) && s > 0 ? s : DEFAULT_CONSUMPTION_MT_PER_DAY;
  if (typeof s === 'object' && 'value' in (s as Record<string, unknown>)) {
    return parseConsumption((s as { value: unknown }).value);
  }
  if (typeof s !== 'string') return DEFAULT_CONSUMPTION_MT_PER_DAY;
  const str = s.trim();
  if (!str) return DEFAULT_CONSUMPTION_MT_PER_DAY;

  const mtd = str.match(MT_PER_DAY_RE);
  if (mtd) return Number(mtd[1]);

  // Strip fuel-grade tokens then try a plain leading number
  const stripped = str.replace(FUEL_GRADE_RE, ' ').replace(/\s+/g, ' ').trim();
  const m = stripped.match(/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);

  return DEFAULT_CONSUMPTION_MT_PER_DAY;
}
