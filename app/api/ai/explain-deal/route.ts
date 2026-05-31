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
import { stripInventedContent } from '@/lib/explain-deal-validator';
import { buildExplainDealUserPrompt } from '@/lib/explain-deal-prompt';
import { isDemoMode } from '@/lib/demo-mode';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

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

export type ExplainDealWarning = {
  type: 'invented_numerics' | 'forbidden_tokens';
  values: (string | number)[];
};

export type ExplainDealResponse = {
  sections: ExplainDealSection[];
  language: 'en' | 'ar';
  model: string;
  warnings?: ExplainDealWarning[];
};

// ─── Demo Mode ─────────────────────────────────────────────────────────────────

function buildDemoExplanation(
  match: Match,
  cargo: ParsedCargo | null,
  vessel: ParsedVessel | null,
  language: 'en' | 'ar',
): ExplainDealResponse {
  const cargoDesc = cargo?.cargoDescription?.value ?? cargo?.cargoType ?? 'bulk cargo';
  const cargoWeight = cargo?.weightMt?.value ?? null;
  const origin = cargo?.originPort?.value ?? 'load port';
  const destination = cargo?.destinationPort?.value ?? 'discharge port';
  const laycan = cargo?.laycan ?? 'TBD';
  const vesselName = vessel?.vesselName?.value ?? 'the vessel';
  const vesselType = vessel?.vesselType ?? 'bulk carrier';
  const dwtSummer = vessel?.dwtSummer?.value ?? null;
  const openPos = vessel?.openPosition?.value ?? null;
  const openDate = vessel?.openDate?.value ?? null;
  const reasons = match.matchReasons.join('; ') || 'cargo/vessel compatibility';
  const issues = match.issues.length > 0 ? match.issues.join('; ') : null;

  const weightStr = cargoWeight ? `${cargoWeight.toLocaleString('en-US')} MT ` : '';
  const dwtStr = dwtSummer ? `${dwtSummer.toLocaleString('en-US')} DWT, ` : '';
  const openParts = ([openPos && `Open: ${openPos}`, openDate && `(${openDate})`] as (string | false)[]).filter(Boolean) as string[];
  const openStr = openParts.length > 0 ? ` ${openParts.join(' ')}.` : '';

  if (language === 'ar') {
    return {
      sections: [
        {
          heading: 'سياق السوق',
          content: `سوق شحن ${cargo?.cargoType ?? 'البضائع السائبة'} نشط على الخط ${origin} ← ${destination}. يدعم توافر السفن الإقليمي إمكانية تنفيذ الشريعة لهذا الطلب.`,
        },
        {
          heading: 'مبررات الصفقة',
          content: `${vesselName} (${dwtStr}${vesselType}) مناسبة لهذه البضاعة ${weightStr}(${cargoDesc}).${openStr} الليكان: ${laycan}. درجة التطابق: ${match.score}/100 (${match.matchLevel.toUpperCase()}). العوامل: ${reasons}.`,
        },
        {
          heading: 'المخاطر الرئيسية',
          content: issues
            ? `المشكلات المرصودة: ${issues}. يجب معالجتها قبل تأكيد الشريعة.`
            : `لا مخاوف رئيسية. تسري المخاطر القياسية: ازدحام الموانئ، تأخيرات الطقس، والتعرض للاستمرار.`,
        },
        {
          heading: 'الخطوات التالية الموصى بها',
          content: `1. تأكيد جاهزية البضاعة مع المستأجر.\n2. التواصل مع ملاك ${vesselName} لتأمين نافذة الليكان.\n3. التفاوض على الشحن ورسوم الاستمرار.\n4. ترتيب معاينة السفينة والتحقق من الشهادات.`,
        },
      ],
      language: 'ar',
      model: 'demo',
    };
  }

  return {
    sections: [
      {
        heading: 'Market Context',
        content: `The ${cargo?.cargoType ?? 'bulk'} freight market is active on the ${origin} → ${destination} corridor. Regional vessel availability supports viable fixture potential for this inquiry.`,
      },
      {
        heading: 'Deal Rationale',
        content: `${vesselName} (${dwtStr}${vesselType}) is well-suited for this ${weightStr}${cargoDesc} cargo.${openStr} Laycan: ${laycan}. Match score: ${match.score}/100 (${match.matchLevel.toUpperCase()}). Key factors: ${reasons}.`,
      },
      {
        heading: 'Key Risks',
        content: issues
          ? `Flagged issues: ${issues}. Broker should address these before fixture confirmation.`
          : `No major flags identified. Standard risks apply: port congestion, weather delays on the route, and demurrage exposure if cargo is not ready by laycan.`,
      },
      {
        heading: 'Recommended Next Steps',
        content: `1. Confirm cargo readiness and exact stem with the charterer.\n2. Approach ${vesselName} owners to secure the laycan window.\n3. Negotiate freight rate and demurrage terms.\n4. Arrange vessel inspection and verify certificates if required.`,
      },
    ],
    language: 'en',
    model: 'demo',
  };
}

/**
 * Parses LLM text output into structured sections.
 * Splits on the known section headers.
 */
function parseSections(
  text: string,
  headers: readonly string[],
): ExplainDealSection[] {
  const sections: ExplainDealSection[] = [];

  // Anchor headers to a heading-like context so we don't false-match the
  // phrase inside body prose (e.g. "Considering the Market Context, ...").
  // Accept: start-of-line, markdown bold (**Header**), numbered prefix (1.),
  // optional leading hash. Falls back to indexOf if no anchored match found.
  function findHeader(haystack: string, header: string): number {
    const escaped = header.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
    // Try anchored matches first: line-start optionally preceded by **, ##, or N.
    const anchored = new RegExp(
      `(^|\\n)\\s*(?:\\*\\*|#{1,4}\\s*|\\d+\\.\\s*)?${escaped}(?:\\*\\*|:)?\\s*(?=\\n|$)`,
    );
    const m = anchored.exec(haystack);
    if (m) {
      // Position of the actual header text, not the leading whitespace/markers
      return m.index + m[0].indexOf(header);
    }
    // Fallback to substring scan (legacy behavior)
    return haystack.indexOf(header);
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const nextHeader = headers[i + 1];

    const headerIdx = findHeader(text, header);
    if (headerIdx === -1) {
      // Header not found — include empty section so UI knows structure
      sections.push({ heading: header, content: '' });
      continue;
    }

    // Content starts after the header line
    const afterHeader = text.slice(headerIdx + header.length);
    // Strip leading newlines/colons/markdown
    const contentStart = afterHeader.replace(/^[\s:*\n]+/, '');

    let content: string;
    if (nextHeader) {
      const nextIdx = findHeader(contentStart, nextHeader);
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

  // Demo mode: return template explanation without LLM call
  if (isDemoMode()) {
    return NextResponse.json(buildDemoExplanation(match, cargo ?? null, vessel ?? null, language));
  }

  const userPrompt = buildExplainDealUserPrompt(match, cargo ?? null, vessel ?? null, matchIndex);
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
    // R3 (#589): lower temperature reduces hallucination of "typical" shipping values.
    // Gemini 2.5 Pro defaults to ~1.0; 0.3 anchors responses closer to the provided data.
    const llmOpts = { timeoutMs: endpointLlmTimeout(maxDuration), model: modelOverride, temperature: 0.3 };
    const rawText = await callAiText('EXPLAIN_DEAL', systemPrompt, userPrompt, llmOpts);

    // R2 (#589): strip-not-retry — post-process the response by replacing invented
    // numerics and forbidden qualitative tokens with inline redaction markers.
    // Retry approach (R1) was ineffective: Gemini re-invents the same values.
    const stripped = stripInventedContent(rawText, match, cargo ?? null, vessel ?? null);

    const sections = parseSections(stripped.text, headers);
    const usedModel =
      modelOverride ??
      (process.env.AI_MODEL_HEAVY ?? 'gpt-5.5');

    const warnings: ExplainDealWarning[] = [];
    if (stripped.inventedNumbers.length > 0) {
      warnings.push({ type: 'invented_numerics', values: stripped.inventedNumbers });
    }
    if (stripped.forbiddenTokens.length > 0) {
      warnings.push({ type: 'forbidden_tokens', values: stripped.forbiddenTokens });
    }

    const response: ExplainDealResponse = {
      sections,
      language,
      model: usedModel,
      ...(warnings.length > 0 ? { warnings } : {}),
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

