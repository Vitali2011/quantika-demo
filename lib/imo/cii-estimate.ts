import type { CiiRating } from './cii-lookup';

/**
 * Conservative CII estimate from a vessel's build year.
 *
 * IMO's real CII register is NOT free / openly licensed, so for demo vessels we
 * derive a deterministic, intentionally conservative proxy from build year only.
 * Any rating produced here is an ESTIMATE and MUST be surfaced as such in the UI
 * (source: 'estimated') — never presented as a real IMO rating.
 *
 * Rule (deterministic, no optimism — ceiling is C):
 *   built ≥ 2008        → C   (modern hull/engine; "meets minimum standard")
 *   1995 ≤ built ≤ 2007 → D   (mature tonnage; below standard)
 *   built < 1995        → E   (pre-CII-era design; poor)
 *
 * We deliberately NEVER assign A or B: those are optimistic efficiency claims that
 * require verified data. Capping at C keeps every estimate neutral-to-cautious and
 * prevents an estimate from inflating a vessel's vetting / fit score.
 *
 * Returns 'unknown' when build year is missing or implausible — callers map that
 * to the neutral (no-data) path, never to a penalty.
 */
export function estimateCiiByBuildYear(built: number | null | undefined): CiiRating {
  if (built == null || !Number.isFinite(built) || built < 1900 || built > 2100) {
    return 'unknown';
  }
  if (built >= 2008) return 'C';
  if (built >= 1995) return 'D';
  return 'E';
}
