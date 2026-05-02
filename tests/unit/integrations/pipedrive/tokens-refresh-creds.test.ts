/**
 * spec-betafix-18 — Pipedrive OAuth refresh must include client credentials.
 *
 * RED → GREEN tests:
 *  1. Refresh body MUST contain client_id + client_secret + grant_type + refresh_token.
 *  2. Missing PIPEDRIVE_CLIENT_ID/SECRET → throws explicit error (no silent 401).
 *  3. Refresh response 401 → surfaces to caller as Error.
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

const VALID_KEY = 'a'.repeat(64);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

describe('spec-βf-18: Pipedrive refresh includes client credentials', () => {
  let db: Database.Database;
  let saveTokens: (
    accountId: number,
    tokens: import('@/lib/integrations/pipedrive/types').PipedriveTokens,
  ) => void;
  let getValidAccessToken: (accountId: number) => Promise<string>;

  const ORIGINAL_CID = process.env.PIPEDRIVE_CLIENT_ID;
  const ORIGINAL_CSEC = process.env.PIPEDRIVE_CLIENT_SECRET;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
    process.env.PIPEDRIVE_CLIENT_ID = 'cid_test';
    process.env.PIPEDRIVE_CLIENT_SECRET = 'csec_test';
    db = makeDb();

    jest.isolateModules(() => {
      const mod = require('@/lib/integrations/pipedrive/tokens');
      mod._setDb(db);
      saveTokens = mod.saveTokens;
      getValidAccessToken = mod.getValidAccessToken;
    });
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    if (ORIGINAL_CID === undefined) delete process.env.PIPEDRIVE_CLIENT_ID;
    else process.env.PIPEDRIVE_CLIENT_ID = ORIGINAL_CID;
    if (ORIGINAL_CSEC === undefined) delete process.env.PIPEDRIVE_CLIENT_SECRET;
    else process.env.PIPEDRIVE_CLIENT_SECRET = ORIGINAL_CSEC;
    jest.restoreAllMocks();
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
  });

  it('refresh body contains client_id, client_secret, grant_type, refresh_token', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    saveTokens(101, {
      accessToken: 'old',
      refreshToken: 'rt-101',
      expiresAt: past,
      apiDomain: 'example.pipedrive.com',
    });

    let capturedBody: string | undefined;
    (global.fetch as jest.Mock).mockImplementationOnce(async (_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return {
        ok: true,
        json: async () => ({
          access_token: 'new-at',
          refresh_token: 'new-rt',
          expires_in: 3600,
          api_domain: 'example.pipedrive.com',
        }),
      };
    });

    await getValidAccessToken(101);

    expect(capturedBody).toContain('client_id=cid_test');
    expect(capturedBody).toContain('client_secret=csec_test');
    expect(capturedBody).toContain('grant_type=refresh_token');
    expect(capturedBody).toContain('refresh_token=rt-101');
  });

  it('missing PIPEDRIVE_CLIENT_ID → throws explicit error mentioning the env var', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    saveTokens(102, {
      accessToken: 'old',
      refreshToken: 'rt-102',
      expiresAt: past,
      apiDomain: 'example.pipedrive.com',
    });

    delete process.env.PIPEDRIVE_CLIENT_ID;

    await expect(getValidAccessToken(102)).rejects.toThrow(/PIPEDRIVE_CLIENT_ID/);
  });

  it('missing PIPEDRIVE_CLIENT_SECRET → throws explicit error mentioning the env var', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    saveTokens(103, {
      accessToken: 'old',
      refreshToken: 'rt-103',
      expiresAt: past,
      apiDomain: 'example.pipedrive.com',
    });

    delete process.env.PIPEDRIVE_CLIENT_SECRET;

    await expect(getValidAccessToken(103)).rejects.toThrow(/PIPEDRIVE_CLIENT_SECRET/);
  });

  it('refresh response 401 → surfaces error to caller', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    saveTokens(104, {
      accessToken: 'old',
      refreshToken: 'rt-104',
      expiresAt: past,
      apiDomain: 'example.pipedrive.com',
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    });

    await expect(getValidAccessToken(104)).rejects.toThrow();
  });
});
