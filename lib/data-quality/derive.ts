import type { DataTier } from './types';

interface DeriveTierInput {
  source?: string;
  asOf?: string;
  staleAfterDays?: number;
  verifiedSources?: string[];
}

function ageInDays(asOf: string): number {
  const ms = Date.now() - new Date(asOf).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function deriveTier(input: DeriveTierInput): DataTier {
  if (input.asOf && input.staleAfterDays != null && ageInDays(input.asOf) > input.staleAfterDays) {
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
