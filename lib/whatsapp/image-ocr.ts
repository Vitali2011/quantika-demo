import { callAiText, LLMTimeoutError } from '@/lib/openai';

const OCR_SYSTEM_PROMPT =
  'Extract all text from this image. Return ONLY text, no commentary. Preserve original formatting.';

/**
 * Extracts text from an image using Vision API (multimodal GPT) via ClipProxy.
 *
 * γ-1: catches {@link LLMTimeoutError} and returns `''` so callers
 * (`parseForwardedMessage` empty-rawText guard) emit a `'missing'` confidence
 * response instead of bubbling the timeout into the WhatsApp webhook.
 */
export async function extractTextFromImage(imageUrl: string): Promise<string> {
  try {
    return await callAiText(
      `Extract text from this image: ${imageUrl}`,
      OCR_SYSTEM_PROMPT,
      undefined,
      { timeoutMs: 20_000 },
    );
  } catch (err) {
    if (err instanceof LLMTimeoutError) return '';
    throw err;
  }
}
