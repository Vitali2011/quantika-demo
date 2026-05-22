import type Database from 'better-sqlite3';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { analyzePairs, type AiScorer, type RawMatch } from '@/lib/matching/pair-analyzer';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';
import { callAiJson } from '@/lib/ai-provider';
import { MATCH_PROMPT } from '@/lib/prompts';
import { endpointLlmTimeout } from '@/lib/openai-helpers';

/**
 * Compute matches for a session and persist them to the DB.
 *
 * Idempotent: if matches already exist for this sessionId, returns 0 immediately.
 * Called as a fire-and-forget background task from parse-cargo / parse-vessel routes
 * so the user sees matches without having to manually trigger /api/ai/match.
 */
export async function computeAndPersistMatches(
  cargos: ParsedCargo[],
  vessels: ParsedVessel[],
  sessionId: string,
  db: Database.Database,
): Promise<number> {
  if (cargos.length === 0 || vessels.length === 0) return 0;

  // Skip if matches already exist for this session (idempotency guard).
  // INSERT OR IGNORE also dedups, but skipping the full LLM round is cheaper.
  const existing = listMatches(db, { user_id: sessionId, sortBy: 'score', sortDir: 'desc', limit: 1 });
  if (existing.length > 0) return 0;

  const aiScorer: AiScorer = async ({ cargoData, vesselData, readinessData }) => {
    const result = await callAiJson<{ matches: RawMatch[] }>(
      'MATCH',
      MATCH_PROMPT,
      JSON.stringify({ cargo_inquiries: cargoData, vessel_positions: vesselData, readiness: readinessData }),
      { timeoutMs: endpointLlmTimeout(120) },
    );
    return result.matches ?? [];
  };

  const { matches } = await analyzePairs(cargos, vessels, aiScorer);

  for (const m of matches) {
    createMatch(db, {
      cargo_id: m.cargoEmailId,
      vessel_id: m.vesselEmailId,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.matchReasons[0] ?? '',
      status: 'shortlist',
      user_id: sessionId,
      reason_structured: m.scoreBreakdown ? JSON.stringify(m.scoreBreakdown) : null,
    });
  }

  return matches.length;
}
