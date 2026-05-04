import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiText, LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY } from '@/lib/constants';
import { ParsedFixtureRecap } from '@/lib/types';
import { summarizeCommissions } from '@/lib/commission';
import { parseRecapAIResponse } from '@/lib/parsing/parse-recap-helpers';
import pLimit from 'p-limit';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  const fixtureIds = session.classifications
    .filter(c => c.category === 'FIXTURE_RECAP')
    .map(c => c.emailId);

  const fixtureEmails = session.emails.filter(e => fixtureIds.includes(e.id));

  if (fixtureEmails.length === 0) {
    updateSession(sessionId, { parsedFixtureRecaps: [], commissionSummary: null });
    return NextResponse.json({ count: 0 });
  }

  const limit = pLimit(3);

  const parsedFixtureRecapsRaw: (ParsedFixtureRecap | null)[] = await Promise.all(
    fixtureEmails.map((email) => limit(async () => {
      const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
      try {
        const raw = await callAiText(userPrompt, FIXTURE_RECAP_PARSER_PROMPT, AI_MODEL_HEAVY, { timeoutMs: endpointLlmTimeout(120) });
        return parseRecapAIResponse(raw, email.id);
      } catch (err) {
        // γ-1: per-email timeout isolation — skip on timeout, do not poison batch.
        if (err instanceof LLMTimeoutError) return null;
        throw err;
      }
    }))
  );
  const parsedFixtureRecaps: ParsedFixtureRecap[] = parsedFixtureRecapsRaw.filter(
    (r): r is ParsedFixtureRecap => r !== null,
  );

  // Calculate commission summary
  const commissionSummary = summarizeCommissions(parsedFixtureRecaps);

  updateSession(sessionId, { parsedFixtureRecaps, commissionSummary });
  return NextResponse.json({ count: parsedFixtureRecaps.length });
}
