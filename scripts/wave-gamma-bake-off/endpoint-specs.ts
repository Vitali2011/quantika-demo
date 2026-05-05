/**
 * Endpoint spec loader for Wave γ parsing bake-off.
 *
 * Re-exports the four production system prompts from `lib/prompts/*` and
 * pairs each with a minimal JSON-schema-shaped descriptor of the expected
 * output. The judge subagent works primarily from the prompt text itself —
 * the schema only declares the top-level shape so downstream code can do
 * cheap structural sanity-checks (e.g. "did parser return an `items` array?")
 * before handing raw output to the judge.
 *
 * Strategy A: prompts are already extracted into `lib/prompts/<endpoint>.ts`
 * (re-exported via `lib/prompts.ts` barrel). We import the canonical constant
 * directly — single source of truth shared with the production route handler.
 *
 * Provider note: in this codebase the same `*_SYSTEM_PROMPT` / `*_PARSER_PROMPT`
 * constant is fed to every provider through `lib/ai-provider.ts` (callAiJson).
 * There is no per-provider prompt fork, so getEndpointSpec takes no `provider`
 * argument. If a future migration introduces provider-specific prompts, this
 * is the place to add the parameter.
 */

import {
  CARGO_INQUIRY_PARSER_PROMPT,
  VESSEL_POSITION_PARSER_PROMPT,
  FIXTURE_RECAP_PARSER_PROMPT,
  CLASSIFICATION_SYSTEM_PROMPT,
} from '@/lib/prompts';
import type { Endpoint } from './corpus';

export const ENDPOINTS: readonly Endpoint[] = [
  'parse-cargo',
  'parse-vessel',
  'parse-recap',
  'classify',
] as const;

export interface EndpointSpec {
  /** System prompt fed to the model — verbatim from production. */
  systemPrompt: string;
  /**
   * Minimal top-level shape descriptor (JSON-schema-flavoured).
   * Captures only the outermost wrapper — detailed field semantics live
   * in the prompt text, which the judge reads directly.
   */
  outputSchema: Record<string, unknown>;
}

/**
 * `parse-cargo` and `parse-vessel` both wrap a list of extracted entities
 * under `items` (see "Output: { items: [...] }" line at the end of each
 * prompt). Each item is a free-form object whose fields are described
 * narratively in the prompt — we don't try to mirror that here.
 */
const ITEMS_WRAPPER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: { type: 'object' },
    },
    missing_info: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

/**
 * `parse-recap` returns a single flat JSON object whose top-level keys are
 * the field names listed in the prompt. We declare `type: object` and stop
 * there — the prompt is the contract.
 */
const RECAP_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'Flat fixture recap object — see CLASSIFICATION_SYSTEM_PROMPT for fields.',
};

/**
 * `classify` returns category + metadata fields (category, confidence,
 * urgency, is_unanswered, days_without_reply, original_sender, …).
 */
const CLASSIFY_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['category'],
  properties: {
    category: { type: 'string' },
    confidence: { type: 'number' },
    urgency: { type: 'string' },
    is_unanswered: { type: 'boolean' },
    days_without_reply: { type: ['number', 'null'] },
  },
};

const REGISTRY: Record<Endpoint, EndpointSpec> = {
  'parse-cargo': {
    systemPrompt: CARGO_INQUIRY_PARSER_PROMPT,
    outputSchema: ITEMS_WRAPPER_SCHEMA,
  },
  'parse-vessel': {
    systemPrompt: VESSEL_POSITION_PARSER_PROMPT,
    outputSchema: ITEMS_WRAPPER_SCHEMA,
  },
  'parse-recap': {
    systemPrompt: FIXTURE_RECAP_PARSER_PROMPT,
    outputSchema: RECAP_OUTPUT_SCHEMA,
  },
  classify: {
    systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
    outputSchema: CLASSIFY_OUTPUT_SCHEMA,
  },
};

export function getEndpointSpec(endpoint: Endpoint): EndpointSpec {
  const spec = REGISTRY[endpoint];
  if (!spec) {
    throw new Error(
      `Unknown endpoint: ${endpoint}. Expected one of: ${ENDPOINTS.join(', ')}`,
    );
  }
  return spec;
}
