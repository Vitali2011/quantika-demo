/**
 * BUG-β-stab-03-EmptyRawText — guard against calling AI with empty rawText.
 * Spec mandates returning 'uncertain' BEFORE the AI call when OCR/audio/PDF
 * yields no text — saves OpenAI quota.
 */

const callAiJsonMock = jest.fn();
jest.mock('@/lib/openai', () => ({
  callAiJson: (...args: unknown[]) => callAiJsonMock(...args),
}));

jest.mock('@/lib/whatsapp/voice-transcribe', () => ({
  transcribeAudio: jest.fn().mockResolvedValue({ text: '' }),
}));
jest.mock('@/lib/whatsapp/image-ocr', () => ({
  extractTextFromImage: jest.fn().mockResolvedValue(''),
}));
jest.mock('@/lib/whatsapp/pdf-extract', () => ({
  extractTextFromPdf: jest.fn().mockResolvedValue(''),
}));

import { parseForwardedMessage } from '@/lib/whatsapp/forward-parser';
import type { WhatsAppClient } from '@/lib/whatsapp/client';
import type { WhatsAppIncomingMessage } from '@/lib/whatsapp/types';

const fakeClient: WhatsAppClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadMedia: jest.fn().mockResolvedValue({ url: 'http://x', mimeType: 'audio/ogg' }),
} as unknown as WhatsAppClient;

describe('BUG-β-stab-03 empty rawText guard', () => {
  beforeEach(() => callAiJsonMock.mockReset());

  it('returns uncertain without calling AI when image OCR yields empty string', async () => {
    const msg = {
      id: 'm1',
      type: 'image',
      image: { id: 'img1' },
    } as unknown as WhatsAppIncomingMessage;
    const out = await parseForwardedMessage(msg, fakeClient);
    expect(callAiJsonMock).not.toHaveBeenCalled();
    expect(out.confidence).toBe('uncertain');
    expect(out.rawText).toBe('');
  });

  it('returns uncertain without calling AI when text body is whitespace', async () => {
    const msg = {
      id: 'm2',
      type: 'text',
      text: { body: '   \n  ' },
    } as unknown as WhatsAppIncomingMessage;
    const out = await parseForwardedMessage(msg, fakeClient);
    expect(callAiJsonMock).not.toHaveBeenCalled();
    expect(out.confidence).toBe('uncertain');
  });
});
