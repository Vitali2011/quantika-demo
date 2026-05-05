/**
 * Regression tests for lib/whatsapp/voice-transcribe.ts
 *
 * Covers:
 * - WHATSAPP_VOICE_PROVIDER=openai (rollback) → Whisper/OpenAI path
 * - WHATSAPP_VOICE_PROVIDER=gemini → callAiAudio shim path
 * - No provider set (default) → openai path
 * - LLMTimeoutError handling
 * - Audio URL download → buffer flow (gemini)
 */

// ─── Mocks — declared before any imports ─────────────────────────────────────

jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LLMTimeoutError';
    }
  },
}));

jest.mock('@/lib/ai-provider', () => ({
  callAiAudio: jest.fn(),
  getProvider: jest.fn(),
}));

// Mock global fetch for audio download (gemini path)
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Imports (after jest.mock declarations) ───────────────────────────────────

import { callAiText, LLMTimeoutError } from '@/lib/openai';
import { callAiAudio, getProvider } from '@/lib/ai-provider';
import { transcribeAudio } from '@/lib/whatsapp/voice-transcribe';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockCallAiAudio = callAiAudio as jest.MockedFunction<typeof callAiAudio>;
const mockGetProvider = getProvider as jest.MockedFunction<typeof getProvider>;

// ─── Shared helpers ───────────────────────────────────────────────────────────

const AUDIO_URL = 'https://example.com/media/audio.ogg';
const MIME_OGG = 'audio/ogg; codecs=opus';
const FAKE_AUDIO_BUFFER = Buffer.from('fake ogg audio data');

function mockSuccessfulDownload(buf: Buffer = FAKE_AUDIO_BUFFER): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(buf.buffer),
  } as unknown as Response);
}

function mockFailedDownload(status = 404): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Not Found',
  } as unknown as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WHATSAPP_VOICE_PROVIDER;
});

// ─── Tests: openai rollback path ──────────────────────────────────────────────

describe('transcribeAudio — openai provider (rollback)', () => {
  beforeEach(() => {
    process.env.WHATSAPP_VOICE_PROVIDER = 'openai';
    mockGetProvider.mockReturnValue('openai');
  });

  it('calls callAiText and returns transcribed text with language', async () => {
    mockCallAiText.mockResolvedValue('7500 mt steel coils from Istanbul to Lagos');

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('7500 mt steel coils from Istanbul to Lagos');
    expect(result.language).toBe('auto');
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    expect(mockCallAiAudio).not.toHaveBeenCalled();
  });

  it('returns empty text when callAiText returns empty string', async () => {
    mockCallAiText.mockResolvedValue('');

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
  });

  it('returns empty text on LLMTimeoutError (graceful degradation)', async () => {
    mockCallAiText.mockRejectedValue(new LLMTimeoutError('timeout'));

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
  });

  it('handles OGG/Opus mime type (WhatsApp default)', async () => {
    mockCallAiText.mockResolvedValue('cargo booking details');

    const result = await transcribeAudio('https://example.com/voice.ogg', 'audio/ogg');

    expect(result.text).toBe('cargo booking details');
  });

  it('handles M4A mime type', async () => {
    mockCallAiText.mockResolvedValue('m4a transcription');

    const result = await transcribeAudio('https://example.com/voice.m4a', 'audio/mp4');

    expect(result.text).toBe('m4a transcription');
  });
});

// ─── Tests: default path (no provider set) ────────────────────────────────────

describe('transcribeAudio — default provider (openai when unset)', () => {
  beforeEach(() => {
    // No WHATSAPP_VOICE_PROVIDER — shim falls back to openai
    mockGetProvider.mockReturnValue('openai');
  });

  it('falls through to openai path when no provider env set', async () => {
    mockCallAiText.mockResolvedValue('default path transcript');

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('default path transcript');
    expect(mockCallAiAudio).not.toHaveBeenCalled();
  });
});

// ─── Tests: gemini path ────────────────────────────────────────────────────────

describe('transcribeAudio — gemini provider', () => {
  beforeEach(() => {
    process.env.WHATSAPP_VOICE_PROVIDER = 'gemini';
    mockGetProvider.mockReturnValue('gemini');
  });

  it('downloads audio buffer and calls callAiAudio', async () => {
    mockSuccessfulDownload();
    mockCallAiAudio.mockResolvedValue('Arabic: shipment 5000 MT fertilizer Aqaba to Jeddah');

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('Arabic: shipment 5000 MT fertilizer Aqaba to Jeddah');
    expect(result.language).toBe('auto');
    expect(mockCallAiAudio).toHaveBeenCalledWith(
      'WHATSAPP_VOICE',
      expect.any(Buffer),
      expect.objectContaining({ model: expect.stringContaining('gemini') }),
    );
    expect(mockCallAiText).not.toHaveBeenCalled();
  });

  it('fetches the audio URL before calling callAiAudio', async () => {
    mockSuccessfulDownload();
    mockCallAiAudio.mockResolvedValue('transcript');

    await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(mockFetch).toHaveBeenCalledWith(AUDIO_URL);
  });

  it('handles OGG/Opus mime type (WhatsApp default) — gemini', async () => {
    mockSuccessfulDownload();
    mockCallAiAudio.mockResolvedValue('ogg transcription');

    const result = await transcribeAudio('https://example.com/voice.ogg', 'audio/ogg');

    expect(result.text).toBe('ogg transcription');
    expect(mockCallAiAudio).toHaveBeenCalledTimes(1);
  });

  it('returns empty text and language=auto on LLMTimeoutError (gemini)', async () => {
    mockSuccessfulDownload();
    mockCallAiAudio.mockRejectedValue(new LLMTimeoutError('gemini timeout'));

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
  });

  it('returns empty text when audio download returns non-ok status', async () => {
    mockFailedDownload(404);

    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
    expect(mockCallAiAudio).not.toHaveBeenCalled();
  });

  it('passes Arabic audio fixture — en/ar code-switching transcript', async () => {
    const arabicBuf = Buffer.from('arabic audio fixture data', 'utf8');
    mockSuccessfulDownload(arabicBuf);
    mockCallAiAudio.mockResolvedValue('5000 MT قمح من بيروت إلى جدة، laytime 48 hours');

    const result = await transcribeAudio('https://example.com/arabic-voice.ogg', 'audio/ogg');

    expect(result.text).toBe('5000 MT قمح من بيروت إلى جدة، laytime 48 hours');
  });
});
