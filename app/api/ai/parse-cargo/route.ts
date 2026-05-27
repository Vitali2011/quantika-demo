import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { computeAndPersistMatches } from '@/lib/matching/compute-matches';
import { getStore } from '@/lib/session-store';
import { callAiJson as callAiJsonShim } from '@/lib/ai-provider';
import { PARSE_CARGO_SCHEMA } from '@/lib/schemas';
import { LLMTimeoutError } from '@/lib/openai';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts';
import {
  LLM_TIMEOUT_MS,
  PARSE_CARGO_CONCURRENCY,
  withRetry429,
} from '@/lib/parse-cargo-helpers';
import { ParsedCargo } from '@/lib/types';
import { applyCargoRateFallback, applyCargoTypeFallback } from '@/lib/parsing/cargo-rate-fallback';
import { buildProcessedEmails } from '@/lib/classification-service';
import { getCachedParses, saveParsedResults, hashParserVersion } from '@/lib/email-cache';
import { isRagEnabled } from '@/lib/knowledge/flags';
import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';
import pLimit from 'p-limit';
import {
  buildCargoPrompts,
  parseCargoAIResponse,
  type RawCargoItem,
} from '@/lib/parsing/parse-cargo-ai';
import { isDemoMode } from '@/lib/demo-mode';

// parseCargoAIResponse historically lived in this route; keep it re-exported
// so existing importers (app/api/ai/__tests__/parse-cargo-multiport.test.ts)
// keep working after the extraction to lib/parsing/parse-cargo-ai.
export { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

// βf-11: Cloudflare proxy enforces a hard 100s edge timeout (524). Cap our
// route well below it so the runtime can still emit a clean 200 fallback
// instead of bubbling a 524 to the browser.
export const maxDuration = 55;

/** Race a promise against a timeout. Returns `null` on timeout instead of throwing. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

  // DEMO_MODE: block live LLM; serve pre-seeded data or return cached count.
  if (isDemoMode()) {
    return NextResponse.json({ count: session.parsedCargos?.length ?? 0, cached: true });
  }

  // wave-γ-3-demo: demo guests get pre-seeded cargoes — skip live LLM entirely.
  if (session.isSampleData === true && session.parsedCargos.length > 0) {
    return NextResponse.json({ count: session.parsedCargos.length, cached: true });
  }

  const cargoInquiryIds = session.classifications
    .filter(c => c.category === 'CARGO_INQUIRY')
    .map(c => c.emailId);

  const cargoEmails = session.emails.filter(e => cargoInquiryIds.includes(e.id));

  // Email-cache: parse only the emails we have not parsed before (same prompt
  // version). RAG flag is folded into the version because it changes output.
  const accountId = session.accountId;
  const parserVersion = hashParserVersion(
    CARGO_INQUIRY_PARSER_PROMPT + (isRagEnabled() ? ":rag" : "")
  );
  const cached = accountId
    ? getCachedParses<ParsedCargo>(
        accountId,
        "cargo",
        parserVersion,
        cargoEmails.map((e) => e.id)
      )
    : new Map<string, ParsedCargo[]>();
  const toParse = cargoEmails.filter((e) => !cached.has(e.id));

  if (cargoEmails.length === 0) {
    updateSession(sessionId, { parsedCargos: [] });
    return NextResponse.json({ count: 0 });
  }

  // RAG phase-3: IMSBC context retrieval for cargo safety / stowage info.
  // Runs before LLM calls so the system prompt can be enriched with IMSBC data.
  // Guarded by feature flag — no-op when KNOWLEDGE_RAG_ENABLED != "true".
  let imsbcSystemContext: string | undefined;
  // Skip RAG when toParse is empty — no LLM calls means imsbcSystemContext has
  // no consumer, so retrieval would be a wasted DB round-trip.
  if (isRagEnabled() && toParse.length > 0) {
    try {
      // Build keywords from the full cargo batch, not just uncached emails: in a
      // mixed batch a cached hazmat email must still steer the IMSBC context for
      // an uncached email re-parsed alongside it.
      const cargoKeywords = cargoEmails
        .map(e => e.body.slice(0, 200))
        .join(' ')
        .slice(0, 400);
      const query = `cargo safety stowage hazmat bulk ${cargoKeywords}`.trim();
      const [{ retrieve }, { getDb }] = await Promise.all([
        import('@/lib/knowledge/embeddings/retriever'),
        import('@/lib/db'),
      ]);
      const db = getDb();
      const chunks: RetrievedChunk[] = await retrieve(query, {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topN: 3,
        db,
      });
      if (chunks.length > 0) {
        const lines = chunks.map(c => {
          const id = c.metadata?.id ?? c.chunkId;
          return `[IMSBC-${id}] ${c.content}`;
        });
        imsbcSystemContext = [
          '=== IMSBC Cargo Safety Context ===',
          ...lines,
          '===================================',
        ].join('\n');
      }
    } catch (ragErr) {
      // RAG failure must not block cargo parsing — degrade gracefully.
      console.warn('[parse-cargo] IMSBC RAG retrieval failed, continuing without context:', ragErr);
    }
  }

  const allParsed: ParsedCargo[] = [];
  const limit = pLimit(PARSE_CARGO_CONCURRENCY);
  const prompts = buildCargoPrompts(toParse);

  // Build system prompt: base + optional IMSBC context appended.
  const systemPrompt = imsbcSystemContext
    ? `${CARGO_INQUIRY_PARSER_PROMPT}\n\n${imsbcSystemContext}`
    : CARGO_INQUIRY_PARSER_PROMPT;

  await Promise.all(
    toParse.map((email, i) => limit(async () => {
      // βf-11: race the LLM call against LLM_TIMEOUT_MS. On timeout we fall
      // back to regex enrichment of an empty cargo so the route still returns
      // 200 instead of letting the request hang past maxDuration → 524.
      // γ-1: pass timeoutMs into callAiJson so the underlying AbortController
      // actually cancels the upstream stream (was: only outer race resolved
      // null while the LLM kept consuming resources in the background).
      // γ-3 (B1): wrap in withRetry429 so the higher pLimit(8) concurrency
      // doesn't translate cliproxy 429 blips into permanent failures.
      // γv-02: route through ai-provider shim (PARSE_CARGO_PROVIDER env).
      //   Default: gemini-2.5-flash; rollback: PARSE_CARGO_PROVIDER=openai.
      //   PARSE_CARGO_GEMINI_MODEL overrides the Gemini model for this scope.
      let result: RawCargoItem | null;
      try {
        result = await withTimeout(
          withRetry429(() =>
            callAiJsonShim<RawCargoItem>(
              'PARSE_CARGO',
              systemPrompt,
              prompts[i],
              {
                timeoutMs: LLM_TIMEOUT_MS,
                maxTokens: 16000,
                model: process.env.PARSE_CARGO_GEMINI_MODEL,
                responseSchema: PARSE_CARGO_SCHEMA,
                temperature: 0,
                seed: 42,
              },
            ),
          ),
          LLM_TIMEOUT_MS,
        );
      } catch (err) {
        // LLMTimeoutError from the inner abort — same outcome as withTimeout race.
        if (err instanceof LLMTimeoutError) {
          result = null;
        } else {
          throw err;
        }
      }
      const items = result === null
        ? [] // LLM timed out — emit nothing rather than a half-parsed record.
        : parseCargoAIResponse(JSON.stringify(result), email.id);
      // Apply regex fallbacks: populate rates/cargoType that LLM missed
      const enriched = items
        .map(c => applyCargoRateFallback(c, email.body))
        .map(c => applyCargoTypeFallback(c));
      allParsed.push(...enriched);
    }))
  );

  // Persist fresh results, then merge with the cached ones for this response.
  if (accountId) {
    saveParsedResults<ParsedCargo>(
      accountId,
      "cargo",
      parserVersion,
      toParse.map((e) => ({
        gmailMessageId: e.id,
        items: allParsed.filter((c) => c.emailId === e.id),
      }))
    );
  }
  const mergedCargos = [...allParsed, ...Array.from(cached.values()).flat()];

  // Recompute processedEmails so dashboard staleness reflects the laycan
  // we just extracted. Without this, classify-time fallback (+5d) leaves
  // every CARGO_INQUIRY marked stale within a week.
  const processedEmails = buildProcessedEmails(
    session.emails,
    session.classifications,
    mergedCargos,
    session.parsedVessels,
  );
  updateSession(sessionId, { parsedCargos: mergedCargos, processedEmails });

  // Background catch-up: if vessels are already parsed, compute+persist matches now.
  if (process.env.MATCHES_ENABLED === 'true' && mergedCargos.length > 0 && session.parsedVessels.length > 0) {
    const db = getStore().getDatabase();
    void computeAndPersistMatches(mergedCargos, session.parsedVessels, sessionId, db)
      .catch((err) => console.error('[catch-up-match] cargo trigger failed:', err));
  }

  return NextResponse.json({ count: mergedCargos.length });
}
