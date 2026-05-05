/**
 * Tests for lib/whatsapp/image-ocr.ts — Wave γ spec-08 migration
 *
 * Covers:
 * - Gemini Vision path (default/gemini provider)
 * - OpenAI rollback path (WHATSAPP_OCR_PROVIDER=openai)
 * - Multi-image batch via extractTextFromImages
 * - data URI parsing
 * - HTTP URL fetch + base64 conversion
 * - LLMTimeoutError suppression
 */

// ── Mocks (hoisted before imports) ──────────────────────────────────────────

jest.mock('@/lib/ai-provider', () => ({
  callAiVision: jest.fn(),
}));

jest.mock('@/lib/openai', () => {
  const ActualErr = jest.requireActual('@/lib/openai').LLMTimeoutError;
  return {
    callAiText: jest.fn(),
    LLMTimeoutError: ActualErr,
  };
});

// Mock global fetch for URL-based images
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Imports ──────────────────────────────────────────────────────────────────

import { extractTextFromImage, extractTextFromImages } from '../image-ocr';
import type { ImageInput } from '../image-ocr';
import { callAiVision } from '@/lib/ai-provider';
import { callAiText, LLMTimeoutError } from '@/lib/openai';

const mockCallAiVision = callAiVision as jest.MockedFunction<typeof callAiVision>;
const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const INVOICE_TEXT =
  'INVOICE #12345\nShipper: ATLAS CARGO LLC\nCargo: 7,500 MT STEEL COILS\nOrigin: ISTANBUL\nDestination: LAGOS';

const BILL_OF_LADING_TEXT =
  'BILL OF LADING\nVessel: MV PACIFIC STAR\nIMO: 9876543\nLaycan: 10-15 MAY 2026';

const CARGO_SCREENSHOT_TEXT =
  'CARGO OFFER\n5,000 MT WHEAT\nSt. Petersburg → Aqaba\nLaycan: 01-10 JUN 2026\nCommission: 1.25%';

// Build a minimal PNG-like base64 (1x1 white pixel) for fixtures
const FAKE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

function makeImageInput(mimeType = 'image/jpeg'): ImageInput {
  return { data: FAKE_PNG_BASE64, mimeType };
}

// Simulate a URL fetch response returning binary image data
function mockFetchResponse(base64Data: string, mimeType = 'image/jpeg'): void {
  const binary = Buffer.from(base64Data, 'base64');
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: (key: string) => (key === 'content-type' ? mimeType : null) },
    arrayBuffer: () => Promise.resolve(binary.buffer as ArrayBuffer),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractTextFromImages — multi-image batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Wave γ QA C2 fix: default provider is openai which bypasses the shim
    // (loops callAiText per image). The multi-image batch path goes through
    // callAiVision, so explicitly set provider=gemini for these tests.
    process.env.WHATSAPP_OCR_PROVIDER = 'gemini';
    delete process.env.AI_PROVIDER;
    mockCallAiVision.mockResolvedValue(INVOICE_TEXT);
  });

  afterEach(() => {
    delete process.env.WHATSAPP_OCR_PROVIDER;
  });

  it('passes single image as one callAiVision call', async () => {
    const images: ImageInput[] = [makeImageInput()];
    const result = await extractTextFromImages(images);

    expect(mockCallAiVision).toHaveBeenCalledTimes(1);
    expect(result).toBe(INVOICE_TEXT);
  });

  it('passes 2 images in a single callAiVision call (not 2 calls)', async () => {
    const images: ImageInput[] = [makeImageInput(), makeImageInput('image/png')];
    await extractTextFromImages(images);

    expect(mockCallAiVision).toHaveBeenCalledTimes(1);
    const [scope, prompt, passedImages] = mockCallAiVision.mock.calls[0];
    expect(scope).toBe('WHATSAPP_OCR');
    expect(passedImages).toHaveLength(2);
    expect(prompt).toContain('2 images');
  });

  it('passes 5 images in a single callAiVision call (max batch)', async () => {
    const images: ImageInput[] = Array.from({ length: 5 }, () => makeImageInput());
    await extractTextFromImages(images);

    expect(mockCallAiVision).toHaveBeenCalledTimes(1);
    const [, , passedImages] = mockCallAiVision.mock.calls[0];
    expect(passedImages).toHaveLength(5);
  });

  it('passes timeoutMs=20_000 to callAiVision', async () => {
    await extractTextFromImages([makeImageInput()]);

    const [, , , opts] = mockCallAiVision.mock.calls[0];
    expect(opts?.timeoutMs).toBe(20_000);
  });

  it('accepts custom timeoutMs', async () => {
    await extractTextFromImages([makeImageInput()], { timeoutMs: 30_000 });

    const [, , , opts] = mockCallAiVision.mock.calls[0];
    expect(opts?.timeoutMs).toBe(30_000);
  });

  it('returns empty string for empty images array', async () => {
    const result = await extractTextFromImages([]);
    expect(mockCallAiVision).not.toHaveBeenCalled();
    expect(result).toBe('');
  });

  it('preserves mimeType per image in the batch', async () => {
    const images: ImageInput[] = [
      { data: FAKE_PNG_BASE64, mimeType: 'image/jpeg' },
      { data: FAKE_PNG_BASE64, mimeType: 'image/png' },
      { data: FAKE_PNG_BASE64, mimeType: 'image/webp' },
    ];
    await extractTextFromImages(images);

    const [, , passedImages] = mockCallAiVision.mock.calls[0];
    expect((passedImages as ImageInput[])[0].mimeType).toBe('image/jpeg');
    expect((passedImages as ImageInput[])[1].mimeType).toBe('image/png');
    expect((passedImages as ImageInput[])[2].mimeType).toBe('image/webp');
  });
});

describe('extractTextFromImage — Gemini Vision path (non-openai provider)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WHATSAPP_OCR_PROVIDER = 'gemini';
    mockCallAiVision.mockResolvedValue(INVOICE_TEXT);
  });

  afterEach(() => {
    delete process.env.WHATSAPP_OCR_PROVIDER;
  });

  it('fetches HTTP URL and passes base64 to callAiVision', async () => {
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');

    const result = await extractTextFromImage('https://cdn.example.com/invoice.jpg');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockCallAiVision).toHaveBeenCalledTimes(1);
    const [scope, , images] = mockCallAiVision.mock.calls[0];
    expect(scope).toBe('WHATSAPP_OCR');
    expect((images as ImageInput[])[0].mimeType).toBe('image/jpeg');
    expect(result).toBe(INVOICE_TEXT);
  });

  it('parses data URI without fetching (PDF fallback path)', async () => {
    const dataUri = `data:application/pdf;base64,${FAKE_PNG_BASE64}`;
    mockCallAiVision.mockResolvedValue(BILL_OF_LADING_TEXT);

    const result = await extractTextFromImage(dataUri);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCallAiVision).toHaveBeenCalledTimes(1);
    const [, , images] = mockCallAiVision.mock.calls[0];
    expect((images as ImageInput[])[0].mimeType).toBe('application/pdf');
    expect((images as ImageInput[])[0].data).toBe(FAKE_PNG_BASE64);
    expect(result).toBe(BILL_OF_LADING_TEXT);
  });

  it('uses mimeType hint when Content-Type header is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: () => Promise.resolve(Buffer.from(FAKE_PNG_BASE64, 'base64').buffer as ArrayBuffer),
    });

    await extractTextFromImage('https://wa-media.example.com/file', 'image/webp');

    const [, , images] = mockCallAiVision.mock.calls[0];
    expect((images as ImageInput[])[0].mimeType).toBe('image/webp');
  });

  it('passes timeoutMs=20_000', async () => {
    mockFetchResponse(FAKE_PNG_BASE64);

    await extractTextFromImage('https://example.com/cargo.jpg');

    const [, , , opts] = mockCallAiVision.mock.calls[0];
    expect(opts?.timeoutMs).toBe(20_000);
  });

  it('processes invoice fixture correctly (cargo screenshot)', async () => {
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');
    mockCallAiVision.mockResolvedValue(INVOICE_TEXT);

    const result = await extractTextFromImage('https://cdn.example.com/invoice.jpg');
    expect(result).toContain('ATLAS CARGO LLC');
    expect(result).toContain('7,500 MT STEEL COILS');
  });

  it('processes bill of lading fixture', async () => {
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');
    mockCallAiVision.mockResolvedValue(BILL_OF_LADING_TEXT);

    const result = await extractTextFromImage('https://cdn.example.com/bol.jpg');
    expect(result).toContain('MV PACIFIC STAR');
    expect(result).toContain('IMO: 9876543');
  });

  it('processes cargo screenshot fixture', async () => {
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');
    mockCallAiVision.mockResolvedValue(CARGO_SCREENSHOT_TEXT);

    const result = await extractTextFromImage('https://cdn.example.com/cargo.jpg');
    expect(result).toContain('WHEAT');
    expect(result).toContain('Aqaba');
  });

  it('throws if HTTP fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(
      extractTextFromImage('https://example.com/missing.jpg'),
    ).rejects.toThrow('Failed to fetch image');
  });
});

describe('extractTextFromImage — OpenAI rollback path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WHATSAPP_OCR_PROVIDER = 'openai';
    mockCallAiText.mockResolvedValue(INVOICE_TEXT);
  });

  afterEach(() => {
    delete process.env.WHATSAPP_OCR_PROVIDER;
  });

  it('uses callAiText (not callAiVision) when WHATSAPP_OCR_PROVIDER=openai', async () => {
    const result = await extractTextFromImage('https://example.com/media/screenshot.jpg');

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    expect(mockCallAiVision).not.toHaveBeenCalled();
    expect(result).toBe(INVOICE_TEXT);
  });

  it('passes URL in prompt to callAiText', async () => {
    await extractTextFromImage('https://example.com/media/screenshot.jpg');

    const callArgs = mockCallAiText.mock.calls[0];
    expect(callArgs[0]).toContain('https://example.com/media/screenshot.jpg');
    expect(callArgs[1]).toContain('Extract all text');
  });

  it('passes timeoutMs=20_000 in openai rollback path', async () => {
    await extractTextFromImage('https://example.com/image.jpg');

    const callArgs = mockCallAiText.mock.calls[0];
    const opts = callArgs[3] as { timeoutMs?: number };
    expect(opts?.timeoutMs).toBe(20_000);
  });

  it('does NOT fetch the URL (openai gets URL as prompt text)', async () => {
    await extractTextFromImage('https://example.com/media/invoice.jpg');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty string on empty response', async () => {
    mockCallAiText.mockResolvedValue('');
    const result = await extractTextFromImage('https://example.com/blank.jpg');
    expect(result).toBe('');
  });
});

describe('extractTextFromImage — LLMTimeoutError suppression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WHATSAPP_OCR_PROVIDER;
    delete process.env.AI_PROVIDER;
  });

  it('returns empty string on LLMTimeoutError (gemini path)', async () => {
    process.env.WHATSAPP_OCR_PROVIDER = 'gemini';
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');
    mockCallAiVision.mockRejectedValueOnce(new LLMTimeoutError('timeout'));

    const result = await extractTextFromImage('https://example.com/image.jpg');
    expect(result).toBe('');

    delete process.env.WHATSAPP_OCR_PROVIDER;
  });

  it('returns empty string on LLMTimeoutError (openai path)', async () => {
    process.env.WHATSAPP_OCR_PROVIDER = 'openai';
    mockCallAiText.mockRejectedValueOnce(new LLMTimeoutError('timeout'));

    const result = await extractTextFromImage('https://example.com/image.jpg');
    expect(result).toBe('');

    delete process.env.WHATSAPP_OCR_PROVIDER;
  });

  it('re-throws non-timeout errors (gemini path)', async () => {
    process.env.WHATSAPP_OCR_PROVIDER = 'gemini';
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');
    mockCallAiVision.mockRejectedValueOnce(new Error('network error'));

    await expect(
      extractTextFromImage('https://example.com/image.jpg'),
    ).rejects.toThrow('network error');

    delete process.env.WHATSAPP_OCR_PROVIDER;
  });

  it('re-throws non-timeout errors (openai path)', async () => {
    process.env.WHATSAPP_OCR_PROVIDER = 'openai';
    mockCallAiText.mockRejectedValueOnce(new Error('auth error'));

    await expect(
      extractTextFromImage('https://example.com/image.jpg'),
    ).rejects.toThrow('auth error');

    delete process.env.WHATSAPP_OCR_PROVIDER;
  });
});

describe('extractTextFromImage — AI_PROVIDER fallback routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WHATSAPP_OCR_PROVIDER;
    delete process.env.AI_PROVIDER;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_OCR_PROVIDER;
    delete process.env.AI_PROVIDER;
  });

  it('defaults to openai when no env vars set', async () => {
    mockCallAiText.mockResolvedValue(INVOICE_TEXT);

    await extractTextFromImage('https://example.com/img.jpg');

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    expect(mockCallAiVision).not.toHaveBeenCalled();
  });

  it('uses gemini when AI_PROVIDER=gemini (no WHATSAPP_OCR_PROVIDER)', async () => {
    process.env.AI_PROVIDER = 'gemini';
    mockFetchResponse(FAKE_PNG_BASE64, 'image/jpeg');
    mockCallAiVision.mockResolvedValue(INVOICE_TEXT);

    await extractTextFromImage('https://example.com/img.jpg');

    expect(mockCallAiVision).toHaveBeenCalledTimes(1);
    expect(mockCallAiText).not.toHaveBeenCalled();
  });

  it('WHATSAPP_OCR_PROVIDER overrides AI_PROVIDER', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.WHATSAPP_OCR_PROVIDER = 'openai';
    mockCallAiText.mockResolvedValue(INVOICE_TEXT);

    await extractTextFromImage('https://example.com/img.jpg');

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    expect(mockCallAiVision).not.toHaveBeenCalled();
  });
});
