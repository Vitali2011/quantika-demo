/**
 * POST /api/ai/explain-deal
 *
 * γv-11: "Explain this deal" wow-feature.
 * Generates a 4-section narrative (Market Context → Deal Rationale → Key Risks → Recommended Next Steps)
 * for a specific cargo-vessel match.
 *
 * Feature flag: EXPLAIN_DEAL_ENABLED=true|false (default: false)
 * Provider override: EXPLAIN_DEAL_PROVIDER=gemini|openai|bedrock (default: gemini, model gemini-2.5-pro)
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { callAiText } from '@/lib/ai-provider';
import { LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import {
  EXPLAIN_DEAL_SYSTEM_PROMPT_EN,
  EXPLAIN_DEAL_SYSTEM_PROMPT_AR,
} from '@/lib/prompts';
import { ExplainDealBodySchema } from '@/lib/api-schemas';

export const maxDuration = 60;

/** Sections in English output */
const SECTION_HEADERS_EN = [
  'Market Context',
  'Deal Rationale',
  'Key Risks',
  'Recommended Next Steps',
] as const;

/** Sections in Arabic output */
const SECTION_HEADERS_AR = [
  'سياق السوق',
  'مبررات الصفقة',
  'المخاطر الرئيسية',
  'الخطوات التالية الموصى بها',
] as const;

export type ExplainDealSection = {
  heading: string;
  content: string;
};

export type ExplainDealResponse = {
  sections: ExplainDealSection[];
  language: 'en' | 'ar';
  model: string;
};

/**
 * Parses LLM text output into structured sections.
 * Splits on the known section headers.
 */
function parseSections(
  text: string,
  headers: readonly string[],
): ExplainDealSection[] {
  const sections: ExplainDealSection[] = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const nextHeader = headers[i + 1];

    // Find the position of this header in the text
    const headerIdx = text.indexOf(header);
    if (headerIdx === -1) {
      // Header not found — include empty section so UI knows structure
      sections.push({ heading: header, content: '' });
      continue;
    }

    // Content starts after the header line
    const afterHeader = text.slice(headerIdx + header.length);
    // Strip leading newlines/colons
    const contentStart = afterHeader.replace(/^[\s:*\n]+/, '');

    let content: string;
    if (nextHeader) {
      const nextIdx = contentStart.indexOf(nextHeader);
      content = nextIdx !== -1
        ? contentStart.slice(0, nextIdx).trim()
        : contentStart.trim();
    } else {
      content = contentStart.trim();
    }

    sections.push({ heading: header, content });
  }

  return sections;
}

export async function POST(request: NextRequest) {
  // Feature flag check — disabled by default
  if (process.env.EXPLAIN_DEAL_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'feature_disabled', message: 'Explain Deal feature is not enabled' },
      { status: 403 },
    );
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sessionResult = requireSession(request);
  if (sessionResult instanceof NextResponse) return sessionResult;
  const { session } = sessionResult;

  const raw = await request.json();
  const parsed = ExplainDealBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { matchIndex, language } = parsed.data;

  if (matchIndex >= session.matches.length) {
    return NextResponse.json(
      { error: 'Match not found', message: `No match at index ${matchIndex}` },
      { status: 404 },
    );
  }

  const match = session.matches[matchIndex];
  const cargo = session.parsedCargos.find(
    (c) => c.emailId === match.cargoEmailId && c.itemIndex === match.cargoItemIndex,
  );
  const vessel = session.parsedVessels.find(
    (v) => v.emailId === match.vesselEmailId && v.itemIndex === match.vesselItemIndex,
  );

  const userPrompt = buildUserPrompt(match, cargo ?? null, vessel ?? null, matchIndex);
  const systemPrompt =
    language === 'ar' ? EXPLAIN_DEAL_SYSTEM_PROMPT_AR : EXPLAIN_DEAL_SYSTEM_PROMPT_EN;
  const headers = language === 'ar' ? SECTION_HEADERS_AR : SECTION_HEADERS_EN;

  // Default model for this scope: gemini-2.5-pro
  const modelOverride =
    process.env.EXPLAIN_DEAL_MODEL ??
    (process.env[`EXPLAIN_DEAL_PROVIDER`] === 'gemini' ||
    (!process.env[`EXPLAIN_DEAL_PROVIDER`] && !process.env.AI_PROVIDER) ||
    process.env.AI_PROVIDER === 'gemini'
      ? 'gemini-2.5-pro'
      : undefined);

  try {
    const rawText = await callAiText('EXPLAIN_DEAL', systemPrompt, userPrompt, {
      timeoutMs: endpointLlmTimeout(maxDuration),
      model: modelOverride,
    });

    const sections = parseSections(rawText, headers);
    const usedModel =
      modelOverride ??
      (process.env.AI_MODEL_HEAVY ?? 'gpt-5.5');

    const response: ExplainDealResponse = {
      sections,
      language,
      model: usedModel,
    };

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return NextResponse.json(
        {
          error: 'ai_timeout',
          message: 'AI explanation timed out — please retry',
          retryable: true,
        },
        { status: 504 },
      );
    }
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserPrompt(
  match: import('@/lib/types').Match,
  cargo: import('@/lib/types').ParsedCargo | null,
  vessel: import('@/lib/types').ParsedVessel | null,
  matchIndex: number,
): string {
  return `MATCH DATA (index ${matchIndex}):

Score: ${match.score}/100 (${match.matchLevel.toUpperCase()})
Match Reasons: ${match.matchReasons.join('; ') || 'none'}
Issues: ${match.issues.join('; ') || 'none'}

CARGO:
${cargo ? JSON.stringify(cargo, null, 2) : 'Not available'}

VESSEL:
${vessel ? JSON.stringify(vessel, null, 2) : 'Not available'}

ECONOMICS:
${match.economics ? JSON.stringify(match.economics, null, 2) : 'Not available'}

SCORE BREAKDOWN:
${match.scoreBreakdown ? JSON.stringify(match.scoreBreakdown, null, 2) : 'Not available'}

Please produce the 4-section narrative based on this data.`;
}
