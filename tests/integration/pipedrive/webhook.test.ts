/**
 * Integration tests for POST /api/integrations/pipedrive/webhook
 *
 * Tests call the POST handler function directly (no HTTP server).
 * The DB write is verified via jest.mock on lib/notifications so we don't
 * need two processes to share the same in-memory SQLite instance.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mock the notifications module so we can assert DB writes without needing
// to share an in-memory SQLite instance across module boundaries.
// ---------------------------------------------------------------------------
jest.mock('@/lib/notifications', () => ({
  writeNotification: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHmac(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function makeRequest(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (signature !== null) {
    headers['x-pipedrive-signature'] = signature;
  }

  return new Request('http://localhost/api/integrations/pipedrive/webhook', {
    method: 'POST',
    headers,
    body: body || undefined,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('POST /api/integrations/pipedrive/webhook', () => {
  const VALID_SECRET = 'test-webhook-secret-abc123';
  const SAMPLE_PAYLOAD = JSON.stringify({
    event: 'updated.deal',
    meta: { action: 'updated', object: 'deal' },
    current: { id: 42, title: 'Test Deal' },
    previous: { id: 42, title: 'Old Deal' },
  });

  beforeEach(() => {
    delete process.env.PIPEDRIVE_WEBHOOK_SECRET;
    jest.resetModules();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: valid HMAC + body → 200 + notification written
  // -------------------------------------------------------------------------
  it('returns 200 and calls writeNotification on valid HMAC + body', async () => {
    process.env.PIPEDRIVE_WEBHOOK_SECRET = VALID_SECRET;

    // Re-mock after resetModules
    jest.mock('@/lib/notifications', () => ({
      writeNotification: jest.fn(),
    }));

    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const { writeNotification } = await import('@/lib/notifications');

    const sig = computeHmac(VALID_SECRET, SAMPLE_PAYLOAD);
    const req = makeRequest(SAMPLE_PAYLOAD, sig);

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);

    // Allow setImmediate to flush
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(writeNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: 'pipedrive',
        event: 'updated.deal',
      })
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: invalid HMAC → 401
  // -------------------------------------------------------------------------
  it('returns 401 when the HMAC signature is invalid', async () => {
    process.env.PIPEDRIVE_WEBHOOK_SECRET = VALID_SECRET;

    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');

    const req = makeRequest(SAMPLE_PAYLOAD, 'deadbeefdeadbeefdeadbeefdeadbeef');

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Test 3: missing x-pipedrive-signature header → 401
  // -------------------------------------------------------------------------
  it('returns 401 when x-pipedrive-signature header is absent', async () => {
    process.env.PIPEDRIVE_WEBHOOK_SECRET = VALID_SECRET;

    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');

    const req = makeRequest(SAMPLE_PAYLOAD, null);

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Test 4: empty body → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the request body is empty', async () => {
    process.env.PIPEDRIVE_WEBHOOK_SECRET = VALID_SECRET;

    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');

    const req = makeRequest('', computeHmac(VALID_SECRET, ''));

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Test 5: missing PIPEDRIVE_WEBHOOK_SECRET env var → 500
  // -------------------------------------------------------------------------
  it('returns 500 when PIPEDRIVE_WEBHOOK_SECRET env var is not set', async () => {
    // Env var deleted in beforeEach
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');

    const req = makeRequest(SAMPLE_PAYLOAD, 'anysignature');

    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(500);
  });
});
