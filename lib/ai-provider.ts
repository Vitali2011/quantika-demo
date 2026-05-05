/**
 * lib/ai-provider.ts — Wave γ: unified AI provider shim
 *
 * Routing priority:
 *   1. Per-scope env  <SCOPE_UPPER>_PROVIDER  (e.g. MATCH_PROVIDER=bedrock)
 *   2. Global env     AI_PROVIDER
 *   3. Default        "openai"
 *
 * Supported providers: "openai" | "gemini" | "bedrock"
 */

import { logger } from '@/lib/logger';
import { getStore } from '@/lib/session-store';
import * as openaiLib from '@/lib/openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = 'openai' | 'gemini' | 'bedrock';

export interface AiOpts {
  /** Override timeout in milliseconds (default: 85_000). */
  timeoutMs?: number;
  /** Caller-supplied AbortSignal. */
  signal?: AbortSignal;
  /** Model override for this call. Overrides getModel(scope). */
  model?: string;
  /** Max tokens for the completion (default: 16_000). */
  maxTokens?: number;
  /**
   * Gemini Deep Think budget. Only applicable to gemini provider.
   * -1 = dynamic (model decides how much to think, deeper = better on hard reasoning).
   * Large positive number (e.g. 24000) = explicit token budget for thinking.
   * Omit (undefined) = no thinking config passed → regular mode.
   * Enabling this increases cost 2-3× but improves reasoning quality.
   */
  thinkingBudget?: number;
}

export interface ImageInput {
  /** Base64-encoded image data. */
  data: string;
  /** MIME type, e.g. "image/jpeg". */
  mimeType: string;
}

interface AiAuditRow {
  scope: string;
  provider: Provider;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  ok: boolean;
  err: string | null;
}

/**
 * QA L-1: token usage extracted from each provider's native response.
 * Internal-only; not part of the public callAi* signatures.
 */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * QA L-1: per-(provider, model) USD pricing per 1M tokens.
 *
 * Rates as of 2026-05 (input / output). When the user hits a model not in the
 * table, `computeCostUsd` returns null — we deliberately do not guess.
 *
 * - gemini-2.5-flash: Vertex AI public pricing $0.075 / $0.30 per 1M tokens
 * - gemini-2.5-pro:   $1.25 / $5.00 per 1M tokens
 * - claude-opus-4-7 (Bedrock): $15 / $75 per 1M tokens
 *
 * OpenAI rates are intentionally absent: lib/openai.ts doesn't surface usage
 * tokens, so we cannot bill accurately and prefer null over a guess.
 */
const COST_TABLE_PER_M_TOKENS: Record<string, { in: number; out: number }> = {
  'gemini:gemini-2.5-flash': { in: 0.075, out: 0.30 },
  'gemini:gemini-2.5-flash-lite': { in: 0.0375, out: 0.15 },
  'gemini:gemini-2.5-pro': { in: 1.25, out: 5.0 },
  // Deep Think suffix is used by the eval script to track thinkingBudget runs separately in ai_audit.
  // Billing rate is the same underlying model, but output token usage is higher in practice (2-3×).
  'gemini:gemini-2.5-pro-deepthink': { in: 1.25, out: 5.0 },
  'bedrock:us.anthropic.claude-opus-4-7-20260415-v1:0': { in: 15, out: 75 },
  'bedrock:us.anthropic.claude-sonnet-4-6-20260101-v1:0': { in: 3, out: 15 },
};

export function computeCostUsd(
  provider: Provider,
  model: string,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number | null {
  if (promptTokens == null || completionTokens == null) return null;
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  // QI follow-up: a malformed SDK response with negative counts must not yield a negative cost.
  if (promptTokens < 0 || completionTokens < 0) return null;
  const rate = COST_TABLE_PER_M_TOKENS[`${provider}:${model}`];
  if (!rate) return null;
  const cost = (promptTokens * rate.in + completionTokens * rate.out) / 1_000_000;
  // Round to 6 decimal places — sub-microcent precision is meaningless.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toScopeEnv(scope: string): string {
  // "parse_cargo" → "PARSE_CARGO_PROVIDER"
  return `${scope.toUpperCase().replace(/-/g, '_')}_PROVIDER`;
}

function assertGeminiEnv(): void {
  const missing: string[] = [];
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) missing.push('GOOGLE_APPLICATION_CREDENTIALS');
  if (!process.env.GOOGLE_CLOUD_PROJECT) missing.push('GOOGLE_CLOUD_PROJECT');
  if (missing.length > 0) {
    throw new Error(
      `Gemini provider requires these env vars to be set in .env.local: ${missing.join(', ')}`
    );
  }
}

function assertBedrockEnv(): void {
  const missing: string[] = [];
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');
  if (!process.env.BEDROCK_MODEL_ID) missing.push('BEDROCK_MODEL_ID');
  if (missing.length > 0) {
    throw new Error(
      `Bedrock provider requires these env vars to be set in .env.local: ${missing.join(', ')}`
    );
  }
}

function writeAuditRecord(row: AiAuditRow): void {
  try {
    const db = getStore().getDatabase();
    db.prepare<[string, string, string, number | null, number | null, number | null, number | null, number, string | null]>(
      `INSERT INTO ai_audit
         (scope, provider, model, prompt_tokens, completion_tokens, cost_usd, latency_ms, ok, err)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.scope,
      row.provider,
      row.model,
      row.prompt_tokens,
      row.completion_tokens,
      row.cost_usd,
      row.latency_ms,
      row.ok ? 1 : 0,
      row.err,
    );
  } catch (e) {
    // Audit failure must never break the main call
    logger.error({ err: e }, '[ai-provider] audit write failed');
  }
}

// ─── Public routing API ───────────────────────────────────────────────────────

/**
 * Returns the provider for a given scope.
 * Resolves: <SCOPE>_PROVIDER → AI_PROVIDER → "openai"
 */
export function getProvider(scope: string): Provider {
  const scopeEnv = process.env[toScopeEnv(scope)];
  const globalEnv = process.env.AI_PROVIDER;
  const raw = scopeEnv || globalEnv || 'openai';
  if (raw !== 'openai' && raw !== 'gemini' && raw !== 'bedrock') {
    logger.warn({ scope, raw }, '[ai-provider] unknown provider value, falling back to openai');
    return 'openai';
  }
  return raw;
}

/**
 * Returns the model ID for the given scope.
 * For openai: uses AI_MODEL_HEAVY (from constants via openai.ts indirectly)
 * For gemini: AI_MODEL_GEMINI_DEFAULT or gemini-2.5-flash
 * For bedrock: BEDROCK_MODEL_ID or claude opus default
 */
export function getModel(scope: string): string {
  const provider = getProvider(scope);
  // Per-scope model override
  const scopeModelEnv = process.env[`${scope.toUpperCase().replace(/-/g, '_')}_MODEL`];
  if (scopeModelEnv) return scopeModelEnv;

  switch (provider) {
    case 'gemini':
      return process.env.AI_MODEL_GEMINI_DEFAULT ?? 'gemini-2.5-flash';
    case 'bedrock':
      return process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-opus-4-7-20260415-v1:0';
    case 'openai':
    default:
      return process.env.AI_MODEL_HEAVY ?? 'gpt-5.5';
  }
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function callOpenAiJson<T>(
  scope: string,
  system: string,
  user: string,
  opts?: AiOpts,
): Promise<T> {
  const model = opts?.model ?? getModel(scope);
  const result = await openaiLib.callAiJson<T>(
    user,
    system,
    model,
    undefined as T,
    opts?.maxTokens ?? 16000,
    { timeoutMs: opts?.timeoutMs, signal: opts?.signal },
  );
  return result;
}

async function callOpenAiText(
  scope: string,
  system: string,
  user: string,
  opts?: AiOpts,
): Promise<string> {
  const model = opts?.model ?? getModel(scope);
  return openaiLib.callAiText(
    user,
    system,
    model,
    { timeoutMs: opts?.timeoutMs, signal: opts?.signal },
  );
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

function extractGeminiUsage(meta: GeminiUsageMetadata | undefined): Usage | undefined {
  if (!meta) return undefined;
  const p = meta.promptTokenCount;
  const c = meta.candidatesTokenCount;
  if (typeof p !== 'number' || typeof c !== 'number') return undefined;
  return { promptTokens: p, completionTokens: c };
}

async function callGeminiText(
  system: string,
  user: string,
  model: string,
  opts?: AiOpts,
): Promise<{ text: string; usage?: Usage }> {
  assertGeminiEnv();
  const { GoogleGenAI } = require('@google/genai') as {
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
      models: {
        generateContent: (params: {
          model: string;
          contents: Array<{ role: string; parts: Array<{ text: string }> }>;
          config?: {
            systemInstruction?: string;
            thinkingConfig?: { thinkingBudget: number; includeThoughts: boolean };
          };
        }) => Promise<{ text: string; usageMetadata?: GeminiUsageMetadata }>;
      };
    };
  };

  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  });

  // Build config — only add thinkingConfig when caller explicitly requests it.
  // Omitting thinkingConfig entirely → Gemini uses default (minimal thinking for Pro).
  const callConfig: {
    systemInstruction?: string;
    thinkingConfig?: { thinkingBudget: number; includeThoughts: boolean };
  } = { systemInstruction: system };

  if (opts?.thinkingBudget !== undefined) {
    callConfig.thinkingConfig = {
      thinkingBudget: opts.thinkingBudget,
      includeThoughts: false, // Keep response clean — thoughts are internal only
    };
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: user }] }],
    config: callConfig,
  });

  return { text: response.text ?? '', usage: extractGeminiUsage(response.usageMetadata) };
}

async function callGeminiVision(
  system: string,
  user: string,
  images: ImageInput[],
  model: string,
): Promise<{ text: string; usage?: Usage }> {
  assertGeminiEnv();
  const { GoogleGenAI } = require('@google/genai') as {
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
      models: {
        generateContent: (params: {
          model: string;
          contents: Array<{ role: string; parts: unknown[] }>;
          config?: { systemInstruction?: string };
        }) => Promise<{ text: string; usageMetadata?: GeminiUsageMetadata }>;
      };
    };
  };

  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  });

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [
    { text: user },
    ...images.map((img) => ({
      inlineData: { data: img.data, mimeType: img.mimeType },
    })),
  ];

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: system },
  });

  return { text: response.text ?? '', usage: extractGeminiUsage(response.usageMetadata) };
}

interface BedrockUsage {
  input_tokens?: number;
  output_tokens?: number;
}

function extractBedrockUsage(usage: BedrockUsage | undefined): Usage | undefined {
  if (!usage) return undefined;
  const p = usage.input_tokens;
  const c = usage.output_tokens;
  if (typeof p !== 'number' || typeof c !== 'number') return undefined;
  return { promptTokens: p, completionTokens: c };
}

async function callBedrockText(
  system: string,
  user: string,
  model: string,
): Promise<{ text: string; usage?: Usage }> {
  assertBedrockEnv();
  const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime') as {
    BedrockRuntimeClient: new (opts: { region: string; credentials: { accessKeyId: string; secretAccessKey: string } }) => {
      send: (cmd: unknown) => Promise<{ body: Uint8Array }>;
    };
    InvokeModelCommand: new (opts: { modelId: string; contentType: string; accept: string; body: string }) => unknown;
  };

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
  };

  const cmd = new InvokeModelCommand({
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await client.send(cmd);
  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }>; usage?: BedrockUsage };
  return { text: parsed.content?.[0]?.text ?? '', usage: extractBedrockUsage(parsed.usage) };
}

async function callBedrockAudio(
  audioBuffer: Buffer,
  model: string,
): Promise<{ text: string; usage?: Usage }> {
  assertBedrockEnv();
  const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime') as {
    BedrockRuntimeClient: new (opts: { region: string; credentials: { accessKeyId: string; secretAccessKey: string } }) => {
      send: (cmd: unknown) => Promise<{ body: Uint8Array }>;
    };
    InvokeModelCommand: new (opts: { modelId: string; contentType: string; accept: string; body: string }) => unknown;
  };

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const audioBase64 = audioBuffer.toString('base64');
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [{
        type: 'document',
        source: { type: 'base64', media_type: 'audio/mp4', data: audioBase64 },
      }],
    }],
  };

  const cmd = new InvokeModelCommand({
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const response = await client.send(cmd);
  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }>; usage?: BedrockUsage };
  return { text: parsed.content?.[0]?.text ?? '', usage: extractBedrockUsage(parsed.usage) };
}

// ─── Public callAi* functions ─────────────────────────────────────────────────

/**
 * Generic AI call — parses JSON response.
 * This is a convenience wrapper around callAiJson.
 */
export async function callAi<T>(
  scope: string,
  prompt: string,
  opts?: AiOpts,
): Promise<T> {
  return callAiJson<T>(scope, '', prompt, opts);
}

/**
 * Call AI expecting a JSON response. Handles all 3 providers.
 */
export async function callAiJson<T>(
  scope: string,
  system: string,
  user: string,
  opts?: AiOpts,
): Promise<T> {
  const provider = getProvider(scope);
  const model = opts?.model ?? getModel(scope);
  const t0 = Date.now();
  let ok = false;
  let err: string | null = null;
  let result: T;
  let usage: Usage | undefined;

  try {
    switch (provider) {
      case 'gemini': {
        const r = await callGeminiText(system, user, model, opts);
        usage = r.usage;
        const cleaned = r.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        result = JSON.parse(cleaned) as T;
        break;
      }
      case 'bedrock': {
        const r = await callBedrockText(system, user, model);
        usage = r.usage;
        const cleaned = r.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        result = JSON.parse(cleaned) as T;
        break;
      }
      case 'openai':
      default:
        result = await callOpenAiJson<T>(scope, system, user, opts);
        break;
    }
    ok = true;
    return result;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    writeAuditRecord({
      scope,
      provider,
      model,
      prompt_tokens: usage?.promptTokens ?? null,
      completion_tokens: usage?.completionTokens ?? null,
      cost_usd: computeCostUsd(provider, model, usage?.promptTokens, usage?.completionTokens),
      latency_ms: Date.now() - t0,
      ok,
      err,
    });
  }
}

/**
 * Call AI expecting plain text response. Handles all 3 providers.
 */
export async function callAiText(
  scope: string,
  system: string,
  user: string,
  opts?: AiOpts,
): Promise<string> {
  const provider = getProvider(scope);
  const model = opts?.model ?? getModel(scope);
  const t0 = Date.now();
  let ok = false;
  let err: string | null = null;
  let usage: Usage | undefined;

  try {
    let result: string;
    switch (provider) {
      case 'gemini': {
        const r = await callGeminiText(system, user, model, opts);
        usage = r.usage;
        result = r.text;
        break;
      }
      case 'bedrock': {
        const r = await callBedrockText(system, user, model);
        usage = r.usage;
        result = r.text;
        break;
      }
      case 'openai':
      default:
        result = await callOpenAiText(scope, system, user, opts);
        break;
    }
    ok = true;
    return result;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    writeAuditRecord({
      scope,
      provider,
      model,
      prompt_tokens: usage?.promptTokens ?? null,
      completion_tokens: usage?.completionTokens ?? null,
      cost_usd: computeCostUsd(provider, model, usage?.promptTokens, usage?.completionTokens),
      latency_ms: Date.now() - t0,
      ok,
      err,
    });
  }
}

/**
 * Call AI with image inputs (vision). Uses Gemini for gemini provider,
 * Bedrock for bedrock (Anthropic Claude), OpenAI for openai.
 */
export async function callAiVision(
  scope: string,
  prompt: string,
  images: ImageInput[],
  opts?: AiOpts,
): Promise<string> {
  const provider = getProvider(scope);
  const model = opts?.model ?? getModel(scope);
  const t0 = Date.now();
  let ok = false;
  let err: string | null = null;
  let usage: Usage | undefined;

  try {
    let result: string;
    switch (provider) {
      case 'gemini': {
        const r = await callGeminiVision('', prompt, images, model);
        usage = r.usage;
        result = r.text;
        break;
      }
      case 'bedrock': {
        assertBedrockEnv();
        const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime') as {
          BedrockRuntimeClient: new (opts: { region: string; credentials: { accessKeyId: string; secretAccessKey: string } }) => {
            send: (cmd: unknown) => Promise<{ body: Uint8Array }>;
          };
          InvokeModelCommand: new (opts: { modelId: string; contentType: string; accept: string; body: string }) => unknown;
        };

        const client = new BedrockRuntimeClient({
          region: process.env.AWS_REGION!,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
        });

        const content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }> = [
          { type: 'text', text: prompt },
          ...images.map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.data },
          })),
        ];

        const payload = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 4096,
          messages: [{ role: 'user', content }],
        };

        const cmd = new InvokeModelCommand({
          modelId: model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(payload),
        });

        const response = await client.send(cmd);
        const decoded = new TextDecoder().decode(response.body);
        const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }>; usage?: BedrockUsage };
        usage = extractBedrockUsage(parsed.usage);
        result = parsed.content?.[0]?.text ?? '';
        break;
      }
      case 'openai':
      default: {
        // ai-provider shim does NOT implement OpenAI vision. Pre-Wave γ
        // image-ocr.ts had its own ClipProxy-specific vision path; the shim
        // intentionally does not duplicate it. If you set <SCOPE>_PROVIDER=openai
        // for an image scope, you must either:
        //   (a) bypass the shim and call lib/openai.ts directly, OR
        //   (b) implement GPT-4o vision here (separate spec, not Wave γ scope).
        //
        // Failing loudly with throw is intentional — silent text-only fallback
        // would drop user-supplied images and look like working OCR while
        // returning garbage. ai_audit will record ok=false + the error.
        // QA finding C2 (Wave γ adversarial QA, 2026-05-05).
        throw new Error(
          `ai-provider: scope="${scope}" requested vision via openai but the openai branch is not implemented. ` +
          `Use <SCOPE>_PROVIDER=gemini for vision, or implement GPT-4o vision in lib/ai-provider.ts.`,
        );
      }
    }
    ok = true;
    return result;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    writeAuditRecord({
      scope,
      provider,
      model,
      prompt_tokens: usage?.promptTokens ?? null,
      completion_tokens: usage?.completionTokens ?? null,
      cost_usd: computeCostUsd(provider, model, usage?.promptTokens, usage?.completionTokens),
      latency_ms: Date.now() - t0,
      ok,
      err,
    });
  }
}

/**
 * Call AI for audio transcription/understanding.
 * For bedrock: uses Claude audio support.
 * For openai: throws (use Whisper API directly via lib/voice/whisper-transcribe.ts pre-Wave γ path).
 */
export async function callAiAudio(
  scope: string,
  audioBuffer: Buffer,
  opts?: AiOpts,
): Promise<string> {
  const provider = getProvider(scope);
  const model = opts?.model ?? getModel(scope);
  const t0 = Date.now();
  let ok = false;
  let err: string | null = null;
  let usage: Usage | undefined;

  try {
    let result: string;
    switch (provider) {
      case 'bedrock': {
        const r = await callBedrockAudio(audioBuffer, model);
        usage = r.usage;
        result = r.text;
        break;
      }
      case 'gemini': {
        assertGeminiEnv();
        const { GoogleGenAI } = require('@google/genai') as {
          GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
            models: {
              generateContent: (params: {
                model: string;
                contents: Array<{ role: string; parts: unknown[] }>;
              }) => Promise<{ text: string; usageMetadata?: GeminiUsageMetadata }>;
            };
          };
        };

        const ai = new GoogleGenAI({
          vertexai: true,
          project: process.env.GOOGLE_CLOUD_PROJECT!,
          location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
        });

        const audioBase64 = audioBuffer.toString('base64');
        const response = await ai.models.generateContent({
          model,
          contents: [{
            role: 'user',
            parts: [
              { text: 'Transcribe the following audio.' },
              { inlineData: { data: audioBase64, mimeType: 'audio/mp4' } },
            ],
          }],
        });
        usage = extractGeminiUsage(response.usageMetadata);
        result = response.text ?? '';
        break;
      }
      case 'openai':
      default:
        // ai-provider shim does NOT implement OpenAI audio (Whisper).
        // Pre-Wave γ voice-transcribe.ts called Whisper API directly; the shim
        // intentionally does not duplicate it. If you set WHATSAPP_VOICE_PROVIDER=openai,
        // call lib/voice/whisper-transcribe.ts directly instead of going through the shim.
        //
        // Failing loudly is intentional — silent empty-string fallback would
        // make every voice message look like a successful empty transcription.
        // QA finding C2 (Wave γ adversarial QA, 2026-05-05).
        throw new Error(
          `ai-provider: scope="${scope}" requested audio via openai but the openai branch is not implemented. ` +
          `Use <SCOPE>_PROVIDER=gemini for audio, or call lib/voice/whisper-transcribe.ts directly.`,
        );
    }
    ok = true;
    return result;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    writeAuditRecord({
      scope,
      provider,
      model,
      prompt_tokens: usage?.promptTokens ?? null,
      completion_tokens: usage?.completionTokens ?? null,
      cost_usd: computeCostUsd(provider, model, usage?.promptTokens, usage?.completionTokens),
      latency_ms: Date.now() - t0,
      ok,
      err,
    });
  }
}
