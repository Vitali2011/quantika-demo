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

const LLM_TIMEOUT_MS = 85_000;

// Helper: call AI with streaming and parse JSON response
// ClipProxy returns content:null in non-streaming mode, so we use streaming
export async function callAiJson<T>(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_HEAVY,
  fallback: T,
  maxTokens: number = 16000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, LLM_TIMEOUT_MS);
  // Unref so the timer does not keep the Node.js event loop alive in tests
  if (typeof (timeoutId as NodeJS.Timeout).unref === 'function') {
    (timeoutId as NodeJS.Timeout).unref();
  }

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
    }, { signal: controller.signal });

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
      throw new LLMTimeoutError(`AI scoring timed out after ${LLM_TIMEOUT_MS / 1000}s — try fewer pairs`);
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
    if (
      (err instanceof Error && err.name === 'AbortError') ||
      (err instanceof DOMException && err.name === 'AbortError')
    ) {
      throw new LLMTimeoutError(`AI scoring timed out after ${LLM_TIMEOUT_MS / 1000}s — try fewer pairs`);
    }
    logger.error({ err }, 'AI JSON call failed');
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper: call AI with streaming and get plain text response
export async function callAiText(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_LIGHT
): Promise<string> {
  try {
    const stream = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: true,
      temperature: 0.3,
    });

    let content = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) content += delta;
    }

    return content;
  } catch (err) {
    logger.error({ err }, 'AI text call failed');
    return '';
  }
}
