/**
 * Tests for POST /api/integrations/pipedrive/webhook
 *
 * HMAC-SHA256 signature verification. Tests verify real security logic:
 * missing secret → 500, empty body → 400, missing/wrong sig → 401,
 * valid HMAC → 200 OK.
 */
import Database from 'better-sqlite3';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: () => testDb,
  })),
}));

jest.mock('@/lib/notifications', () => ({
  writeNotification: jest.fn(),
}));

function computeSig(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function makeReq(body: string, sig?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sig !== undefined) headers['x-pipedrive-signature'] = sig;
  return new NextRequest('http://localhost/api/integrations/pipedrive/webhook', {
    method: 'POST',
    body,
    headers,
  });
}

describe('POST /api/integrations/pipedrive/webhook', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv, PIPEDRIVE_WEBHOOK_SECRET: 'test-secret' };
    testDb = new Database(':memory:');
    // Ensure notifications table exists
    testDb.exec(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      event TEXT,
      payload TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )`);
  });

  afterEach(() => {
    testDb.close();
    process.env = origEnv;
  });

  it('returns 500 when PIPEDRIVE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.PIPEDRIVE_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const body = JSON.stringify({ event: 'deal.added' });
    const res = await POST(makeReq(body));
    expect(res.status).toBe(500);
  });

  it('returns 400 for empty body', async () => {
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const res = await POST(makeReq(''));
    expect(res.status).toBe(400);
  });

  it('returns 401 when signature header is missing', async () => {
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const body = JSON.stringify({ event: 'deal.added' });
    const res = await POST(makeReq(body)); // no sig
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong HMAC signature', async () => {
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const body = JSON.stringify({ event: 'deal.added' });
    const res = await POST(makeReq(body, 'deadbeef'.repeat(8)));
    expect(res.status).toBe(401);
  });

  it('returns 200 for valid HMAC signature', async () => {
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const body = JSON.stringify({ event: 'deal.added', meta: { action: 'added', object: 'deal' } });
    const sig = computeSig(body, 'test-secret');
    const res = await POST(makeReq(body, sig));
    expect(res.status).toBe(200);
  });

  it('returns 200 even when JSON is malformed (acknowledge receipt to stop retries)', async () => {
    const { POST } = await import('@/app/api/integrations/pipedrive/webhook/route');
    const body = 'not-json';
    const sig = computeSig(body, 'test-secret');
    const res = await POST(makeReq(body, sig));
    expect(res.status).toBe(200);
  });
});
