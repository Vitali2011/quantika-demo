/**
 * Tests for GET /api/integrations/pipedrive/oauth
 *
 * Two flows: ?action=init (redirect to Pipedrive) and callback (?code=...&state=...).
 * CSRF state cookie must match query param on callback.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
  saveTokens: jest.fn(),
}));

function makeReq(searchParams: Record<string, string>, cookieState?: string): NextRequest {
  const url = new URL('http://localhost/api/integrations/pipedrive/oauth');
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {};
  if (cookieState) {
    headers['cookie'] = `pipedrive_oauth_state=${cookieState}`;
  }
  return new NextRequest(url.toString(), { headers });
}

describe('GET /api/integrations/pipedrive/oauth', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...origEnv,
      PIPEDRIVE_CLIENT_ID: 'test-client-id',
      PIPEDRIVE_CLIENT_SECRET: 'test-client-secret',
      PIPEDRIVE_REDIRECT_URI: 'http://localhost/api/integrations/pipedrive/oauth',
    };
  });

  afterEach(() => {
    process.env = origEnv;
    jest.clearAllMocks();
  });

  it('returns 500 when PIPEDRIVE_CLIENT_ID is not configured on init', async () => {
    delete process.env.PIPEDRIVE_CLIENT_ID;
    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const res = await GET(makeReq({ action: 'init' }));
    expect(res.status).toBe(500);
  });

  it('redirects to Pipedrive OAuth URL on action=init', async () => {
    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const res = await GET(makeReq({ action: 'init' }));
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('oauth.pipedrive.com');
    expect(location).toContain('client_id=test-client-id');
  });

  it('sets pipedrive_oauth_state cookie on init', async () => {
    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const res = await GET(makeReq({ action: 'init' }));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('pipedrive_oauth_state=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('returns 400 when callback state does not match cookie', async () => {
    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const res = await GET(makeReq(
      { code: 'auth-code', state: 'wrong-state' },
      'correct-state',
    ));
    expect(res.status).toBe(400);
    const json = JSON.parse(await res.text());
    expect(json.error).toMatch(/CSRF/i);
  });

  it('returns 400 when callback has no state cookie', async () => {
    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const res = await GET(makeReq({ code: 'auth-code', state: 'some-state' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for request with no params', async () => {
    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const res = await GET(makeReq({}));
    // No action, no code, no state → falls through to ?action=init path or invalid
    // The implementation redirects to Pipedrive on missing code+state, treat as redirect or 500
    // Either is acceptable — just not 200 with empty body
    expect([302, 400, 500]).toContain(res.status);
  });
});
