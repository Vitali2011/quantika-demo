import OpenAI from 'openai';
import { CLIPROXY_BASE_URL, CLIPROXY_API_KEY, AI_MODEL_HEAVY, AI_MODEL_LIGHT } from './constants';
import { logger } from '@/lib/logger';

const ai = new OpenAI({
  apiKey: CLIPROXY_API_KEY,
  baseURL: CLIPROXY_BASE_URL,
});

/** Thrown when an LLM call exceeds the configured timeout threshold. */
export class LLMTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

const DEFAULT_TIMEOUT_MS = 85_000;

/**
 * Optional per-call controls for LLM wrapper functions.
 * - `timeoutMs` — override the default abort window (default {@link DEFAULT_TIMEOUT_MS}).
 * - `signal` — caller-supplied AbortSignal that ALSO aborts the request when fired.
 *   Composes with the internal timeout: whichever fires first wins.
 */
export interface LlmCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Override SDK-level retry count for this request (OpenAI default: 2). */
  maxRetries?: number;
}

/**
 * Compose an internal timeout AbortController with an optional caller signal.
 * Returns the controller plus a cleanup that clears the timer.
 */
function buildAbortController(opts: LlmCallOptions | undefined): {
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

  // Compose: if caller passed an external signal, abort our controller when it fires.
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

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (err instanceof DOMException && err.name === 'AbortError')
  );
}

// Helper: call AI with streaming and parse JSON response
// ClipProxy returns content:null in non-streaming mode, so we use streaming
export async function callAiJson<T>(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_HEAVY,
  fallback: T,
  maxTokens: number = 16000,
  options?: LlmCallOptions,
): Promise<T> {
  const { controller, cleanup, timeoutMs } = buildAbortController(options);

  try {
    const stream = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: true,
      temperature: 0.1,
      max_tokens: maxTokens,
    }, { signal: controller.signal, maxRetries: options?.maxRetries });

    let content = '';
    for await (const chunk of stream) {
      if (controller.signal.aborted) {
        break;
      }
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) content += delta;
    }

    // Check if we aborted mid-stream
    if (controller.signal.aborted) {
      throw new LLMTimeoutError(`AI call timed out after ${timeoutMs / 1000}s`);
    }

    logger.debug({ model, contentLength: content.length }, '[AI] response received');

    // Strip markdown fences if present
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/,'').trim();
    if (!cleaned) {
      logger.error('[AI] Empty response after streaming');
      return fallback;
    }
    return JSON.parse(cleaned) as T;
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      throw err;
    }
    // AbortError from the signal — convert to LLMTimeoutError
    if (isAbortError(err)) {
      throw new LLMTimeoutError(`AI call timed out after ${timeoutMs / 1000}s`);
    }
    logger.error({ err }, 'AI JSON call failed');
    return fallback;
  } finally {
    cleanup();
  }
}

/**
 * Helper: call AI with streaming and get plain text response.
 *
 * Behavior:
 * - On success → returns the streamed text.
 * - On timeout (internal default 85s OR caller-supplied options.timeoutMs OR caller-supplied
 *   options.signal aborted) → throws {@link LLMTimeoutError}. Caller MUST catch
 *   if they want graceful behavior (e.g. HTTP 504, fallback string).
 * - On any other error → returns `''` (preserving the original lenient contract).
 *
 * **Why throw on timeout but not on other errors:** mirrors {@link callAiJson} so
 * that endpoints share a single fail-fast pattern for timeouts (Cloudflare 524
 * mitigation), without a breaking change to existing callers that just want
 * empty-string fallback for transient network noise.
 */
export async function callAiText(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_LIGHT,
  options?: LlmCallOptions,
): Promise<string> {
  const { controller, cleanup, timeoutMs } = buildAbortController(options);

  try {
    const stream = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: true,
      temperature: 0.3,
    }, { signal: controller.signal, maxRetries: options?.maxRetries });

    let content = '';
    for await (const chunk of stream) {
      if (controller.signal.aborted) {
        break;
      }
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) content += delta;
    }

    if (controller.signal.aborted) {
      throw new LLMTimeoutError(`AI call timed out after ${timeoutMs / 1000}s`);
    }

    return content;
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      throw err;
    }
    if (isAbortError(err)) {
      throw new LLMTimeoutError(`AI call timed out after ${timeoutMs / 1000}s`);
    }
    logger.error({ err }, 'AI text call failed');
    return '';
  } finally {
    cleanup();
  }
}
