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

const DEFAULT_TIMEOUT_MS = 85_000;

/**
 * Compose an internal timeout AbortController with an optional caller-supplied
 * signal. Mirrors lib/openai.ts `buildAbortController` so gemini/bedrock get the
 * same abort+timeout semantics the openai branch already has.
 *
 * Returns the controller (its `.signal` is what providers must thread through),
 * the resolved timeoutMs, and a `cleanup()` that clears the timer + detaches the
 * external listener. Whichever of {internal timeout, external signal} fires
 * first aborts the controller.
 */
function buildAbortController(opts: AiOpts | undefined): {
  controller: AbortController;
  cleanup: () => void;
  timeoutMs: number;
} {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  if (typeof (timeoutId as NodeJS.Timeout).unref === 'function') {
    (timeoutId as NodeJS.Timeout).unref();
  }

  const externalSignal = opts?.signal;
  let externalListener: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalListener = () => controller.abort();
      externalSignal.addEventListener('abort', externalListener);
    }
  }

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (externalSignal && externalListener) {
      externalSignal.removeEventListener('abort', externalListener);
    }
  };

  return { controller, cleanup, timeoutMs };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = 'openai' | 'gemini' | 'bedrock' | 'claude-cli';

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
  /**
   * Gemini structured-output schema (Vertex AI `responseSchema`).
   * When provided AND provider=gemini, the SDK sends `responseMimeType:
   * 'application/json'` + `responseSchema` — guaranteeing valid JSON
   * without markdown fences. Ignored for other providers.
   */
  responseSchema?: Record<string, unknown>;
  /** Sampling temperature 0..1. 0 = greedy/deterministic. Default: provider default. */
  temperature?: number;
  /** Top-p nucleus sampling. Default: provider default. */
  topP?: number;
  /** Top-k sampling (Gemini only). Default: provider default. */
  topK?: number;
  /** Random seed for reproducibility (Gemini Vertex AI supports). */
  seed?: number;
  /**
   * Maximum number of retries on transient failures (e.g. 429, 503).
   * - Gemini: maps to httpOptions.retryOptions.attempts (attempts = maxRetries + 1). SDK default: 4 retries.
   * - OpenAI: maps to per-request maxRetries option. SDK default: 2 retries.
   * - Bedrock: no SDK-level retries; not used.
   * Set to 1 for latency-sensitive scopes (e.g. PARSE_VESSEL) to avoid retry storms on slow responses.
   */
  maxRetries?: number;
  /** Max USD budget per claude-cli call (default: 0.05). Only used by claude-cli provider. */
  maxBudgetUsd?: number;
}

/**
 * Returns sampling-related fields for Gemini `generateContent` config.
 * Only includes fields that are explicitly provided (no defaults).
 */
export function buildGeminiSamplingFields(opts: AiOpts): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  if (opts.temperature !== undefined) cfg.temperature = opts.temperature;
  if (opts.topP !== undefined) cfg.topP = opts.topP;
  if (opts.topK !== undefined) cfg.topK = opts.topK;
  if (opts.seed !== undefined) cfg.seed = opts.seed;
  if (opts.maxTokens !== undefined) cfg.maxOutputTokens = opts.maxTokens;
  return cfg;
}

/**
 * Returns sampling-related fields for Bedrock Anthropic payload.
 * Maps camelCase AiOpts → Anthropic API snake_case names.
 */
export function buildBedrockSamplingFields(opts: AiOpts): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    max_tokens: opts.maxTokens ?? 16000,
  };
  if (opts.temperature !== undefined) cfg.temperature = opts.temperature;
  if (opts.topP !== undefined) cfg.top_p = opts.topP;
  return cfg;
}

/**
 * Returns Gemini httpOptions with retryOptions when maxRetries is set.
 * Gemini SDK retryOptions.attempts includes the initial call, so attempts = maxRetries + 1.
 * Returns undefined when maxRetries is not specified (SDK uses its default of 5 attempts).
 */
export function buildGeminiHttpOptions(
  opts: AiOpts,
): { retryOptions?: { attempts?: number } } | undefined {
  if (opts.maxRetries === undefined) return undefined;
  return { retryOptions: { attempts: opts.maxRetries + 1 } };
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
  // Claude Opus 4.7 — AWS Bedrock direct inference (no cross-region us./eu./global. prefix)
  'bedrock:anthropic.claude-opus-4-7': { in: 15, out: 75 },
  // Claude Sonnet 4.6 — cost-optimized alternative: ~5× cheaper than Opus 4.7
  // Per-scope override: MATCH_MODEL=anthropic.claude-sonnet-4-6 (with MATCH_PROVIDER=bedrock)
  'bedrock:anthropic.claude-sonnet-4-6': { in: 3, out: 15 },
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

// ─── JSON extraction helper ───────────────────────────────────────────────────

/**
 * Strip chain-of-thought preamble, markdown fences, and trailing junk from
 * an LLM response to yield clean JSON suitable for `JSON.parse()`.
 *
 * Why: Bedrock Claude Sonnet 4.6 routinely emits CoT-style preamble before
 * JSON ("I'll systematically work through this..."), which breaks naive
 * `JSON.parse(raw)`. ai_audit (2026-05-13) shows 9/10 MATCH failures in 24h
 * with signature `Unexpected token 'I', "I'll syste"...`. This helper is the
 * defensive parser applied before `JSON.parse` in `callAiJson` for the
 * Bedrock provider (and Gemini fallback when no responseSchema is used).
 *
 * Algorithm:
 *   1. Trim whitespace.
 *   2. If wrapped in ```...``` fence (with optional `json` tag), unwrap.
 *   3. Locate first `{` or `[`, slice from there.
 *   4. Walk characters, respecting string literals + escape sequences,
 *      tracking brace/bracket depth; cut at matching close.
 *
 * @throws if input is empty, non-string, or contains no JSON-looking start char.
 */
export function extractJson(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('extractJson: empty or non-string input');
  }

  let s = raw.trim();
  if (s.length === 0) {
    throw new Error('extractJson: empty input after trim');
  }

  // Strip a wrapping markdown fence if the whole thing is fenced.
  // We do not handle nested fences — only outermost.
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }

  // Find first `{` or `[` (whichever appears earliest).
  const firstBrace = s.indexOf('{');
  const firstBracket = s.indexOf('[');
  const candidates = [firstBrace, firstBracket].filter((i) => i >= 0);
  if (candidates.length === 0) {
    throw new Error(
      `extractJson: no JSON-looking start char ({ or [) found in: ${raw.slice(0, 100)}`,
    );
  }
  const start = Math.min(...candidates);
  s = s.slice(start);

  // Balance braces/brackets to find the matching closing token.
  // Respect string boundaries and escape characters so that `}` inside a
  // JSON string literal doesn't cut us off early.
  const openChar = s[0];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === openChar) {
      depth++;
    } else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    // Unbalanced — return what we have; JSON.parse downstream will surface a
    // clearer "Unexpected end of JSON input" error with the real reason.
    return s;
  }

  return s.slice(0, endIdx + 1);
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

interface ClaudeCliOutput {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
}

/**
 * Calls the claude CLI via spawnSync for judge/eval workloads.
 * Auth: CLAUDE_CODE_OAUTH_TOKEN picked up automatically by the claude CLI.
 * Exported for unit testing (mock spawnSync in tests).
 *
 * Set *_JUDGE_PROVIDER=claude-cli (or AI_PROVIDER=claude-cli) to route judge
 * scopes (CLASSIFY_JUDGE, PARSE_CARGO_JUDGE, PARSE_VESSEL_JUDGE) here instead
 * of Bedrock, eliminating AWS credentials for eval runs.
 */
export function callClaudeCliRaw(
  system: string,
  user: string,
  model: string,
  opts?: AiOpts,
): { text: string } {
  if (process.env.NEXT_RUNTIME) {
    throw new Error(
      "claude-cli provider must not be used in Next.js runtime (request handlers). " +
      "spawnSync blocks the event loop for up to 85s. " +
      "Use claude-cli only in eval scripts (scripts/progonq/, scripts/eval/)."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { spawnSync } = require('child_process') as typeof import('child_process');

  const budget = opts?.maxBudgetUsd ?? 0.05;
  const args = ['--print', '--model', model, '--output-format', 'json', '--max-budget-usd', String(budget)];
  if (system) {
    args.push('--system-prompt', system);
  }

  const result = spawnSync('claude', args, {
    input: user,
    encoding: 'utf8',
    timeout: opts?.timeoutMs ?? 85_000,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });

  if (result.error) {
    throw new Error(`claude CLI spawn error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    throw new Error(
      `claude CLI exited with status ${result.status}: ${stderr.slice(0, 200)}`,
    );
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  let parsed: ClaudeCliOutput;
  try {
    parsed = JSON.parse(stdout) as ClaudeCliOutput;
  } catch {
    return { text: stdout };
  }

  if (parsed.is_error) {
    throw new Error(`claude CLI returned error response: ${parsed.result ?? 'unknown'}`);
  }

  return { text: parsed.result ?? '' };
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
  if (raw !== 'openai' && raw !== 'gemini' && raw !== 'bedrock' && raw !== 'claude-cli') {
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
      return process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-opus-4-7';
    case 'claude-cli':
      return 'claude-opus-4-7';
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
    { timeoutMs: opts?.timeoutMs, signal: opts?.signal, maxRetries: opts?.maxRetries },
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
    { timeoutMs: opts?.timeoutMs, signal: opts?.signal, maxRetries: opts?.maxRetries },
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
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string; httpOptions?: { retryOptions?: { attempts?: number } } }) => {
      models: {
        generateContent: (params: {
          model: string;
          contents: Array<{ role: string; parts: Array<{ text: string }> }>;
          config?: {
            systemInstruction?: string;
            thinkingConfig?: { thinkingBudget: number; includeThoughts: boolean };
            responseMimeType?: string;
            responseSchema?: Record<string, unknown>;
            temperature?: number;
            topP?: number;
            topK?: number;
            seed?: number;
            abortSignal?: AbortSignal;
          };
        }) => Promise<{ text: string; usageMetadata?: GeminiUsageMetadata }>;
      };
    };
  };

  const geminiHttpOpts = opts ? buildGeminiHttpOptions(opts) : undefined;
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT!,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    ...(geminiHttpOpts ? { httpOptions: geminiHttpOpts } : {}),
  });

  // Build config — handle both Deep Think (thinkingConfig) and structured output (responseSchema).
  // Each is opt-in: omit thinkingConfig → default Pro behavior; omit responseSchema → free-form text.
  const config: {
    systemInstruction?: string;
    thinkingConfig?: { thinkingBudget: number; includeThoughts: boolean };
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    topK?: number;
    seed?: number;
    abortSignal?: AbortSignal;
  } = { systemInstruction: system };

  if (opts?.thinkingBudget !== undefined) {
    config.thinkingConfig = {
      thinkingBudget: opts.thinkingBudget,
      includeThoughts: false, // Keep response clean — thoughts are internal only
    };
  }

  if (opts?.responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = opts.responseSchema;
  }

  Object.assign(config, buildGeminiSamplingFields(opts ?? {}));

  // Thread abortSignal + timeoutMs: compose the caller's signal with an internal
  // timeout controller. The composed signal is passed to the SDK so a
  // client-disconnect (caller signal) OR the timeout actually CANCELS the
  // in-flight Vertex request instead of leaking it. The Promise.race below still
  // surfaces a typed LLMTimeoutError to the caller on timeout.
  const { controller, cleanup, timeoutMs } = buildAbortController(opts);
  config.abortSignal = controller.signal;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new openaiLib.LLMTimeoutError(`Gemini timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: user }] }],
        config,
      }),
      timeoutPromise,
    ]);
    return { text: response.text ?? '', usage: extractGeminiUsage(response.usageMetadata) };
  } catch (err) {
    // If the composed signal aborted (caller disconnect OR timeout), surface a
    // typed LLMTimeoutError so route-level `instanceof LLMTimeoutError` handling
    // (504 response) is reachable on the gemini path — previously dead code.
    if (controller.signal.aborted && !(err instanceof openaiLib.LLMTimeoutError)) {
      throw new openaiLib.LLMTimeoutError(`Gemini aborted after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
    cleanup();
  }
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
  opts?: AiOpts,
): Promise<{ text: string; usage?: Usage }> {
  assertBedrockEnv();
  const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime') as {
    BedrockRuntimeClient: new (opts: {
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
      requestHandler?: { requestTimeout?: number };
    }) => {
      send: (cmd: unknown, options?: { abortSignal?: AbortSignal }) => Promise<{ body: Uint8Array }>;
    };
    InvokeModelCommand: new (opts: { modelId: string; contentType: string; accept: string; body: string }) => unknown;
  };

  // Thread abortSignal + timeoutMs: compose caller signal with internal timeout.
  // - requestHandler.requestTimeout caps the socket-level wait at timeoutMs.
  // - client.send(cmd, { abortSignal }) cancels the in-flight request when the
  //   composed signal fires (caller disconnect OR timeout) — previously BOTH
  //   were dropped, so MATCH_PROVIDER=bedrock calls could hang up to maxDuration.
  const { controller, cleanup, timeoutMs } = buildAbortController(opts);

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    requestHandler: { requestTimeout: timeoutMs },
  });

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    ...buildBedrockSamplingFields(opts ?? {}),
    // cache_control on the system block: Anthropic prompt caching bills the
    // large static prefix (e.g. MATCH_PROMPT ~6956 tok) at the cheaper cache-read
    // rate on warm hits. `system` accepts a content-block array; the ephemeral
    // breakpoint marks everything up to here as cacheable.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };

  const cmd = new InvokeModelCommand({
    modelId: model,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  try {
    const response = await client.send(cmd, { abortSignal: controller.signal });
    const decoded = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(decoded) as { content: Array<{ text?: string }>; usage?: BedrockUsage };
    return { text: parsed.content?.[0]?.text ?? '', usage: extractBedrockUsage(parsed.usage) };
  } catch (err) {
    // Surface a typed LLMTimeoutError on abort/timeout so route-level
    // `instanceof LLMTimeoutError` (504) is reachable on the bedrock path.
    if (controller.signal.aborted && !(err instanceof openaiLib.LLMTimeoutError)) {
      throw new openaiLib.LLMTimeoutError(`Bedrock aborted after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    cleanup();
  }
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
        // When responseSchema is provided, Gemini returns clean JSON — parse directly.
        // Otherwise apply extractJson to strip any CoT preamble / fences.
        const raw = opts?.responseSchema ? r.text.trim() : extractJson(r.text);
        result = JSON.parse(raw) as T;
        break;
      }
      case 'bedrock': {
        const r = await callBedrockText(system, user, model, opts);
        usage = r.usage;
        // Bedrock Claude (esp. Sonnet 4.6) often emits CoT preamble before JSON.
        // extractJson strips preamble + fences + trailing junk before parse.
        result = JSON.parse(extractJson(r.text)) as T;
        break;
      }
      case 'claude-cli': {
        const r = callClaudeCliRaw(system, user, model, opts);
        result = JSON.parse(extractJson(r.text)) as T;
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
        const r = await callBedrockText(system, user, model, opts);
        usage = r.usage;
        result = r.text;
        break;
      }
      case 'claude-cli': {
        const r = callClaudeCliRaw(system, user, model, opts);
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
