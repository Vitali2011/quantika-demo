import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { callAiText } from '@/lib/ai-provider';
import { LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { DraftQuoteBodySchema } from '@/lib/api-schemas';
import { isRagEnabled } from '@/lib/knowledge/flags';
import { resolveSenderName } from '@/lib/utils/resolve-sender-name';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session } = result;

  const raw = await request.json();
  const parsed = DraftQuoteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body', details: parsed.error.format() }, { status: 400 });
  }
  const { emailId } = parsed.data;

  const parsedCargo = session.parsedCargos.find(r => r.emailId === emailId);
  if (!parsedCargo) return NextResponse.json({ error: 'Parsed request not found' }, { status: 404 });

  const email = session.emails.find(e => e.id === emailId);

  const fromName = resolveSenderName({ fromName: email?.fromName, from: email?.from });

  // RAG phase-3: IMSBC + IGC context retrieval for quote generation.
  // Enriches system prompt with cargo safety / hazmat / grain data.
  // Guarded by feature flag — no-op when KNOWLEDGE_RAG_ENABLED != "true".
  const ragContextParts: string[] = [];
  if (isRagEnabled()) {
    const cargoDesc = (() => {
      const d = parsedCargo.cargoDescription;
      if (!d) return '';
      if (typeof d === 'object' && 'value' in d) return String((d as { value: unknown }).value) || '';
      return String(d);
    })();
    const cargoType = parsedCargo.cargoType || '';
    const query = `${cargoType} ${cargoDesc}`.trim() || 'bulk cargo safety stowage';

    try {
      const [{ retrieve }, { getDb }] = await Promise.all([
        import('@/lib/knowledge/embeddings/retriever'),
        import('@/lib/db'),
      ]);
      const db = getDb();

      // IMSBC: bulk cargo safety (coal, grain, fertilizer, ore, etc.)
      const imsbcChunks = await retrieve(`IMSBC ${query}`, {
        vectorTable: 'imsbc_vec',
        ftsTable: 'imsbc_fts',
        topN: 3,
        db,
      });
      if (imsbcChunks.length > 0) {
        const lines = imsbcChunks.map(c => `[IMSBC-${c.metadata?.id ?? c.chunkId}] ${c.content}`);
        ragContextParts.push(
          '=== IMSBC Cargo Safety Context ===',
          ...lines,
          '===================================',
        );
      }
    } catch (ragErr) {
      console.warn('[draft-quote] IMSBC RAG retrieval failed, continuing without context:', ragErr);
    }

    try {
      const [{ retrieve }, { getDb }] = await Promise.all([
        import('@/lib/knowledge/embeddings/retriever'),
        import('@/lib/db'),
      ]);
      const db = getDb();

      // IGC: grain / gas cargo international codes
      const igcChunks = await retrieve(`IGC grain gas ${query}`, {
        vectorTable: 'igc_vec',
        ftsTable: 'igc_fts',
        topN: 3,
        db,
      });
      if (igcChunks.length > 0) {
        const lines = igcChunks.map(c => `[IGC-${c.metadata?.id ?? c.chunkId}] ${c.content}`);
        ragContextParts.push(
          '=== IGC Grain/Gas Cargo Context ===',
          ...lines,
          '====================================',
        );
      }
    } catch (ragErr) {
      console.warn('[draft-quote] IGC RAG retrieval failed, continuing without context:', ragErr);
    }
  }

  const systemPrompt = ragContextParts.length > 0
    ? `${DRAFT_QUOTE_SYSTEM_PROMPT}\n\n${ragContextParts.join('\n')}`
    : DRAFT_QUOTE_SYSTEM_PROMPT;

  const userPrompt = `
Parsed cargo inquiry data:
${JSON.stringify(parsedCargo, null, 2)}

Original email:
From: ${email?.from || ''}
Subject: ${email?.subject || ''}
Body: ${email?.body?.slice(0, 1500) || ''}

Address the reply to: ${fromName}

Generate a professional draft quote email.`;

  try {
    const draft = await callAiText('DRAFT_QUOTE', systemPrompt, userPrompt, { timeoutMs: endpointLlmTimeout(30) });
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return NextResponse.json(
        { error: 'ai_timeout', message: 'AI draft generation timed out — please retry', retryable: true },
        { status: 504 },
      );
    }
    const message = err instanceof Error ? err.message : 'AI draft generation failed';
    return NextResponse.json({ error: 'ai_error', message }, { status: 500 });
  }
}
