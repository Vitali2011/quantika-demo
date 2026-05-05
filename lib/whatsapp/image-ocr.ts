import { callAiVision } from '@/lib/ai-provider';
import type { ImageInput } from '@/lib/ai-provider';
import { callAiText, LLMTimeoutError } from '@/lib/openai';

export type { ImageInput };

const OCR_SYSTEM_PROMPT =
  'Extract all text from this image. Return ONLY text, no commentary. Preserve original formatting.';

const OCR_SCOPE = 'WHATSAPP_OCR';

/**
 * Fetch a URL and return base64-encoded data + MIME type.
 * Used when the provider is Gemini Vision (requires inline image data).
 */
async function fetchImageAsBase64(
  url: string,
  fallbackMimeType = 'image/jpeg',
): Promise<ImageInput> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status} ${url}`);
  }
  const contentType = res.headers.get('content-type') ?? fallbackMimeType;
  const mimeType = contentType.split(';')[0].trim() || fallbackMimeType;
  const arrayBuffer = await res.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString('base64');
  return { data, mimeType };
}

/**
 * Parse a data URI into an ImageInput.
 * Supports `data:<mimeType>;base64,<data>` format.
 */
function parseDataUri(uri: string): ImageInput | null {
  const match = uri.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

/**
 * Resolves a URL or data URI to an ImageInput (base64 + mimeType).
 * For data URIs — parses inline. For HTTP URLs — fetches and converts.
 */
async function resolveToImageInput(url: string, mimeType?: string): Promise<ImageInput> {
  if (url.startsWith('data:')) {
    const parsed = parseDataUri(url);
    if (parsed) return parsed;
    throw new Error(`Invalid data URI: ${url.slice(0, 50)}...`);
  }
  return fetchImageAsBase64(url, mimeType ?? 'image/jpeg');
}

/**
 * Extracts text from multiple images in a single batch call via Gemini Vision (or rollback to OpenAI).
 *
 * Multi-image batch: 2-5 images in one call for cost optimization.
 * Rollback: set WHATSAPP_OCR_PROVIDER=openai in env to revert to text-based path.
 *
 * @param images - Array of ImageInput (base64 data + mimeType)
 * @param opts   - Optional timeout/signal/model overrides
 */
export async function extractTextFromImages(
  images: ImageInput[],
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<string> {
  if (images.length === 0) return '';

  const prompt =
    images.length === 1
      ? `Extract all text from this image. Return ONLY the text, no commentary. Preserve original formatting.`
      : `Extract all text from these ${images.length} images. Return ONLY the text from all images combined, no commentary. Preserve original formatting.`;

  return callAiVision(OCR_SCOPE, prompt, images, {
    timeoutMs: opts?.timeoutMs ?? 20_000,
    signal: opts?.signal,
  });
}

/**
 * Extracts text from an image using Vision API via the AI provider shim.
 *
 * Default provider: Gemini Vision (gemini-2.5-flash).
 * Rollback: set WHATSAPP_OCR_PROVIDER=openai → uses ClipProxy text path.
 *
 * Accepts:
 * - HTTP/HTTPS URL (fetched and converted to base64 for Gemini)
 * - data URI (inline base64, e.g. from pdf-extract)
 *
 * γ-1: catches {@link LLMTimeoutError} and returns `''` so callers
 * (`parseForwardedMessage` empty-rawText guard) emit a `'missing'` confidence
 * response instead of bubbling the timeout into the WhatsApp webhook.
 *
 * @param imageUrl  - HTTP URL or data URI of the image
 * @param mimeType  - Optional MIME type hint for HTTP URLs (default: 'image/jpeg')
 */
export async function extractTextFromImage(
  imageUrl: string,
  mimeType?: string,
): Promise<string> {
  try {
    // Check if openai rollback is active — use legacy text path to avoid fetch overhead
    const provider = process.env.WHATSAPP_OCR_PROVIDER ?? process.env.AI_PROVIDER ?? 'openai';
    if (provider === 'openai') {
      return await callAiText(
        `Extract text from this image: ${imageUrl}`,
        OCR_SYSTEM_PROMPT,
        undefined,
        { timeoutMs: 20_000 },
      );
    }

    const image = await resolveToImageInput(imageUrl, mimeType);
    return await extractTextFromImages([image], { timeoutMs: 20_000 });
  } catch (err) {
    if (err instanceof LLMTimeoutError) return '';
    throw err;
  }
}
