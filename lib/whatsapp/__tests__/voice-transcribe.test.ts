import { transcribeAudio } from '../voice-transcribe';

// Mock the openai module
jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
}));

import { callAiText } from '@/lib/openai';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;

describe('transcribeAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Whisper API and returns transcribed text with language', async () => {
    mockCallAiText.mockResolvedValue('7500 mt steel coils from Istanbul to Lagos laycan 10-15 May');

    const result = await transcribeAudio(
      'https://example.com/media/audio.ogg',
      'audio/ogg; codecs=opus',
    );

    expect(result.text).toBe('7500 mt steel coils from Istanbul to Lagos laycan 10-15 May');
    expect(result.language).toBe('auto');
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
  });

  it('handles OGG/Opus mime type (WhatsApp default)', async () => {
    mockCallAiText.mockResolvedValue('test transcription');

    const result = await transcribeAudio(
      'https://example.com/media/voice.ogg',
      'audio/ogg',
    );

    expect(result.text).toBe('test transcription');
  });

  it('handles M4A mime type', async () => {
    mockCallAiText.mockResolvedValue('m4a transcription');

    const result = await transcribeAudio(
      'https://example.com/media/voice.m4a',
      'audio/mp4',
    );

    expect(result.text).toBe('m4a transcription');
  });

  it('returns empty text on API failure', async () => {
    mockCallAiText.mockResolvedValue('');

    const result = await transcribeAudio(
      'https://example.com/media/audio.ogg',
      'audio/ogg',
    );

    expect(result.text).toBe('');
  });
});
