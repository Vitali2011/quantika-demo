import { parseForwardedMessage } from '../forward-parser';
import type { ForwardParseResult } from '../forward-parser';
import { MockWhatsAppClient } from '../__mocks__/client';
import type { WhatsAppIncomingMessage } from '../types';

// Mock all sub-modules
jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
  callAiText: jest.fn(),
}));

jest.mock('../voice-transcribe', () => ({
  transcribeAudio: jest.fn(),
}));

jest.mock('../image-ocr', () => ({
  extractTextFromImage: jest.fn(),
}));

jest.mock('../pdf-extract', () => ({
  extractTextFromPdf: jest.fn(),
}));

import { callAiJson } from '@/lib/openai';
import { transcribeAudio } from '../voice-transcribe';
import { extractTextFromImage } from '../image-ocr';
import { extractTextFromPdf } from '../pdf-extract';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;
const mockTranscribeAudio = transcribeAudio as jest.MockedFunction<typeof transcribeAudio>;
const mockExtractTextFromImage = extractTextFromImage as jest.MockedFunction<typeof extractTextFromImage>;
const mockExtractTextFromPdf = extractTextFromPdf as jest.MockedFunction<typeof extractTextFromPdf>;

function makeMessage(overrides: Partial<WhatsAppIncomingMessage>): WhatsAppIncomingMessage {
  return {
    id: 'wamid.test001',
    from: '+971501234567',
    timestamp: '1714000000',
    type: 'text',
    ...overrides,
  };
}

const MOCK_PARSED_CARGO = {
  origin_port: { value: 'Istanbul', confidence: 'confirmed' },
  destination_port: { value: 'Lagos', confidence: 'confirmed' },
  cargo_description: { value: 'Steel coils', confidence: 'confirmed' },
  weight_mt: { value: 7500, confidence: 'confirmed' },
  laycan: '10-15 May',
  missing_info: [],
};

describe('parseForwardedMessage', () => {
  let client: MockWhatsAppClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MockWhatsAppClient();
    // Default: AI returns a parsed cargo
    mockCallAiJson.mockResolvedValue(MOCK_PARSED_CARGO);
  });

  it('parses text messages directly via AI', async () => {
    const msg = makeMessage({
      type: 'text',
      text: { body: '7500 mt steel coils Istanbul to Lagos laycan 10-15 May' },
    });

    const result: ForwardParseResult = await parseForwardedMessage(msg, client as never);

    expect(result.rawText).toBe('7500 mt steel coils Istanbul to Lagos laycan 10-15 May');
    expect(result.parsedCargo).toBeDefined();
    expect(result.confidence).toBeDefined();
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
  });

  it('parses image messages via OCR then AI', async () => {
    mockExtractTextFromImage.mockResolvedValue('OCR: 5000 mt wheat Novorossiysk to Alexandria');

    const msg = makeMessage({
      type: 'image',
      image: { id: 'media-img-1', mime_type: 'image/jpeg', sha256: 'abc' },
    });

    const result = await parseForwardedMessage(msg, client as never);

    expect(mockExtractTextFromImage).toHaveBeenCalledTimes(1);
    expect(result.rawText).toBe('OCR: 5000 mt wheat Novorossiysk to Alexandria');
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
  });

  it('parses audio messages via Whisper then AI', async () => {
    mockTranscribeAudio.mockResolvedValue({
      text: 'Transcribed: 3000 mt rice Bangkok to Jeddah',
      language: 'en',
    });

    const msg = makeMessage({
      type: 'audio',
      audio: { id: 'media-audio-1', mime_type: 'audio/ogg', sha256: 'def' },
    });

    const result = await parseForwardedMessage(msg, client as never);

    expect(mockTranscribeAudio).toHaveBeenCalledTimes(1);
    expect(result.rawText).toBe('Transcribed: 3000 mt rice Bangkok to Jeddah');
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
  });

  it('parses document (PDF) messages via pdf-extract then AI', async () => {
    mockExtractTextFromPdf.mockResolvedValue('PDF text: 10000 mt cement Aqaba to Mombasa');

    const msg = makeMessage({
      type: 'document',
      document: { id: 'media-doc-1', mime_type: 'application/pdf', sha256: 'ghi' },
    });

    const result = await parseForwardedMessage(msg, client as never);

    expect(mockExtractTextFromPdf).toHaveBeenCalledTimes(1);
    expect(result.rawText).toBe('PDF text: 10000 mt cement Aqaba to Mombasa');
    expect(mockCallAiJson).toHaveBeenCalledTimes(1);
  });

  it('returns missing fields from AI response', async () => {
    mockCallAiJson.mockResolvedValue({
      ...MOCK_PARSED_CARGO,
      missing_info: ['laycan', 'commission'],
    });

    const msg = makeMessage({
      type: 'text',
      text: { body: 'steel coils Istanbul to Lagos' },
    });

    const result = await parseForwardedMessage(msg, client as never);

    expect(result.missingFields).toContain('laycan');
    expect(result.missingFields).toContain('commission');
  });

  it('handles empty text gracefully', async () => {
    mockCallAiJson.mockResolvedValue({});

    const msg = makeMessage({
      type: 'text',
      text: { body: '' },
    });

    const result = await parseForwardedMessage(msg, client as never);

    expect(result.rawText).toBe('');
    expect(result.confidence).toBe('uncertain');
  });
});
