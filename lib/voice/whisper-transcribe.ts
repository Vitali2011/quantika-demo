/**
 * β-15: Whisper API wrapper with deterministic mock fallback.
 *
 * - Real path: when OPENAI_API_KEY is present, posts the audio buffer to
 *   OpenAI's transcription endpoint and returns the transcript.
 * - Mock path: when no key (tests, local demo), returns a deterministic
 *   stub. This keeps tests offline and reproducible.
 *
 * The function never throws on missing key — it falls through to mock so
 * the pipeline keeps moving in demo environments.
 */

export interface TranscribeResult {
  text: string;
  durationSec: number;
}

const MOCK_TRANSCRIPT =
  'Voice memo for vessel MV CONSTANTINE STAR at port Aqaba. ' +
  'Arrival UTC 2026-09-18T09:00:00Z. Laytime allowed 72 hours. ' +
  'Laytime used 90 hours. Demurrage rate 8500 USD per day. ' +
  'Event 1 at 09:00 NOR tendered. Event 2 at 12:00 discharge commenced.';

export async function transcribeAudio(
  file: Buffer,
  mime: string,
): Promise<TranscribeResult> {
  if (!process.env.OPENAI_API_KEY) {
    // Deterministic offline fallback. durationSec scales with buffer size
    // so distinct inputs produce distinct (but still synthetic) durations.
    return {
      text: MOCK_TRANSCRIPT,
      durationSec: Math.max(1, Math.round(file.length / 16)),
    };
  }
  // Real Whisper call — guarded by key check above.
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file)], { type: mime }), 'audio.bin');
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper API failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { text?: string; duration?: number };
  return {
    text: json.text ?? '',
    durationSec: json.duration ?? 0,
  };
}
