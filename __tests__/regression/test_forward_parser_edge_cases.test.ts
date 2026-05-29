/**
 * Adversarial regression tests for parseForwardedMessage edge cases.
 *
 * H11 (HIGH): Unknown message type (sticker, location, reaction, video, etc.)
 *   falls through the switch with rawText = ''. The function then calls
 *   callAiJson('', ...) — a wasted API round-trip with empty input.
 *   Expected correct behavior: early-return without calling callAiJson.
 *   If this test FAILS (callAiJson IS called), that is BUG-A4-1.
 *
 * H12: msg.type = 'text' but msg.text = undefined → rawText = ''.
 *   Should return confidence: 'uncertain', no crash.
 *
 * H13 (observation only): No size guard on rawText. Documented, not a crash.
 */

import { parseForwardedMessage } from '../../lib/whatsapp/forward-parser';
import type { ForwardParseResult } from '../../lib/whatsapp/forward-parser';
import { MockWhatsAppClient } from '../../lib/whatsapp/__mocks__/client';
import type { WhatsAppIncomingMessage } from '../../lib/whatsapp/types';

// --- Mock all external dependencies ---

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
  callAiText: jest.fn(),
}));

jest.mock('../../lib/whatsapp/voice-transcribe', () => ({
  transcribeAudio: jest.fn(),
}));

jest.mock('../../lib/whatsapp/image-ocr', () => ({
  extractTextFromImage: jest.fn(),
}));

jest.mock('../../lib/whatsapp/pdf-extract', () => ({
  extractTextFromPdf: jest.fn(),
}));

import { callAiJson } from '@/lib/openai';

const mockCallAiJson = callAiJson as jest.MockedFunction<typeof callAiJson>;

// U2: forward-parser now routes through @/lib/ai-provider (was hard-pinned to
// @/lib/openai). Pin AI_PROVIDER=openai so the shim delegates to the mocked
// @/lib/openai layer asserted here (ambient .env sets AI_PROVIDER=gemini).
beforeEach(() => {
  process.env.AI_PROVIDER = 'openai';
});

// Helper: build a minimal WhatsAppIncomingMessage with arbitrary type
function makeMsg(type: string, extra: Record<string, unknown> = {}): WhatsAppIncomingMessage {
  return {
    id: 'wamid.regression001',
    from: '+971501234567',
    timestamp: '1714000000',
    type: type as WhatsAppIncomingMessage['type'],
    ...extra,
  } as WhatsAppIncomingMessage;
}

const EMPTY_AI_RESPONSE = { missing_info: [] };

describe('H11 — Unknown message type should NOT call callAiJson', () => {
  let client: MockWhatsAppClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MockWhatsAppClient();
    // Provide a fallback in case the bug is present — prevents unhandled rejection
    mockCallAiJson.mockResolvedValue(EMPTY_AI_RESPONSE);
  });

  const unsupportedTypes = ['sticker', 'location', 'reaction', 'video', 'contacts', 'order'];

  test.each(unsupportedTypes)(
    'type="%s" must NOT trigger a callAiJson call (BUG-A4-1 if fails)',
    async (msgType) => {
      const msg = makeMsg(msgType);
      const result: ForwardParseResult = await parseForwardedMessage(msg, client as never);

      // PRIMARY assertion: callAiJson must NOT be called for unsupported types
      // If this fails → BUG-A4-1 confirmed: empty-input API call is wasted money/latency
      expect(mockCallAiJson).not.toHaveBeenCalled();

      // Secondary: rawText should be empty (switch fell through)
      expect(result.rawText).toBe('');

      // Secondary: confidence must degrade to uncertain (no data to parse)
      expect(result.confidence).toBe('uncertain');

      // Secondary: parsedCargo and parsedVessel should be absent
      expect(result.parsedCargo).toBeUndefined();
      expect(result.parsedVessel).toBeUndefined();
    }
  );
});

describe('H12 — text type with undefined msg.text', () => {
  let client: MockWhatsAppClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MockWhatsAppClient();
    mockCallAiJson.mockResolvedValue(EMPTY_AI_RESPONSE);
  });

  it('does not crash when msg.text is undefined, returns uncertain without calling AI', async () => {
    // msg.type = 'text' but text field missing entirely
    const msg = makeMsg('text');
    // Explicitly ensure text is not set
    delete (msg as unknown as Record<string, unknown>).text;

    const result: ForwardParseResult = await parseForwardedMessage(msg, client as never);

    // Should not crash
    expect(result.rawText).toBe('');
    expect(result.confidence).toBe('uncertain');
    // rawText is empty → early-return guard fires, callAiJson is NOT called (saves API quota)
    expect(mockCallAiJson).toHaveBeenCalledTimes(0);
  });

  it('does not crash when msg.text.body is undefined', async () => {
    const msg = makeMsg('text', { text: {} }); // body field absent

    const result: ForwardParseResult = await parseForwardedMessage(msg, client as never);

    expect(result.rawText).toBe('');
    expect(result.confidence).toBe('uncertain');
  });
});

describe('BUG-C3 — null AI response returns uncertain with ai_response_null', () => {
  let client: MockWhatsAppClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MockWhatsAppClient();
  });

  it('returns uncertain when AI response is null', async () => {
    mockCallAiJson.mockResolvedValueOnce(null);
    const msg = makeMsg('text', { text: { body: 'bulk grain 5000mt antwerp rotterdam' } });
    const result: ForwardParseResult = await parseForwardedMessage(msg, client as never);

    expect(result.confidence).toBe('uncertain');
    expect(result.missingFields).toContain('ai_response_null');
  });
});

describe('H13 — observation: no size guard on rawText (documented, not crashing)', () => {
  let client: MockWhatsAppClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MockWhatsAppClient();
    mockCallAiJson.mockResolvedValue(EMPTY_AI_RESPONSE);
  });

  it('passes a 200KB body directly to callAiJson without truncation', async () => {
    // 200 000 characters ~ 200 KB — well above typical LLM context limits
    const largeBody = 'x'.repeat(200_000);
    const msg = makeMsg('text', { text: { body: largeBody } });

    await parseForwardedMessage(msg, client as never);

    // Observation: rawText is forwarded at full size with no guard
    const calledWith = mockCallAiJson.mock.calls[0][0] as string;
    expect(calledWith.length).toBe(200_000); // documents the missing truncation
    // This test passing means there is NO size guard — just documenting behavior
  });
});
