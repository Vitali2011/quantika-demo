import { callAiText, LLMTimeoutError } from '@/lib/openai';

const WHISPER_SYSTEM_PROMPT =
  'You are a shipping cargo transcription assistant. ' +
  'Transcribe the audio accurately. Preserve numbers, port names, dates, and cargo details exactly. ' +
  'Support Arabic and English code-switching. Return ONLY the transcription text.';

/**
 * Transcribes an audio file (OGG/Opus, M4A) via Whisper-compatible API through ClipProxy.
 *
 * γ-1: catches {@link LLMTimeoutError} and returns empty text so the WhatsApp
 * webhook flow continues with an "ai_extraction_failed" missing-fields response
 * instead of bubbling the timeout to the caller.
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string,
): Promise<{ text: string; language: string }> {
  try {
    const text = await callAiText(
      `Transcribe the audio from: ${audioUrl}\nMIME type: ${mimeType}`,
      WHISPER_SYSTEM_PROMPT,
      undefined,
      { timeoutMs: 20_000 },
    );
    return { text, language: 'auto' };
  } catch (err) {
    if (err instanceof LLMTimeoutError) return { text: '', language: 'auto' };
    throw err;
  }
}
