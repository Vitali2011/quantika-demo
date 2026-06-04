import { cfValue } from '@/lib/types';
import type { ParsedCargo } from '@/lib/types';

/**
 * Canonical cargo-weight extractor.
 *
 * Returns the worst-case weight (upper bound) for capacity / scoring decisions:
 *   - `weightMtMax` (range upper) wins when present
 *   - falls back to `cfValue(weightMt)` (single value)
 *   - null when neither is populated
 *
 * Worst-case rationale: for a range cargo `[4000, 4800]`, any actual loading
 * may reach the upper bound; using min would silently pass infeasible matches
 * through the hard overload gate (#792).
 */
export function resolveCargoWeight(
  cargo: ParsedCargo | null | undefined,
): number | null {
  if (!cargo) return null;
  if (
    cargo.weightMtMax != null &&
    Number.isFinite(cargo.weightMtMax) &&
    cargo.weightMtMax > 0
  ) {
    return cargo.weightMtMax;
  }
  const v = cfValue(cargo.weightMt);
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}
