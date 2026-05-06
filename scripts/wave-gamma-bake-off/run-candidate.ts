/**
 * Multi-model Gemini candidate runner for Wave γ parsing bake-off.
 *
 * Calls Vertex AI directly via `@google/genai` (rather than the
 * `lib/ai-provider.ts` shim) so we can return `usageMetadata` to the caller —
 * the shim's `callAiJson` only writes tokens to `ai_audit` and does not
 * surface them to its caller, which we need for per-call cost computation.
 *
 * The model id strings used here are the *display* ids from
 * `verification-plan.md`. Vertex AI accepts the GA 2.5-series unsuffixed
 * (2.5-pro/flash/flash-lite). Gemini 2.0 Flash, 2.0 Flash-Lite, and the 3.1
 * Flash-Lite Preview are NOT published to project `quantika-demo-2026` in any
 * region we tested (us-central1, us-east5, us-east4, us-west1, europe-west1,
 * europe-west4) — every variant (`-001`, `-exp`, `-latest`, etc.) returns 404
 * "Publisher Model not found or your project does not have access". They were
 * dropped from MODELS rather than left as perpetually-failing slots; restore
 * them once Google grants access (and update apiId to the ID that resolves).
 */

export interface ModelEntry {
  /** Display id used in reports & verification-plan tables. */
  id: string;
  /**
   * Model id passed to Vertex AI's `models.generateContent`. For now identical
   * to `id`; kept separate so we can pin a version suffix later (e.g.
   * `gemini-2.5-flash-001`) without touching report keys.
   */
  apiId: string;
  /** USD per 1,000,000 input tokens. */
  inputPerMTokens: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTokens: number;
}

export const MODELS: readonly ModelEntry[] = [
  { id: 'gemini-2.5-pro',                 apiId: 'gemini-2.5-pro',                 inputPerMTokens: 1.25,  outputPerMTokens: 10.0 },
  { id: 'gemini-2.5-flash',               apiId: 'gemini-2.5-flash',               inputPerMTokens: 0.30,  outputPerMTokens: 2.50 },
  { id: 'gemini-2.5-flash-lite',          apiId: 'gemini-2.5-flash-lite',          inputPerMTokens: 0.10,  outputPerMTokens: 0.40 },
  // Gemini 2.0 Flash / 2.0 Flash-Lite / 3.1 Flash-Lite Preview are NOT
  // accessible on project quantika-demo-2026 — see header comment.
] as const;

export interface RunCandidateInput {
  model: ModelEntry;
  systemPrompt: string;
  userInput: string;
  /** Defaults to 60_000 ms. */
  timeoutMs?: number;
}

export interface RunCandidateResult {
  outputText: string;
  outputJson: unknown | null;
  parseError?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  modelError?: string;
}

export function computeCostForModel(
  model: Pick<ModelEntry, 'inputPerMTokens' | 'outputPerMTokens'>,
  inputTokens: number,
  outputTokens: number,
): number {
  const cost =
    (inputTokens / 1_000_000) * model.inputPerMTokens +
    (outputTokens / 1_000_000) * model.outputPerMTokens;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Strip surrounding ```json fences (or plain ```), trim whitespace. */
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function tryParseJson(text: string): { json: unknown | null; error?: string } {
  try {
    return { json: JSON.parse(text) };
  } catch {
    /* fall through to fence-stripping retry */
  }
  try {
    return { json: JSON.parse(stripFences(text)) };
  } catch (e) {
    return { json: null, error: e instanceof Error ? e.message : String(e) };
  }
}

interface GenerateContentResponse {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface GoogleGenAIInstance {
  models: {
    generateContent: (params: {
      model: string;
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      config?: { systemInstruction?: string };
    }) => Promise<GenerateContentResponse>;
  };
}

function makeClient(): GoogleGenAIInstance {
  const { GoogleGenAI } = require('@google/genai') as {
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => GoogleGenAIInstance;
  };
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT ?? '',
    location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
  });
}

export async function runCandidate(input: RunCandidateInput): Promise<RunCandidateResult> {
  const { model, systemPrompt, userInput, timeoutMs = 60_000 } = input;
  const t0 = Date.now();

  const callPromise: Promise<GenerateContentResponse> = (async () => {
    const ai = makeClient();
    return ai.models.generateContent({
      model: model.apiId,
      contents: [{ role: 'user', parts: [{ text: userInput }] }],
      config: { systemInstruction: systemPrompt },
    });
  })();

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`runCandidate timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  let response: GenerateContentResponse;
  try {
    response = await Promise.race([callPromise, timeoutPromise]);
  } catch (e) {
    return {
      outputText: '',
      outputJson: null,
      latencyMs: Date.now() - t0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      modelError: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  const latencyMs = Date.now() - t0;
  const outputText = response.text ?? '';
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const costUsd = computeCostForModel(model, inputTokens, outputTokens);

  const parsed = tryParseJson(outputText);
  return {
    outputText,
    outputJson: parsed.json,
    parseError: parsed.error,
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd,
  };
}
