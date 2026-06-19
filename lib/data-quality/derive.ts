import type { DataTier } from './types';

interface DeriveTierInput {
  source?: string;
  asOf?: string;
  staleAfterDays?: number;
  verifiedSources?: string[];
  /**
   * "Now" in ms since epoch, used for freshness/staleness.
   *
   * Clock-agnostic by design — this module must NOT import @/lib/clock
   * (which transitively pulls better-sqlite3 via demo-mode), or it leaks the
   * server DB graph into the client bundle. Callers pass the right clock:
   *   - SERVER callers → demoNow() from @/lib/clock
   *   - CLIENT components → useDemoNow() from @/lib/clock-client
   * Default Date.now() is a neutral non-demo fallback only.
   */
  nowMs?: number;
}

function ageInDays(asOf: string, nowMs: number): number {
  const ms = nowMs - new Date(asOf).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function deriveTier(input: DeriveTierInput): DataTier {
  const nowMs = input.nowMs ?? Date.now();
  if (input.asOf && input.staleAfterDays != null && ageInDays(input.asOf, nowMs) > input.staleAfterDays) {
    return 'stale';
  }
  if (input.source && input.verifiedSources?.includes(input.source)) {
    return 'live';
  }
  if (!input.source) {
    return 'live';
  }
  return 'estimated';
}
