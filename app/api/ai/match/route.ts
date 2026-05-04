import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson, LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { MATCH_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import { analyzePairs, AiScorer, RawMatch } from '@/lib/matching/pair-analyzer';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

  const { parsedCargos, parsedVessels } = session;

  if (parsedCargos.length === 0 || parsedVessels.length === 0) {
    updateSession(sessionId, { matches: [] });
    return NextResponse.json({ count: 0 });
  }

  const sessionYear = session.createdAt.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const refYear = sessionYear < currentYear ? sessionYear : currentYear;
  const today = session.createdAt;

  const aiScorer: AiScorer = async ({ cargoData, vesselData, readinessData }) => {
    const promptPayload = JSON.stringify({
      cargo_inquiries: cargoData,
      vessel_positions: vesselData,
      readiness: readinessData,
    });

    const result = await callAiJson<{ matches: RawMatch[] }>(
      promptPayload,
      MATCH_PROMPT,
      AI_MODEL_HEAVY,
      { matches: [] },
      undefined,
      { timeoutMs: endpointLlmTimeout(120) },
    );

    return result.matches || [];
  };

  try {
    const { matches, blockedMatches } = await analyzePairs(
      parsedCargos,
      parsedVessels,
      aiScorer,
      { refYear, today },
    );

    updateSession(sessionId, { matches, blockedMatches });
    return NextResponse.json({ count: matches.length, blockedCount: blockedMatches.length });
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return NextResponse.json(
        {
          error: 'ai_timeout',
          message: 'AI scoring timed out after 85s — try fewer pairs',
          retryable: true,
        },
        { status: 504 },
      );
    }
    throw err;
  }
}
