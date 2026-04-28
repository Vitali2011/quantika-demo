import { callAiText } from '@/lib/openai';

const WHISPER_SYSTEM_PROMPT =
  'You are a shipping cargo transcription assistant. ' +
  'Transcribe the audio accurately. Preserve numbers, port names, dates, and cargo details exactly. ' +
  'Support Arabic and English code-switching. Return ONLY the transcription text.';

/**
 * Transcribes an audio file (OGG/Opus, M4A) via Whisper-compatible API through ClipProxy.
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string,
): Promise<{ text: string; language: string }> {
  const text = await callAiText(
    `Transcribe the audio from: ${audioUrl}\nMIME type: ${mimeType}`,
    WHISPER_SYSTEM_PROMPT,
  );

  return { text, language: 'auto' };
}
