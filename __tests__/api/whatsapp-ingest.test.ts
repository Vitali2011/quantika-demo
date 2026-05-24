/**
 * Tests for POST /api/whatsapp/ingest
 *
 * Internal-token auth gate → 401, missing fields → 400,
 * unconfigured client → 503, happy-path → 200.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/whatsapp/client', () => ({
  getWhatsAppClient: jest.fn(),
}));

jest.mock('@/lib/whatsapp/forward-parser', () => ({
  parseForwardedMessage: jest.fn(),
}));

const VALID_TOKEN = 'test-internal-token';

function makeReq(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers['x-quantika-internal'] = token;
  return new NextRequest('http://localhost/api/whatsapp/ingest', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

const validBody = {
  phone: '+1234567890',
  messageId: 'msg-001',
  type: 'text',
  content: 'Looking for bulk carrier Rotterdam→Singapore',
};

describe('POST /api/whatsapp/ingest', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv, QUANTIKA_INTERNAL_TOKEN: VALID_TOKEN };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('returns 401 when x-quantika-internal header is missing', async () => {
    const { POST } = await import('@/app/api/whatsapp/ingest/route');
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 401 when x-quantika-internal token is wrong', async () => {
    const { POST } = await import('@/app/api/whatsapp/ingest/route');
    const res = await POST(makeReq(validBody, 'wrong-token'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/whatsapp/ingest/route');
    const res = await POST(makeReq({ phone: '+1234567890' }, VALID_TOKEN));
    expect(res.status).toBe(400);
  });

  it('returns 503 when WhatsApp client is not configured', async () => {
    const { getWhatsAppClient } = jest.requireMock('@/lib/whatsapp/client');
    getWhatsAppClient.mockReturnValue(null);
    const { POST } = await import('@/app/api/whatsapp/ingest/route');
    const res = await POST(makeReq(validBody, VALID_TOKEN));
    expect(res.status).toBe(503);
  });

  it('returns 200 with parsed result when client is configured and payload is valid', async () => {
    const { getWhatsAppClient } = jest.requireMock('@/lib/whatsapp/client');
    const { parseForwardedMessage } = jest.requireMock('@/lib/whatsapp/forward-parser');
    getWhatsAppClient.mockReturnValue({ sendText: jest.fn() });
    parseForwardedMessage.mockResolvedValue({
      parsedCargo: { cargoDescription: 'bulk cargo' },
      parsedVessel: null,
      confidence: 'high',
      missingFields: [],
      rawText: 'Looking for bulk carrier Rotterdam→Singapore',
    });
    const { POST } = await import('@/app/api/whatsapp/ingest/route');
    const res = await POST(makeReq(validBody, VALID_TOKEN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.confidence).toBe('high');
    expect(Array.isArray(json.missingFields)).toBe(true);
  });
});
