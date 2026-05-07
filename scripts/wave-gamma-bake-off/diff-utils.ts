/**
 * Deep field diff utilities for Wave γ Quality Push.
 *
 * Provides per-top-level-field comparison of two JSON values with tolerance
 * for numbers, case-insensitive string matching, and array comparison.
 *
 * Reusable across Spec 02 (ground truth vs Pro diff), Spec 03, and Spec 06.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export type FieldStatus = 'match' | 'mismatch' | 'a_only' | 'b_only';

export interface FieldDiff {
  field: string;
  status: FieldStatus;
  a: unknown;
  b: unknown;
}

export interface DiffSummary {
  totalFields: number;
  matching: number;
  mismatching: number;
  aOnly: number;
  bOnly: number;
  fields: FieldDiff[];
}

export interface DeepEqualOptions {
  /** Numeric tolerance — values within this absolute delta are considered equal. Default: 0 */
  numericTolerance?: number;
  /** Case-insensitive string comparison. Default: false */
  caseInsensitive?: boolean;
}

// ─── Core comparison ────────────────────────────────────────────────────────────

/**
 * Deep equality check with tolerance for numbers and optional case-insensitive
 * string comparison. Works recursively on nested objects/arrays.
 */
export function deepEqual(a: unknown, b: unknown, opts: DeepEqualOptions = {}): boolean {
  // Identical references or both null/undefined
  if (a === b) return true;

  // null/undefined equivalence: treat null === undefined as equal
  if (a == null && b == null) return true;

  // One is null/undefined, other is not
  if (a == null || b == null) return false;

  // Number comparison with tolerance
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    const tol = opts.numericTolerance ?? 0;
    return Math.abs(a - b) <= tol;
  }

  // String comparison
  if (typeof a === 'string' && typeof b === 'string') {
    if (opts.caseInsensitive) {
      return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
  }

  // Boolean
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b;
  }

  // Different primitive types
  if (typeof a !== typeof b) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i], opts));
  }

  // One array, one not
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of allKeys) {
      if (!deepEqual(aObj[key], bObj[key], opts)) return false;
    }
    return true;
  }

  return false;
}

/**
 * Compare two objects at the top-level field granularity.
 * Returns a per-field diff summary. Both `a` and `b` are expected to be
 * JSON objects (or null/undefined — treated as empty objects).
 */
export function deepFieldDiff(
  a: unknown,
  b: unknown,
  opts: DeepEqualOptions = {},
): DiffSummary {
  const aObj: Record<string, unknown> = (a && typeof a === 'object' && !Array.isArray(a))
    ? (a as Record<string, unknown>)
    : {};
  const bObj: Record<string, unknown> = (b && typeof b === 'object' && !Array.isArray(b))
    ? (b as Record<string, unknown>)
    : {};

  const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  const fields: FieldDiff[] = [];

  let matching = 0;
  let mismatching = 0;
  let aOnly = 0;
  let bOnly = 0;

  for (const key of allKeys) {
    const hasA = key in aObj;
    const hasB = key in bObj;

    if (hasA && !hasB) {
      // Present in a but missing (not even null) in b
      // Treat null/undefined values in a as effectively absent → still a_only but benign
      fields.push({ field: key, status: 'a_only', a: aObj[key], b: undefined });
      aOnly++;
    } else if (!hasA && hasB) {
      fields.push({ field: key, status: 'b_only', a: undefined, b: bObj[key] });
      bOnly++;
    } else if (deepEqual(aObj[key], bObj[key], opts)) {
      fields.push({ field: key, status: 'match', a: aObj[key], b: bObj[key] });
      matching++;
    } else {
      fields.push({ field: key, status: 'mismatch', a: aObj[key], b: bObj[key] });
      mismatching++;
    }
  }

  return {
    totalFields: allKeys.size,
    matching,
    mismatching,
    aOnly,
    bOnly,
    fields,
  };
}
