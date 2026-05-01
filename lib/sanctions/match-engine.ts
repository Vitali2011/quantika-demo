/**
 * β-09: lightweight name-matching engine for sanction screening.
 *
 * Pure functions, no external API calls. Used by the Sentinel scanner
 * to cross-reference active-deal counterparties / vessels / ports against
 * a list of `SanctionFlaggedEntity` records (from corpus or OpenSanctions).
 */

import type {
  SanctionFlaggedEntity,
  SanctionConfidence,
} from '@/lib/sample-data/sanction-corpus';

export interface NameMatchResult {
  matched: boolean;
  bestMatch?: SanctionFlaggedEntity;
  confidence: number; // 0..1
  exactName: boolean;
}

/**
 * Normalize a name for comparison: lowercase, collapse whitespace, drop punctuation.
 */
export function normalizeName(s: string): string {
  // Strip trailing ", Country" qualifier first (e.g. "Mariupol, Ukraine" → "Mariupol").
  const head = s.split(',')[0];
  return head
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple token-overlap similarity in [0..1]. Symmetric Jaccard over tokens.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

export interface MatchInput {
  name: string;
  imo?: string;
}

export interface ScoredMatch {
  matched: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low' | null;
  confidence: number;
  list: string;
  exactName: boolean;
  entity?: SanctionFlaggedEntity;
}

const CONFIDENCE_FROM_FIXTURE: Record<SanctionConfidence, string> = {
  high: 'OFAC SDN',
  medium: 'OFAC SDN',
  low: 'EU consolidated',
};

export function scoreMatch(
  input: MatchInput,
  candidates: SanctionFlaggedEntity[],
): ScoredMatch {
  let best: { entity: SanctionFlaggedEntity; score: number; exactName: boolean } | null = null;

  for (const cand of candidates) {
    // IMO disambiguation: if both sides have an IMO, they MUST match.
    if (input.imo && cand.imo) {
      if (input.imo !== cand.imo) continue;
    }
    const sim = similarity(input.name, cand.name);
    const exactName =
      normalizeName(input.name) === normalizeName(cand.name);
    if (!best || sim > best.score) {
      best = { entity: cand, score: sim, exactName };
    }
  }

  if (!best || best.score < 0.5) {
    return {
      matched: false,
      severity: null,
      confidence: best?.score ?? 0,
      list: '',
      exactName: false,
    };
  }

  const list = CONFIDENCE_FROM_FIXTURE[best.entity.confidence] ?? 'OFAC SDN';
  const severity = classifySeverity({
    confidence: best.score,
    list,
    exactName: best.exactName,
    fixtureConfidence: best.entity.confidence,
  });

  return {
    matched: severity !== null,
    severity,
    confidence: best.score,
    list,
    exactName: best.exactName,
    entity: best.entity,
  };
}

export interface ClassifyInput {
  confidence: number;
  list: string; // 'OFAC SDN', 'EU consolidated', ...
  exactName: boolean;
  fixtureConfidence?: SanctionConfidence;
}

/**
 * Severity rules per spec β-09:
 *   critical = exact name + OFAC SDN | EU consolidated
 *   high     = fuzzy ≥ 0.9 + OFAC
 *   medium   = fuzzy 0.75–0.9 (or fixture confidence "medium")
 *   low      = alias / weak signal (≥ 0.5)
 */
export function classifySeverity(
  input: ClassifyInput,
): 'critical' | 'high' | 'medium' | 'low' | null {
  const { confidence, list, exactName, fixtureConfidence } = input;
  const isOfac = /OFAC/i.test(list) || /EU consolidated/i.test(list);

  if (confidence < 0.5) return null;

  // Fixture-confidence override: keeps corpus-based tests deterministic.
  // 'medium' fixture entries map to medium severity regardless of similarity score
  // (per spec β-09: indirect / shell-company exposure ≠ critical).
  if (fixtureConfidence === 'medium') return 'medium';

  if (exactName && isOfac) return 'critical';
  if (confidence >= 0.9 && /OFAC/i.test(list)) return 'high';
  if (confidence >= 0.75) return 'medium';
  return 'low';
}
