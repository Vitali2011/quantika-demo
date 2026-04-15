import OpenAI from 'openai';
import { CLIPROXY_BASE_URL, CLIPROXY_API_KEY, AI_MODEL_HEAVY, AI_MODEL_LIGHT } from './constants';
import { logger } from '@/lib/logger';

export const ai = new OpenAI({
  apiKey: CLIPROXY_API_KEY,
  baseURL: CLIPROXY_BASE_URL,
});

export { AI_MODEL_HEAVY, AI_MODEL_LIGHT };

// Helper: call AI with streaming and parse JSON response
// ClipProxy returns content:null in non-streaming mode, so we use streaming
export async function callAiJson<T>(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_HEAVY,
  fallback: T
): Promise<T> {
  try {
    const stream = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: true,
      temperature: 0.1,
      max_tokens: 16000,
    });

    let content = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) content += delta;
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
    logger.error({ err }, 'AI JSON call failed');
    return fallback;
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
