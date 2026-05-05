import { callAiText, LLMTimeoutError } from '@/lib/openai';
import { callAiAudio, getProvider } from '@/lib/ai-provider';

const WHISPER_SYSTEM_PROMPT =
  'You are a shipping cargo transcription assistant. ' +
  'Transcribe the audio accurately. Preserve numbers, port names, dates, and cargo details exactly. ' +
  'Support Arabic and English code-switching. Return ONLY the transcription text.';

/** Default Gemini model for voice transcription (natively multimodal). */
const GEMINI_AUDIO_MODEL = 'gemini-2.0-flash';

/**
 * Transcribes a WhatsApp voice message (OGG/Opus, M4A).
 *
 * γv-08: provider routing via shim:
 *   - WHATSAPP_VOICE_PROVIDER=gemini → Gemini 2.0 Flash native audio input
 *     (downloads audio buffer from URL, passes to callAiAudio shim)
 *   - WHATSAPP_VOICE_PROVIDER=openai (default/rollback) → existing Whisper
 *     path via callAiText
 *
 * WhatsApp OGG/Opus is accepted natively by Gemini — no conversion needed.
 *
 * LLMTimeoutError is caught and returns empty text so the webhook flow
 * continues with an "ai_extraction_failed" missing-fields response.
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string,
): Promise<{ text: string; language: string }> {
  const provider = getProvider('WHATSAPP_VOICE');

  if (provider === 'gemini') {
    return transcribeWithGemini(audioUrl, mimeType);
  }

  // openai path (default + rollback)
  return transcribeWithOpenAi(audioUrl, mimeType);
}

/**
 * OpenAI/Whisper rollback path — unchanged behaviour from β-15.
 */
async function transcribeWithOpenAi(
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

/**
 * Gemini native audio path — downloads the audio buffer and passes it to
 * callAiAudio which uses Gemini 2.0 Flash multimodal input.
 *
 * Returns empty text if the download fails (network error / 4xx/5xx) so the
 * pipeline degrades gracefully instead of crashing the webhook.
 */
async function transcribeWithGemini(
  audioUrl: string,
  _mimeType: string,
): Promise<{ text: string; language: string }> {
  try {
    // Download audio to buffer — Gemini requires inline data, not a URL
    const res = await fetch(audioUrl);
    if (!res.ok) {
      return { text: '', language: 'auto' };
    }
    const arrayBuf = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);

    const text = await callAiAudio('WHATSAPP_VOICE', audioBuffer, {
      model: GEMINI_AUDIO_MODEL,
      timeoutMs: 30_000,
    });
    return { text, language: 'auto' };
  } catch (err) {
    if (err instanceof LLMTimeoutError) return { text: '', language: 'auto' };
    throw err;
  }
}
