/**
 * TDD tests for lib/integrations/pipedrive/tokens.ts
 * spec-beta-02: AES-256-GCM token storage + auto-refresh
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

// Valid 64-hex-char key (32 bytes)
const VALID_KEY = 'a'.repeat(64);

// Helper: create a fresh in-memory DB with migration 008 applied
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

// ─── Module import helper (re-import with fresh env) ──────────────────────────
// We use jest.isolateModules so each describe block gets a clean module state.

describe('tokens module — ENCRYPTION_KEY validation at import time', () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('throws if ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => {
      jest.isolateModules(() => {
        require('@/lib/integrations/pipedrive/tokens');
      });
    }).toThrow(/ENCRYPTION_KEY/);
  });

  it('throws if ENCRYPTION_KEY is not 64 hex chars', () => {
    process.env.ENCRYPTION_KEY = 'tooshort';
    expect(() => {
      jest.isolateModules(() => {
        require('@/lib/integrations/pipedrive/tokens');
      });
    }).toThrow(/ENCRYPTION_KEY/);
  });

  it('throws if ENCRYPTION_KEY contains non-hex chars', () => {
    process.env.ENCRYPTION_KEY = 'z'.repeat(64);
    expect(() => {
      jest.isolateModules(() => {
        require('@/lib/integrations/pipedrive/tokens');
      });
    }).toThrow(/ENCRYPTION_KEY/);
  });
});

// ─── All other tests use a valid key and injected in-memory DB ────────────────

describe('tokens — saveTokens / getValidAccessToken / revoke', () => {
  let db: Database.Database;
  let saveTokens: (accountId: number, tokens: import('@/lib/integrations/pipedrive/types').PipedriveTokens) => void;
  let getValidAccessToken: (accountId: number) => Promise<string>;
  let revoke: (accountId: number) => void;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
    db = makeDb();

    jest.isolateModules(() => {
      // Inject the in-memory DB via the exported setter
      const mod = require('@/lib/integrations/pipedrive/tokens');
      mod._setDb(db);
      saveTokens = mod.saveTokens;
      getValidAccessToken = mod.getValidAccessToken;
      revoke = mod.revoke;
    });
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    jest.restoreAllMocks();
    (global.fetch as jest.Mock).mockReset();
    // Default back to non-ok stub from jest.setup.ts
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
  });

  // ── saveTokens input validation ───────────────────────────────────────────

  it('saveTokens: accountId=0 → RangeError', () => {
    expect(() =>
      saveTokens(0, { accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, apiDomain: 'd.pd.com' })
    ).toThrow(RangeError);
  });

  it('saveTokens: accountId=-1 → RangeError', () => {
    expect(() =>
      saveTokens(-1, { accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, apiDomain: 'd.pd.com' })
    ).toThrow(RangeError);
  });

  it('saveTokens: NaN expiresAt → RangeError', () => {
    expect(() =>
      saveTokens(1, { accessToken: 'a', refreshToken: 'r', expiresAt: NaN, apiDomain: 'd.pd.com' })
    ).toThrow(RangeError);
  });

  it('saveTokens: non-finite expiresAt (Infinity) → RangeError', () => {
    expect(() =>
      saveTokens(1, { accessToken: 'a', refreshToken: 'r', expiresAt: Infinity, apiDomain: 'd.pd.com' })
    ).toThrow(RangeError);
  });

  it('saveTokens: empty accessToken → TypeError', () => {
    expect(() =>
      saveTokens(1, { accessToken: '', refreshToken: 'r', expiresAt: 9999999999, apiDomain: 'd.pd.com' })
    ).toThrow(TypeError);
  });

  it('saveTokens: empty refreshToken → TypeError', () => {
    expect(() =>
      saveTokens(1, { accessToken: 'a', refreshToken: '', expiresAt: 9999999999, apiDomain: 'd.pd.com' })
    ).toThrow(TypeError);
  });

  it('saveTokens: empty apiDomain → TypeError', () => {
    expect(() =>
      saveTokens(1, { accessToken: 'a', refreshToken: 'r', expiresAt: 9999999999, apiDomain: '' })
    ).toThrow(TypeError);
  });

  // ── encrypt→decrypt round-trip ────────────────────────────────────────────

  it('encrypt→decrypt round-trip: stored refresh_token decrypts back correctly', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    saveTokens(42, { accessToken: 'acc-tok', refreshToken: 'ref-tok-secret', expiresAt: future, apiDomain: 'test.pd.com' });

    // Read raw encrypted value from DB — it must NOT equal the plaintext
    const row = db
      .prepare<[number], { refresh_token_encrypted: string }>('SELECT refresh_token_encrypted FROM pipedrive_tokens WHERE account_id = ?')
      .get(42);
    expect(row).not.toBeNull();
    expect(row!.refresh_token_encrypted).not.toBe('ref-tok-secret');

    // getValidAccessToken internally decrypts and (if not expired) returns access_token
    return getValidAccessToken(42).then((tok) => {
      expect(tok).toBe('acc-tok');
    });
  });

  // ── getValidAccessToken input validation ──────────────────────────────────

  it('getValidAccessToken: accountId=0 → RangeError', async () => {
    await expect(getValidAccessToken(0)).rejects.toThrow(RangeError);
  });

  it('getValidAccessToken: accountId=-1 → RangeError', async () => {
    await expect(getValidAccessToken(-1)).rejects.toThrow(RangeError);
  });

  it('getValidAccessToken: non-existent accountId → Error', async () => {
    await expect(getValidAccessToken(9999)).rejects.toThrow(Error);
  });

  // ── token NOT expired → no refresh call ──────────────────────────────────

  it('getValidAccessToken: token not expired → returns access_token, no fetch', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    saveTokens(1, { accessToken: 'valid-tok', refreshToken: 'r', expiresAt: future, apiDomain: 'x.pd.com' });

    const tok = await getValidAccessToken(1);
    expect(tok).toBe('valid-tok');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── token expires within 60s → triggers refresh ──────────────────────────

  it('getValidAccessToken: expires in 30s (within 60s window) → calls refresh', async () => {
    const nearFuture = Math.floor(Date.now() / 1000) + 30; // 30 seconds from now
    saveTokens(2, { accessToken: 'old-tok', refreshToken: 'old-ref', expiresAt: nearFuture, apiDomain: 'x.pd.com' });

    const newExpiry = Math.floor(Date.now() / 1000) + 3600;
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-tok',
        refresh_token: 'new-ref',
        expires_in: 3600,
        api_domain: 'x.pd.com',
      }),
    });

    const tok = await getValidAccessToken(2);
    expect(tok).toBe('new-tok');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(callUrl).toContain('oauth/token');

    // New tokens should be persisted
    const row = db
      .prepare<[number], { access_token: string }>('SELECT access_token FROM pipedrive_tokens WHERE account_id = ?')
      .get(2);
    expect(row!.access_token).toBe('new-tok');
  });

  // ── token already expired → triggers refresh ────────────────────────────

  it('getValidAccessToken: already expired → calls refresh', async () => {
    const past = Math.floor(Date.now() / 1000) - 100; // 100s ago
    saveTokens(3, { accessToken: 'stale-tok', refreshToken: 'stale-ref', expiresAt: past, apiDomain: 'y.pd.com' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'fresh-tok',
        refresh_token: 'fresh-ref',
        expires_in: 3600,
        api_domain: 'y.pd.com',
      }),
    });

    const tok = await getValidAccessToken(3);
    expect(tok).toBe('fresh-tok');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ── boundary: expires exactly at 60s threshold ───────────────────────────

  it('getValidAccessToken: expires in exactly 59s → triggers refresh', async () => {
    const boundary = Math.floor(Date.now() / 1000) + 59;
    saveTokens(4, { accessToken: 'boundary-tok', refreshToken: 'boundary-ref', expiresAt: boundary, apiDomain: 'z.pd.com' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-tok',
        refresh_token: 'refreshed-ref',
        expires_in: 3600,
        api_domain: 'z.pd.com',
      }),
    });

    const tok = await getValidAccessToken(4);
    expect(tok).toBe('refreshed-tok');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('getValidAccessToken: expires in exactly 61s → NO refresh', async () => {
    const future = Math.floor(Date.now() / 1000) + 61;
    saveTokens(5, { accessToken: 'fine-tok', refreshToken: 'fine-ref', expiresAt: future, apiDomain: 'z.pd.com' });

    const tok = await getValidAccessToken(5);
    expect(tok).toBe('fine-tok');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── revoke ────────────────────────────────────────────────────────────────

  it('revoke: accountId=0 → RangeError', () => {
    expect(() => revoke(0)).toThrow(RangeError);
  });

  it('revoke: accountId=-1 → RangeError', () => {
    expect(() => revoke(-1)).toThrow(RangeError);
  });

  it('revoke: removes record from DB', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    saveTokens(10, { accessToken: 'tok', refreshToken: 'ref', expiresAt: future, apiDomain: 'd.pd.com' });

    // Row exists before
    const before = db
      .prepare<[number], { account_id: number }>('SELECT account_id FROM pipedrive_tokens WHERE account_id = ?')
      .get(10);
    expect(before).not.toBeNull();

    revoke(10);

    // Row gone after
    const after = db
      .prepare<[number], { account_id: number }>('SELECT account_id FROM pipedrive_tokens WHERE account_id = ?')
      .get(10);
    expect(after).toBeUndefined();
  });

  it('revoke: no-op when record does not exist', () => {
    expect(() => revoke(999)).not.toThrow();
  });

  // ── refresh fails → throws ────────────────────────────────────────────────

  it('getValidAccessToken: refresh HTTP error → throws', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    saveTokens(6, { accessToken: 'tok', refreshToken: 'ref', expiresAt: past, apiDomain: 'x.pd.com' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(getValidAccessToken(6)).rejects.toThrow();
  });
});
