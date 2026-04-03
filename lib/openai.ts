import OpenAI from 'openai';
import { CLIPROXY_BASE_URL, CLIPROXY_API_KEY, AI_MODEL_HEAVY, AI_MODEL_LIGHT } from './constants';

export const ai = new OpenAI({
  apiKey: CLIPROXY_API_KEY,
  baseURL: CLIPROXY_BASE_URL,
});

export { AI_MODEL_HEAVY, AI_MODEL_LIGHT };

// Helper: call AI and parse JSON response
export async function callAiJson<T>(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_HEAVY,
  fallback: T
): Promise<T> {
  try {
    const response = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });
    
    const content = response.choices[0]?.message?.content || '';
    return JSON.parse(content) as T;
  } catch (err) {
    console.error('AI JSON call failed:', err);
    return fallback;
  }
}

// Helper: call AI and get plain text response
export async function callAiText(
  prompt: string,
  systemPrompt: string,
  model: string = AI_MODEL_LIGHT
): Promise<string> {
  try {
    const response = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('AI text call failed:', err);
    return '';
  }
}
