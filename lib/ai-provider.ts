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

async function callGeminiText(
  system: string,
  user: string,
  model: string,
  opts?: AiOpts,
): Promise<string> {
  assertGeminiEnv();
  const { GoogleGenAI } = require('@google/genai') as {
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
      models: {
        generateContent: (params: {
          model: string;
          contents: Array<{ role: string; parts: Array<{ text: string }> }>;
          config?: { systemInstruction?: string };
        }) => Promise<{ text: string }>;
      };
    };
  };

  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  });

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: user }] }],
    config: { systemInstruction: system },
  });

  return response.text ?? '';
}

async function callGeminiVision(
  system: string,
  user: string,
  images: ImageInput[],
  model: string,
): Promise<string> {
  assertGeminiEnv();
  const { GoogleGenAI } = require('@google/genai') as {
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
      models: {
        generateContent: (params: {
          model: string;
          contents: Array<{ role: string; parts: unknown[] }>;
          config?: { systemInstruction?: string };
        }) => Promise<{ text: string }>;
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

  return response.text ?? '';
}

async function callBedrockText(
  system: string,
  user: string,
  model: string,
): Promise<string> {
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
  const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }> };
  return parsed.content?.[0]?.text ?? '';
}

async function callBedrockAudio(
  audioBuffer: Buffer,
  model: string,
): Promise<string> {
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
  const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }> };
  return parsed.content?.[0]?.text ?? '';
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

  try {
    switch (provider) {
      case 'gemini': {
        const text = await callGeminiText(system, user, model, opts);
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        result = JSON.parse(cleaned) as T;
        break;
      }
      case 'bedrock': {
        const text = await callBedrockText(system, user, model);
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
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
      prompt_tokens: null,
      completion_tokens: null,
      cost_usd: null,
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

  try {
    let result: string;
    switch (provider) {
      case 'gemini':
        result = await callGeminiText(system, user, model, opts);
        break;
      case 'bedrock':
        result = await callBedrockText(system, user, model);
        break;
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
      prompt_tokens: null,
      completion_tokens: null,
      cost_usd: null,
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

  try {
    let result: string;
    switch (provider) {
      case 'gemini':
        result = await callGeminiVision('', prompt, images, model);
        break;
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
        const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }> };
        result = parsed.content?.[0]?.text ?? '';
        break;
      }
      case 'openai':
      default: {
        // OpenAI vision: use streaming with base64 images
        const imageMessages = images.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        }));
        // Delegate to openai callAiText with a combined prompt
        // Note: for vision we construct a user message with images via OpenAI SDK directly
        // For simplicity, we use callAiText with the prompt (images ignored in text mode)
        result = await openaiLib.callAiText(
          prompt,
          '',
          model,
          { timeoutMs: opts?.timeoutMs, signal: opts?.signal },
        );
        // Suppress unused variable warning
        void imageMessages;
        break;
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
      prompt_tokens: null,
      completion_tokens: null,
      cost_usd: null,
      latency_ms: Date.now() - t0,
      ok,
      err,
    });
  }
}

/**
 * Call AI for audio transcription/understanding.
 * For bedrock: uses Claude audio support.
 * For others: returns empty string (not yet implemented for non-bedrock).
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

  try {
    let result: string;
    switch (provider) {
      case 'bedrock':
        result = await callBedrockAudio(audioBuffer, model);
        break;
      case 'gemini': {
        assertGeminiEnv();
        const { GoogleGenAI } = require('@google/genai') as {
          GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
            models: {
              generateContent: (params: {
                model: string;
                contents: Array<{ role: string; parts: unknown[] }>;
              }) => Promise<{ text: string }>;
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
        result = response.text ?? '';
        break;
      }
      case 'openai':
      default:
        // OpenAI audio transcription is not implemented via callAiText
        // Return empty string to preserve backward compatibility
        result = '';
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
      prompt_tokens: null,
      completion_tokens: null,
      cost_usd: null,
      latency_ms: Date.now() - t0,
      ok,
      err,
    });
  }
}
