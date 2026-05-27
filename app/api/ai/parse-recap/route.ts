import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiText } from '@/lib/ai-provider';
import { PARSE_RECAP_SCHEMA } from '@/lib/schemas';
import { LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts';
import { ParsedFixtureRecap } from '@/lib/types';
import { summarizeCommissions } from '@/lib/commission';
import { getCachedParses, saveParsedResults, hashParserVersion } from '@/lib/email-cache';
import { parseRecapAIResponse } from '@/lib/parsing/parse-recap-helpers';
import pLimit from 'p-limit';
import { isDemoMode } from '@/lib/demo-mode';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  // DEMO_MODE: block live LLM; serve pre-seeded recaps or cached count.
  if (isDemoMode()) {
    return NextResponse.json({ count: session.parsedRecaps?.length ?? 0, cached: true });
  }

  const fixtureIds = session.classifications
    .filter(c => c.category === 'FIXTURE_RECAP')
    .map(c => c.emailId);

  const fixtureEmails = session.emails.filter(e => fixtureIds.includes(e.id));

  const accountId = session.accountId;
  const parserVersion = hashParserVersion(FIXTURE_RECAP_PARSER_PROMPT);
  const cached = accountId
    ? getCachedParses<ParsedFixtureRecap>(
        accountId,
        "recap",
        parserVersion,
        fixtureEmails.map((e) => e.id)
      )
    : new Map<string, ParsedFixtureRecap[]>();
  const toParse = fixtureEmails.filter((e) => !cached.has(e.id));

  if (fixtureEmails.length === 0) {
    updateSession(sessionId, { parsedFixtureRecaps: [], commissionSummary: null });
    return NextResponse.json({ count: 0 });
  }

  const limit = pLimit(3);

  const parsedFixtureRecapsRaw: (ParsedFixtureRecap | null)[] = await Promise.all(
    toParse.map((email) => limit(async () => {
      const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
      try {
        const raw = await callAiText('PARSE_RECAP', FIXTURE_RECAP_PARSER_PROMPT, userPrompt, { timeoutMs: endpointLlmTimeout(120), responseSchema: PARSE_RECAP_SCHEMA });
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

  if (accountId) {
    saveParsedResults<ParsedFixtureRecap>(
      accountId,
      "recap",
      parserVersion,
      toParse.map((e) => ({
        gmailMessageId: e.id,
        items: parsedFixtureRecaps.filter((r) => r.emailId === e.id),
      }))
    );
  }
  const mergedRecaps = [...parsedFixtureRecaps, ...Array.from(cached.values()).flat()];

  // Calculate commission summary
  const commissionSummary = summarizeCommissions(mergedRecaps);

  updateSession(sessionId, { parsedFixtureRecaps: mergedRecaps, commissionSummary });
  return NextResponse.json({ count: mergedRecaps.length });
}
