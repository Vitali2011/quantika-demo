/**
 * GT normalizer for email classify corpus.
 *
 * Applies consistency rules to reference_output fields so that eval scoring
 * compares against current-rule expectations, not stale GT snapshots.
 *
 * Rules applied (EMAIL_PARSE_R4_ENABLED — eval-infrastructure, no prod change):
 *  1. days_without_reply staleness: recompute from email date vs today
 *  2. urgency: CARGO_INQUIRY "low" → "medium" (rule: "low = not applicable")
 *             VESSEL_POSITION "low" → "medium" (rule: medium is default)
 *  3. company name: strip trailing punct, collapse whitespace, lowercase-compare
 */

export const CORPUS_GEN_DATE = new Date('2026-05-11T06:39:44.912Z');

/** Recompute days_without_reply from the original email date relative to today.
 *  Returns null if emailDateIso is unparseable. */
export function recomputeDays(emailDateIso: string, today: Date = new Date()): number | null {
  const d = new Date(emailDateIso);
  if (isNaN(d.getTime())) return null;
  const ms = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Normalize urgency per current prompt rules.
 *  CARGO_INQUIRY / TCT_REQUEST: "low" not applicable → "medium"
 *  VESSEL_POSITION: "low" not applicable → "medium"
 */
export function normalizeUrgency(category: string, urgency: string): string {
  const u = urgency.toLowerCase();
  if ((category === 'CARGO_INQUIRY' || category === 'TCT_REQUEST') && u === 'low') {
    return 'medium';
  }
  if (category === 'VESSEL_POSITION' && u === 'low') {
    return 'medium';
  }
  return u;
}

/** Normalize a company name for fuzzy equivalence comparison.
 *  - lowercase
 *  - strip trailing punctuation (., ,, ;, :)
 *  - collapse multiple spaces
 *  - strip "the " prefix
 */
export function normalizeCompanyName(name: string | null | undefined): string | null {
  if (name == null) return null;
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[.,;:!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tolerance match for days_without_reply: passes if |ref - model| <= toleranceDays */
export function daysMatch(
  ref: number | null,
  model: number | null,
  toleranceDays = 10,
): boolean {
  if (ref === null && model === null) return true;
  if (ref === null || model === null) return false;
  return Math.abs(ref - model) <= toleranceDays;
}

export interface NormalizedRef {
  category: string;
  urgency: string;
  is_unanswered: boolean;
  days_without_reply: number | null;
  original_sender_company: string | null;
}

/** Apply all normalizations to a reference_output for an email at emailDateIso. */
export function normalizeRef(
  ref: {
    category: string;
    urgency: string;
    is_unanswered: boolean;
    days_without_reply: number | null;
    original_sender_company?: string | null;
  },
  emailDateIso: string,
  today: Date = new Date(),
): NormalizedRef {
  return {
    category: ref.category,
    urgency: normalizeUrgency(ref.category, ref.urgency),
    is_unanswered: ref.is_unanswered,
    days_without_reply: recomputeDays(emailDateIso, today),
    original_sender_company: normalizeCompanyName(ref.original_sender_company ?? null),
  };
}
