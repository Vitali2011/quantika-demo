import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { withSentryApiHandler } from '@/lib/sentry-api';
import { requireSession, updateSession } from '@/lib/session';
import { callAiText } from '@/lib/openai';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { ParsedVessel, cfValue } from '@/lib/types';
import { applyGearedFallback } from '@/lib/parsing/geared-fallback';
import { lookupVesselByImo, compareVesselRecord } from '@/lib/validation/equasis-client';
import { buildVesselPrompt, parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';
import pLimit from 'p-limit';

async function _POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  const vesselIds = session.classifications
    .filter(c => c.category === 'VESSEL_POSITION')
    .map(c => c.emailId);

  const vesselEmails = session.emails.filter(e => vesselIds.includes(e.id));

  if (vesselEmails.length === 0) {
    updateSession(sessionId, { parsedVessels: [] });
    return NextResponse.json({ count: 0 });
  }

  const allParsed: ParsedVessel[] = [];
  const limit = pLimit(3);

  await Promise.all(
    vesselEmails.map((email) => limit(async () => {
      const prompt = buildVesselPrompt(email);
      const raw = await callAiText(prompt, VESSEL_POSITION_PARSER_PROMPT, AI_MODEL_LIGHT);
      const items = parseVesselAIResponse(raw, email.id);
      const corrected = applyGearedFallback(items, email.body);
      allParsed.push(...corrected);
    }))
  );

  // External registry verification (Equasis). Runs only for vessels where we
  // have a structurally valid IMO. Graceful — Equasis down = no warning,
  // not a filter failure.
  const limitEquasis = pLimit(3);
  await Promise.all(
    allParsed.map(async (v) => {
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

  updateSession(sessionId, { parsedVessels: allParsed });
  return NextResponse.json({ count: allParsed.length });
}

export const POST = withSentryApiHandler(_POST, { method: 'POST', path: '/api/ai/parse-vessel' });
