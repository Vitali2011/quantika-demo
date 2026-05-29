/**
 * U1 / #651 — L-4: the Pipedrive OAuth CSRF-state cookie must carry Max-Age and
 * (in production) the Secure attribute. Invokes the real GET handler.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/integrations/pipedrive/tokens', () => ({ saveTokens: jest.fn() }));

const ORIGINAL_ENV = process.env;

function initReq(): NextRequest {
  const url = new URL('http://localhost/api/integrations/pipedrive/oauth');
  url.searchParams.set('action', 'init');
  return new NextRequest(url.toString());
}

async function setCookieOnInit(): Promise<string> {
  jest.resetModules();
  const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
  const res = await GET(initReq());
  expect(res.status).toBe(302);
  return res.headers.get('set-cookie') ?? '';
}

function setEnv(nodeEnv: 'development' | 'production' | 'test'): void {
  // process.env.NODE_ENV is typed read-only; replace the whole object instead
  // (same pattern as the other auth/middleware tests).
  process.env = {
    ...ORIGINAL_ENV,
    PIPEDRIVE_CLIENT_ID: 'test-client-id',
    PIPEDRIVE_CLIENT_SECRET: 'test-client-secret',
    PIPEDRIVE_REDIRECT_URI: 'http://localhost/api/integrations/pipedrive/oauth',
    NODE_ENV: nodeEnv,
  };
}

afterAll(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe('Pipedrive OAuth state cookie — L-4', () => {
  it('sets the state cookie with HttpOnly and a bounded Max-Age', async () => {
    setEnv('test');
    const cookie = await setCookieOnInit();
    expect(cookie).toContain('pipedrive_oauth_state=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('marks the cookie Secure in production', async () => {
    setEnv('production');
    const cookie = await setCookieOnInit();
    expect(cookie).toContain('Secure');
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('does not mark the cookie Secure outside production (dev/localhost)', async () => {
    setEnv('development');
    const cookie = await setCookieOnInit();
    // Still bounded with Max-Age even in dev.
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(cookie).not.toContain('Secure');
  });
});
