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
    const llmOpts = { timeoutMs: endpointLlmTimeout(maxDuration), model: modelOverride };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserPrompt(
  match: import('@/lib/types').Match,
  cargo: import('@/lib/types').ParsedCargo | null,
  vessel: import('@/lib/types').ParsedVessel | null,
  matchIndex: number,
): string {
  // R2 hard-anchor: every field is listed with either its value or "NOT_PROVIDED".
  // The LLM must NOT mention any NOT_PROVIDED field (FORBIDDEN clause below).
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return 'NOT_PROVIDED';
    if (typeof v === 'object' && 'value' in (v as { value?: unknown })) {
      const val = (v as { value: unknown }).value;
      return val === null || val === undefined || val === '' ? 'NOT_PROVIDED' : String(val);
    }
    return String(v);
  };

  const cargoWeight =
    cargo?.weightMt?.value ?? cargo?.weightMtMin ?? cargo?.weightMtMax ?? null;
  const cargoQuantity = (() => {
    if (!cargo?.quantity) return null;
    if (typeof cargo.quantity === 'number') return cargo.quantity;
    if (typeof cargo.quantity === 'object' && 'min' in cargo.quantity) {
      return `${cargo.quantity.min}–${cargo.quantity.max}`;
    }
    return null;
  })();

  const payloadLines = [
    `cargo.type: ${fmt(cargo?.cargoType)}`,
    `cargo.description: ${fmt(cargo?.cargoDescription)}`,
    `cargo.weight_mt: ${cargoWeight !== null ? `${cargoWeight} MT` : 'NOT_PROVIDED'}`,
    `cargo.quantity: ${cargoQuantity !== null ? cargoQuantity : 'NOT_PROVIDED'}`,
    `cargo.stowage_factor: ${fmt(cargo?.stowageFactor)}`,
    `cargo.origin_port: ${fmt(cargo?.originPort)}`,
    `cargo.destination_port: ${fmt(cargo?.destinationPort)}`,
    `cargo.laycan: ${fmt(cargo?.laycan)}`,
    `vessel.name: ${fmt(vessel?.vesselName)}`,
    `vessel.imo: ${fmt(vessel?.imo)}`,
    `vessel.type: ${fmt(vessel?.vesselType)}`,
    `vessel.flag: ${fmt(vessel?.flag)}`,
    `vessel.built: ${fmt(vessel?.built)}`,
    `vessel.dwt_summer: ${vessel?.dwtSummer?.value ? `${vessel.dwtSummer.value} MT` : 'NOT_PROVIDED'}`,
    `vessel.dwcc: ${vessel?.dwcc?.value ? `${vessel.dwcc.value} MT` : 'NOT_PROVIDED'}`,
    `vessel.class_society: ${fmt(vessel?.classSociety)}`,
    `vessel.geared: ${vessel?.geared === null || vessel?.geared === undefined ? 'NOT_PROVIDED' : String(vessel.geared)}`,
    `vessel.holds_count: ${fmt(vessel?.holdsCount)}`,
    `vessel.grain_capacity: ${vessel?.grainCapacity ? String(vessel.grainCapacity) : 'NOT_PROVIDED'}`,
    `vessel.open_position: ${fmt(vessel?.openPosition)}`,
    `vessel.open_date: ${fmt(vessel?.openDate)}`,
    `economics.total_usd: ${match.economics?.totalUsd ? `USD ${match.economics.totalUsd}` : 'NOT_PROVIDED'}`,
  ].join('\n- ');

  return `MATCH PAYLOAD (index ${matchIndex}) — use ONLY these values; NEVER infer, estimate, or default:
- ${payloadLines}

FORBIDDEN — do NOT mention any field marked NOT_PROVIDED. Do NOT fabricate:
- Stowage factors in m³/MT or any unit (if cargo.stowage_factor is NOT_PROVIDED)
- Vessel class societies (DNV, LR, ABS, BV, NK, RINA, CCS, KR, etc.) other than the exact value above
- Gear status (gearless, geared, crane-fitted) if vessel.geared is NOT_PROVIDED
- Specific quantities, capacities, DWT, DWCC, or freight rates not listed above
- Open position history, last cargoes, hold/hatch dimensions not in the payload

Score: ${match.score}/100 (${match.matchLevel.toUpperCase()})
Match Reasons: ${match.matchReasons.join('; ') || 'none'}
Issues: ${match.issues.join('; ') || 'none'}

FULL DATA (for context only — do NOT use any value missing from the MATCH PAYLOAD anchor above):

CARGO:
${cargo ? JSON.stringify(cargo, null, 2) : 'Not available'}

VESSEL:
${vessel ? JSON.stringify(vessel, null, 2) : 'Not available'}

ECONOMICS:
${match.economics ? JSON.stringify(match.economics, null, 2) : 'Not available'}

SCORE BREAKDOWN:
${match.scoreBreakdown ? JSON.stringify(match.scoreBreakdown, null, 2) : 'Not available'}

Please produce the 4-section narrative using ONLY values from the MATCH PAYLOAD anchor.`;
}
