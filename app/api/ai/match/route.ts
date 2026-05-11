import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/ai-provider';
import { LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { MATCH_PROMPT } from '@/lib/prompts';
import { analyzePairs, AiScorer, RawMatch } from '@/lib/matching/pair-analyzer';
import { isRagEnabled } from '@/lib/knowledge/flags';

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

  // RAG phase-3: IGC context retrieval for grain/gas cargo matching.
  // Enriches MATCH system prompt with IGC stowage / moisture requirements.
  // Guarded by feature flag — no-op when KNOWLEDGE_RAG_ENABLED != "true".
  let matchSystemPrompt = MATCH_PROMPT;
  if (isRagEnabled()) {
    try {
      // Build query from cargo descriptions present in this session.
      const cargoKeywords = parsedCargos
        .map(c => {
          const d = c.cargoDescription;
          if (!d) return '';
          if (typeof d === 'object' && 'value' in d) return String((d as { value: unknown }).value) || '';
          return String(d);
        })
        .filter(Boolean)
        .join(' ')
        .slice(0, 300);
      const query = `IGC grain gas cargo stowage ${cargoKeywords}`.trim();

      const [{ retrieve }, { getDb }] = await Promise.all([
        import('@/lib/knowledge/embeddings/retriever'),
        import('@/lib/db'),
      ]);
      const db = getDb();
      const chunks = await retrieve(query, {
        vectorTable: 'igc_vec',
        ftsTable: 'igc_fts',
        topN: 3,
        db,
      });

      if (chunks.length > 0) {
        const lines = chunks.map(c => `[IGC-${c.metadata?.id ?? c.chunkId}] ${c.content}`);
        const igcContext = [
          '=== IGC Grain/Gas Cargo Context ===',
          ...lines,
          '====================================',
        ].join('\n');
        matchSystemPrompt = `${MATCH_PROMPT}\n\n${igcContext}`;
      }
    } catch (ragErr) {
      // RAG failure must not block matching — degrade gracefully.
      console.warn('[match] IGC RAG retrieval failed, continuing without context:', ragErr);
    }
  }

  const aiScorer: AiScorer = async ({ cargoData, vesselData, readinessData }) => {
    const promptPayload = JSON.stringify({
      cargo_inquiries: cargoData,
      vessel_positions: vesselData,
      readiness: readinessData,
    });

    const result = await callAiJson<{ matches: RawMatch[] }>(
      'MATCH',
      matchSystemPrompt,
      promptPayload,
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
