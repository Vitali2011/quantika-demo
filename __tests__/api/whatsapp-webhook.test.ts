/**
 * Tests for GET+POST /api/whatsapp/webhook
 *
 * GET: Meta hub verification — valid token returns challenge, wrong token → 403.
 * POST: empty body → 400, invalid HMAC → 401, valid HMAC → 200 OK.
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

jest.mock('@/lib/whatsapp/client', () => ({
  getWhatsAppClient: jest.fn(() => null),
}));

jest.mock('@/lib/whatsapp/router', () => ({
  routeIncomingMessage: jest.fn(),
}));

const VERIFY_TOKEN = 'whatsapp-verify-secret';
const APP_SECRET = 'whatsapp-app-secret';

function computeSig(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

function makePostReq(body: string, sig?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sig !== undefined) headers['x-hub-signature-256'] = sig;
  return new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    body,
    headers,
  });
}

const minimalPayload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: 'e1', changes: [{ value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15551234', phone_number_id: 'pid' }, messages: [] }, field: 'messages' }] }],
});

describe('GET /api/whatsapp/webhook — hub verification', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv, WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN, WHATSAPP_APP_SECRET: APP_SECRET };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('returns the challenge when mode=subscribe and token matches', async () => {
    const { GET } = await import('@/app/api/whatsapp/webhook/route');
    const req = new NextRequest(
      `http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  it('returns 403 when verify_token does not match', async () => {
    const { GET } = await import('@/app/api/whatsapp/webhook/route');
    const req = new NextRequest(
      'http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/whatsapp/webhook — message delivery', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv, WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN, WHATSAPP_APP_SECRET: APP_SECRET };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('returns 400 when body is empty', async () => {
    const { POST } = await import('@/app/api/whatsapp/webhook/route');
    const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
      method: 'POST',
      body: '',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when HMAC signature is missing', async () => {
    const { POST } = await import('@/app/api/whatsapp/webhook/route');
    const res = await POST(makePostReq(minimalPayload));
    expect(res.status).toBe(401);
  });

  it('returns 401 when HMAC signature is wrong', async () => {
    const { POST } = await import('@/app/api/whatsapp/webhook/route');
    const res = await POST(makePostReq(minimalPayload, 'sha256=badhash'));
    expect(res.status).toBe(401);
  });

  it('returns 200 OK when HMAC signature is valid', async () => {
    const { POST } = await import('@/app/api/whatsapp/webhook/route');
    const sig = computeSig(minimalPayload, APP_SECRET);
    const res = await POST(makePostReq(minimalPayload, sig));
    expect(res.status).toBe(200);
  });
});
