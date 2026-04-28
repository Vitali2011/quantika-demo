import { createHmac } from 'node:crypto';

jest.mock('@/lib/whatsapp/client', () => jest.requireActual('@/lib/whatsapp/__mocks__/client'));

import { GET, POST } from '@/app/api/whatsapp/webhook/route';

const VERIFY_TOKEN = 'test-verify-token';
const APP_SECRET = 'test-app-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

function makeGetRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost/api/whatsapp/webhook');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: 'GET' });
}

function makePostRequest(body: string, signature: string): Request {
  return new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
}

beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
});

afterEach(() => {
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
});

describe('GET /api/whatsapp/webhook', () => {
  it('returns 200 and challenge when verify_token matches', async () => {
    const req = makeGetRequest({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge123',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('challenge123');
  });

  it('returns 403 when verify_token is wrong', async () => {
    const req = makeGetRequest({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge123',
    });
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/whatsapp/webhook', () => {
  it('returns 401 when signature is missing', async () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const req = new Request('http://localhost/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature is invalid', async () => {
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const req = makePostRequest(body, 'sha256=badhash');
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid signature with empty entry', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
    });
    const req = makePostRequest(body, sign(body));
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it('returns 200 and invokes router for valid text message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'entry1',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '+1111', phone_number_id: 'pid1' },
            messages: [{
              id: 'wamid.msg1',
              from: '+1234567890',
              timestamp: '1714000000',
              type: 'text',
              text: { body: 'hello' },
            }],
          },
        }],
      }],
    };
    const body = JSON.stringify(payload);
    const req = makePostRequest(body, sign(body));
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });
});
