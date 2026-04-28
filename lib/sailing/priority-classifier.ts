import type { MatchConfidence } from '../confidence';

export type PriorityLevel = 'urgent' | 'attention' | 'ok';

/**
 * Classifies a match into a priority level for the morning view traffic light.
 *
 * - urgent: confidence.blockSend OR readinessGap < 24h
 * - attention: confidence.level === 'inferred' OR readinessGap 24–72h
 * - ok: otherwise
 */
export function classifyPriority(match: {
  confidence?: MatchConfidence;
  readinessGap?: number;
}): PriorityLevel {
  const { confidence, readinessGap } = match;

  if (confidence?.blockSend) return 'urgent';
  if (readinessGap !== undefined && readinessGap < 24) return 'urgent';

  if (confidence?.level === 'inferred') return 'attention';
  if (readinessGap !== undefined && readinessGap <= 72) return 'attention';

  return 'ok';
}
