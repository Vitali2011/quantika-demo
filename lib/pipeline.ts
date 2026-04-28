// Pure TypeScript — NO React imports
import type { Match } from './types';
import type { EconomicsResult } from './types';
import type { EconomicsInput } from './economics/index';

/**
 * Economics enrichment hook — spec α-08.
 * Called AFTER match scoring (different hunk from spec-02 confidence attachment).
 *
 * For each match that has sufficient route + vessel data, attempts to compute
 * economics with a 5-second timeout. On any failure, the match is returned
 * unchanged (economics field absent). Never throws to caller.
 */
export async function enrichMatchesWithEconomics(
  matches: Match[],
  getData: (match: Match) => EconomicsInput | null,
  computeFn: (input: EconomicsInput) => Promise<EconomicsResult>,
): Promise<Match[]> {
  return Promise.all(
    matches.map(async (match) => {
      const input = getData(match);
      if (!input) return match;
      try {
        const economics = await Promise.race([
          computeFn(input),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('economics timeout')), 5_000)
          ),
        ]);
        return { ...match, economics };
      } catch {
        return match;
      }
    })
  );
}

export interface PipelineStep {
  label: string;
  endpoint: string;
  critical?: boolean;
  /** Client-side fetch timeout in ms. Default: 90_000. LLM-heavy steps need more. */
  timeoutMs?: number;
}

export interface PipelineStepGroup {
  steps: PipelineStep[];
  parallel?: boolean;
}

// parse-cargo/vessel/recap each call LLM once per email (26 cargo + 14 vessel).
// With pLimit(3) concurrency that's ~9 rounds × up to 15s/call = up to 135s.
// match makes one big LLM call for all cargo×vessel pairs (can be 29×14=406 pairs).
// 150s gives a comfortable buffer above the 90s default for all LLM-heavy steps.
const PARSE_TIMEOUT_MS = 150_000;
const MATCH_TIMEOUT_MS = 150_000;

export const STEP_GROUPS: PipelineStepGroup[] = [
  { steps: [{ label: 'Loading emails from Gmail...', endpoint: '/api/emails/fetch', critical: true }] },
  { steps: [{ label: 'Sorting your inbox by type...', endpoint: '/api/ai/classify', critical: true }] },
  { steps: [
    { label: 'Reading your cargo inquiries...', endpoint: '/api/ai/parse-cargo', timeoutMs: PARSE_TIMEOUT_MS },
    { label: 'Extracting vessel details...', endpoint: '/api/ai/parse-vessel', timeoutMs: PARSE_TIMEOUT_MS },
    { label: 'Extracting fixture recaps...', endpoint: '/api/ai/parse-recap', timeoutMs: PARSE_TIMEOUT_MS },
  ], parallel: true },
  { steps: [{ label: 'Finding available vessels for your cargo...', endpoint: '/api/ai/match', timeoutMs: MATCH_TIMEOUT_MS }] },
  { steps: [
    { label: 'Summarizing your negotiations...', endpoint: '/api/ai/recap' },
    { label: 'Mapping your network...', endpoint: '/api/ai/counterparty' },
  ], parallel: true },
];

export const PIPELINE_STEPS: PipelineStep[] = STEP_GROUPS.flatMap(g => g.steps);
