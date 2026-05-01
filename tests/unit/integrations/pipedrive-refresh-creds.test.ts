/**
 * BUG-β-02-OAuthRefreshMissingCreds — token refresh must include
 * client_id+client_secret in /oauth/token body (Pipedrive requires it).
 */

import Database from 'better-sqlite3';
import { _setDb, getValidAccessToken, saveTokens } from '@/lib/integrations/pipedrive/tokens';

function setupDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE pipedrive_tokens (
    account_id INTEGER PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    api_domain TEXT NOT NULL
  )`);
  _setDb(db);
  return db;
}

const realFetch = global.fetch;

beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    '0000000000000000000000000000000000000000000000000000000000000000';
  process.env.PIPEDRIVE_CLIENT_ID = 'cid-test';
  process.env.PIPEDRIVE_CLIENT_SECRET = 'csec-test';
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('BUG-β-02 refresh body includes client credentials', () => {
  it('POSTs client_id and client_secret to /oauth/token', async () => {
    setupDb();
    saveTokens(42, {
      accessToken: 'old-at',
      refreshToken: 'rt-1',
      expiresAt: Math.floor(Date.now() / 1000) + 5, // about to expire (<60s)
      apiDomain: 'example.pipedrive.com',
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-at',
        refresh_token: 'rt-2',
        expires_in: 3600,
        api_domain: 'example.pipedrive.com',
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = fetchMock as any;

    const at = await getValidAccessToken(42);
    expect(at).toBe('new-at');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = String(init.body);
    expect(body).toMatch(/client_id=cid-test/);
    expect(body).toMatch(/client_secret=csec-test/);
    expect(body).toMatch(/grant_type=refresh_token/);
    expect(body).toMatch(/refresh_token=rt-1/);
  });
});
