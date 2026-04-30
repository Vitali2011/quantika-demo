/**
 * Integration tests for /api/integrations/pipedrive/oauth
 * spec-beta-02: OAuth init + callback with CSRF state cookie
 *
 * Tests call the route handlers directly (no HTTP server).
 * tokens.saveTokens is mocked to avoid real DB in these tests.
 */

// Mock tokens module — we just need to verify it gets called with correct args
jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
  saveTokens: jest.fn(),
  getValidAccessToken: jest.fn(),
  revoke: jest.fn(),
}));

import { saveTokens } from '@/lib/integrations/pipedrive/tokens';
const mockSaveTokens = saveTokens as jest.MockedFunction<typeof saveTokens>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(url: string, cookieHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new Request(url, { method: 'GET', headers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/integrations/pipedrive/oauth — init flow', () => {
  beforeEach(() => {
    process.env.PIPEDRIVE_CLIENT_ID = 'test-client-id';
    process.env.PIPEDRIVE_REDIRECT_URI = 'http://localhost:3000/api/integrations/pipedrive/oauth';
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PIPEDRIVE_CLIENT_ID;
    delete process.env.PIPEDRIVE_REDIRECT_URI;
  });

  it('redirects to Pipedrive OAuth with client_id, redirect_uri, and state', async () => {
    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');

    const req = makeGetRequest(
      'http://localhost:3000/api/integrations/pipedrive/oauth?action=init'
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('oauth.pipedrive.com');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain('redirect_uri=');
    expect(location).toContain('state=');
  });

  it('sets a signed state cookie on init redirect', async () => {
    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const req = makeGetRequest(
      'http://localhost:3000/api/integrations/pipedrive/oauth?action=init'
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('pipedrive_oauth_state=');
  });

  it('returns 500 when PIPEDRIVE_CLIENT_ID is missing', async () => {
    delete process.env.PIPEDRIVE_CLIENT_ID;

    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const req = makeGetRequest(
      'http://localhost:3000/api/integrations/pipedrive/oauth?action=init'
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/integrations/pipedrive/oauth — callback flow', () => {
  const VALID_SECRET = 'abc123';
  const VALID_STATE = 'valid-csrf-state-token';

  beforeEach(() => {
    process.env.PIPEDRIVE_CLIENT_ID = 'test-client-id';
    process.env.PIPEDRIVE_CLIENT_SECRET = 'test-client-secret';
    process.env.PIPEDRIVE_REDIRECT_URI = 'http://localhost:3000/api/integrations/pipedrive/oauth';
    jest.resetModules();
    jest.clearAllMocks();
    // Default fetch stub — not ok
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400 });
  });

  afterEach(() => {
    delete process.env.PIPEDRIVE_CLIENT_ID;
    delete process.env.PIPEDRIVE_CLIENT_SECRET;
    delete process.env.PIPEDRIVE_REDIRECT_URI;
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
  });

  it('returns 400 when state cookie is missing', async () => {
    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const req = makeGetRequest(
      `http://localhost:3000/api/integrations/pipedrive/oauth?code=authcode&state=${VALID_STATE}`
      // No cookie
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
  });

  it('returns 400 when state param does not match cookie', async () => {
    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const req = makeGetRequest(
      `http://localhost:3000/api/integrations/pipedrive/oauth?code=authcode&state=wrong-state`,
      `pipedrive_oauth_state=${VALID_STATE}`
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
  });

  it('exchanges code for tokens and saves them on valid callback', async () => {
    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        api_domain: 'mycompany.pipedrive.com',
      }),
    });

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const { saveTokens: mockSave } = await import('@/lib/integrations/pipedrive/tokens');

    const req = makeGetRequest(
      `http://localhost:3000/api/integrations/pipedrive/oauth?code=authcode&state=${VALID_STATE}`,
      `pipedrive_oauth_state=${VALID_STATE}`
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);

    // Should redirect to success page (or return 200)
    expect([200, 302]).toContain(res.status);
    expect(mockSave).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        apiDomain: 'mycompany.pipedrive.com',
      })
    );
  });

  it('returns 500 when token exchange fails', async () => {
    jest.mock('@/lib/integrations/pipedrive/tokens', () => ({
      saveTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      revoke: jest.fn(),
    }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    const { GET } = await import('@/app/api/integrations/pipedrive/oauth/route');
    const req = makeGetRequest(
      `http://localhost:3000/api/integrations/pipedrive/oauth?code=badcode&state=${VALID_STATE}`,
      `pipedrive_oauth_state=${VALID_STATE}`
    );

    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(500);
  });
});
