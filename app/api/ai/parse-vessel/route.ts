import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiText } from '@/lib/ai-provider';
import { PARSE_VESSEL_SCHEMA } from '@/lib/schemas';
import { LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts';
import { ParsedVessel, cfValue } from '@/lib/types';
import { applyGearedFallback } from '@/lib/parsing/geared-fallback';
import { lookupVesselByImo, compareVesselRecord } from '@/lib/validation/equasis-client';
import { buildVesselPrompt, parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';
import { buildProcessedEmails } from '@/lib/classification-service';
import { getCachedParses, saveParsedResults, hashParserVersion } from '@/lib/email-cache';
import pLimit from 'p-limit';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  // wave-γ-1.5-A: demo guests get pre-seeded vessel positions — skip live LLM entirely.
  if (session.isSampleData === true && session.parsedVessels.length > 0) {
    return NextResponse.json({ count: session.parsedVessels.length, cached: true });
  }

  const vesselIds = session.classifications
    .filter(c => c.category === 'VESSEL_POSITION')
    .map(c => c.emailId);

  const vesselEmails = session.emails.filter(e => vesselIds.includes(e.id));

  const accountId = session.accountId;
  const parserVersion = hashParserVersion(VESSEL_POSITION_PARSER_PROMPT);
  const cached = accountId
    ? getCachedParses<ParsedVessel>(
        accountId,
        "vessel",
        parserVersion,
        vesselEmails.map((e) => e.id)
      )
    : new Map<string, ParsedVessel[]>();
  const toParse = vesselEmails.filter((e) => !cached.has(e.id));

  if (vesselEmails.length === 0) {
    updateSession(sessionId, { parsedVessels: [] });
    return NextResponse.json({ count: 0 });
  }

  const allParsed: ParsedVessel[] = [];
  const limit = pLimit(3);

  await Promise.all(
    toParse.map((email) => limit(async () => {
      const prompt = buildVesselPrompt(email);
      let raw: string;
      try {
        raw = await callAiText('PARSE_VESSEL', VESSEL_POSITION_PARSER_PROMPT, prompt, { timeoutMs: endpointLlmTimeout(60), responseSchema: PARSE_VESSEL_SCHEMA });
      } catch (err) {
        // γ-1: per-email timeout isolation — a single LLM timeout must NOT
        // poison the whole batch. Skip this email; user retries the route.
        if (err instanceof LLMTimeoutError) return;
        throw err;
      }
      const items = parseVesselAIResponse(raw, email.id, email.subject);
      const corrected = applyGearedFallback(items, email.body);
      allParsed.push(...corrected);
    }))
  );

  // Persist fresh LLM results BEFORE Equasis verification, so the transient
  // verificationWarning is never baked into the cached JSON. The cache holds
  // only the parse output; verification is recomputed every request.
  if (accountId) {
    saveParsedResults<ParsedVessel>(
      accountId,
      "vessel",
      parserVersion,
      toParse.map((e) => ({
        gmailMessageId: e.id,
        items: allParsed.filter((v) => v.emailId === e.id),
      }))
    );
  }
  const mergedVessels = [...allParsed, ...Array.from(cached.values()).flat()];

  // External registry verification (Equasis). Runs over ALL vessels (fresh +
  // cached) every request — a transient Equasis outage on first parse must not
  // produce a permanently stale warning for cached vessels. Graceful — Equasis
  // down = no warning, not a filter failure.
  const limitEquasis = pLimit(3);
  await Promise.all(
    mergedVessels.map(async (v) => {
      // Reset any stale warning carried over from the cache before recomputing.
      v.verificationWarning = null;
      if (!v.imo) return;
      try {
        const record = await limitEquasis(async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8_000);
          try {
            return await lookupVesselByImo(v.imo!);
          } finally {
            clearTimeout(timeoutId);
          }
        });
        if (!record) {
          v.verificationWarning = 'IMO not found in Equasis registry';
          return;
        }
        const mismatch = compareVesselRecord(record, {
          parsedName: cfValue(v.vesselName),
          parsedDwt: cfValue(v.dwtSummer),
        });
        if (mismatch) v.verificationWarning = mismatch;
      } catch {
        // swallow — never block a match due to verification failure
      }
    })
  );

  // Recompute processedEmails so dashboard staleness reflects the openDate
  // we just extracted. Mirror of parse-cargo: classify-time runs before us
  // and falls back to emailDate+5d, which marks every VESSEL_POSITION stale.
  const processedEmails = buildProcessedEmails(
    session.emails,
    session.classifications,
    session.parsedCargos,
    mergedVessels,
  );
  updateSession(sessionId, { parsedVessels: mergedVessels, processedEmails });
  return NextResponse.json({ count: mergedVessels.length });
}
