/**
 * Regression tests for lib/whatsapp/voice-transcribe.ts
 *
 * Covers:
 * - WHATSAPP_VOICE_PROVIDER=openai (rollback) → Whisper/OpenAI path
 * - WHATSAPP_VOICE_PROVIDER=gemini → callAiAudio shim path
 * - No provider set (default) → openai path
 * - LLMTimeoutError handling
 * - Audio URL download → buffer flow
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

// Mock global fetch for audio download
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { callAiText, LLMTimeoutError } from '@/lib/openai';
import { callAiAudio, getProvider } from '@/lib/ai-provider';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;
const mockCallAiAudio = callAiAudio as jest.MockedFunction<typeof callAiAudio>;
const mockGetProvider = getProvider as jest.MockedFunction<typeof getProvider>;

// ─── Setup ───────────────────────────────────────────────────────────────────

function setProvider(provider: 'openai' | 'gemini'): void {
  process.env.WHATSAPP_VOICE_PROVIDER = provider;
  mockGetProvider.mockReturnValue(provider);
}

function clearProvider(): void {
  delete process.env.WHATSAPP_VOICE_PROVIDER;
}

const FAKE_AUDIO_BUFFER = Buffer.from('fake ogg audio data');
const AUDIO_URL = 'https://example.com/media/audio.ogg';
const MIME_OGG = 'audio/ogg; codecs=opus';

function mockAudioFetch(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(FAKE_AUDIO_BUFFER.buffer),
  } as unknown as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  clearProvider();
});

afterEach(() => {
  clearProvider();
});

// ─── Tests: openai rollback path ──────────────────────────────────────────────

describe('transcribeAudio — openai provider (rollback)', () => {
  it('calls callAiText when WHATSAPP_VOICE_PROVIDER=openai', async () => {
    setProvider('openai');
    mockCallAiText.mockResolvedValue('7500 mt steel coils from Istanbul to Lagos');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('7500 mt steel coils from Istanbul to Lagos');
    expect(result.language).toBe('auto');
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    expect(mockCallAiAudio).not.toHaveBeenCalled();
  });

  it('returns empty text when callAiText returns empty (openai)', async () => {
    setProvider('openai');
    mockCallAiText.mockResolvedValue('');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
  });

  it('returns empty text on LLMTimeoutError (openai)', async () => {
    setProvider('openai');
    const { LLMTimeoutError: LLMErr } = require('@/lib/openai') as { LLMTimeoutError: typeof LLMTimeoutError };
    mockCallAiText.mockRejectedValue(new LLMErr('timeout'));

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
  });

  it('handles OGG/Opus mime type (WhatsApp default) — openai', async () => {
    setProvider('openai');
    mockCallAiText.mockResolvedValue('cargo booking details');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio('https://example.com/voice.ogg', 'audio/ogg');

    expect(result.text).toBe('cargo booking details');
  });

  it('handles M4A mime type — openai', async () => {
    setProvider('openai');
    mockCallAiText.mockResolvedValue('m4a transcription');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio('https://example.com/voice.m4a', 'audio/mp4');

    expect(result.text).toBe('m4a transcription');
  });
});

// ─── Tests: default path (no provider set) ────────────────────────────────────

describe('transcribeAudio — default provider (openai)', () => {
  it('defaults to openai path when no env set', async () => {
    // No provider set → default openai behaviour
    mockGetProvider.mockReturnValue('openai');
    mockCallAiText.mockResolvedValue('default path transcript');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('default path transcript');
    expect(mockCallAiAudio).not.toHaveBeenCalled();
  });
});

// ─── Tests: gemini path ────────────────────────────────────────────────────────

describe('transcribeAudio — gemini provider', () => {
  it('downloads audio buffer and calls callAiAudio when WHATSAPP_VOICE_PROVIDER=gemini', async () => {
    setProvider('gemini');
    mockAudioFetch();
    mockCallAiAudio.mockResolvedValue('Arabic: shipment 5000 MT fertilizer Aqaba to Jeddah');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
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

  it('passes ogg mime type (WhatsApp default) to callAiAudio — gemini', async () => {
    setProvider('gemini');
    mockAudioFetch();
    mockCallAiAudio.mockResolvedValue('ogg transcription');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio('https://example.com/voice.ogg', 'audio/ogg');

    expect(result.text).toBe('ogg transcription');
    expect(mockCallAiAudio).toHaveBeenCalledTimes(1);
  });

  it('returns empty text on LLMTimeoutError (gemini)', async () => {
    setProvider('gemini');
    mockAudioFetch();
    const { LLMTimeoutError: LLMErr } = require('@/lib/openai') as { LLMTimeoutError: typeof LLMTimeoutError };
    mockCallAiAudio.mockRejectedValue(new LLMErr('gemini timeout'));

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
  });

  it('returns empty text when audio download fails (gemini)', async () => {
    setProvider('gemini');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as unknown as Response);

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio(AUDIO_URL, MIME_OGG);

    expect(result.text).toBe('');
    expect(result.language).toBe('auto');
    expect(mockCallAiAudio).not.toHaveBeenCalled();
  });

  it('passes Arabic audio fixture (en/ar code-switching)', async () => {
    setProvider('gemini');
    const arabicAudioBuffer = Buffer.from('arabic audio fixture data', 'utf8');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(arabicAudioBuffer.buffer),
    } as unknown as Response);
    mockCallAiAudio.mockResolvedValue('5000 MT قمح من بيروت إلى جدة، laytime 48 hours');

    const { transcribeAudio } = await import('@/lib/whatsapp/voice-transcribe');
    const result = await transcribeAudio('https://example.com/arabic-voice.ogg', 'audio/ogg');

    expect(result.text).toBe('5000 MT قمح من بيروت إلى جدة، laytime 48 hours');
  });
});
