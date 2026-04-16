import type { Match, MatchLevel, MatchReadiness } from '@/lib/types';

/**
 * Apply readiness-based score adjustment + add contextual issue text.
 *
 * Pure function — extracted here (rather than inlined in the route) so Next.js
 * doesn't reject it as a non-standard route export, and so it's independently
 * unit-testable.
 */
export function applyReadinessScoring(match: Match, readiness: MatchReadiness | undefined): Match {
  if (!readiness) return match;
  const updated: Match = { ...match, readiness };

  switch (readiness.verdict) {
    case 'ideal':
      updated.score = Math.min(100, match.score + 10);
      break;
    case 'idle': {
      updated.score = Math.max(0, match.score - 15);
      const days = readiness.gapDays != null ? Math.round(readiness.gapDays) : null;
      const issue = days != null
        ? `Vessel idle ${days}d before laycan — owner likely won't wait unpaid`
        : 'Vessel idle for several days before laycan — check willingness to hold';
      updated.issues = Array.isArray(match.issues) ? [...match.issues, issue] : [issue];
      break;
    }
    case 'late': {
      // Safety net — hard filter should drop these, but if LLM returned one anyway, penalize heavily
      updated.score = Math.max(0, match.score - 30);
      const days = readiness.gapDays != null ? Math.abs(Math.round(readiness.gapDays)) : null;
      const issue = days != null
        ? `Vessel arrives ${days}d after laycan start — misses window`
        : 'Vessel arrives after laycan start';
      updated.issues = Array.isArray(match.issues) ? [...match.issues, issue] : [issue];
      break;
    }
    case 'tight':
    case 'unknown':
    default:
      // no score adjustment
      break;
  }

  // Recalculate matchLevel from adjusted score
  updated.matchLevel = (updated.score > 70 ? 'good' : updated.score > 40 ? 'possible' : 'weak') as MatchLevel;

  return updated;
}
