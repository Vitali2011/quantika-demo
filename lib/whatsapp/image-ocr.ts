import { callAiText } from '@/lib/openai';

const OCR_SYSTEM_PROMPT =
  'Extract all text from this image. Return ONLY text, no commentary. Preserve original formatting.';

/**
 * Extracts text from an image using Vision API (multimodal GPT) via ClipProxy.
 */
export async function extractTextFromImage(imageUrl: string): Promise<string> {
  return callAiText(
    `Extract text from this image: ${imageUrl}`,
    OCR_SYSTEM_PROMPT,
  );
}
