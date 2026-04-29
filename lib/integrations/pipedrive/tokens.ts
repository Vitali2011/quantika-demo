/**
 * Pipedrive CRM Bridge — token storage & auto-refresh
 * spec-beta-02: AES-256-GCM encrypted refresh_token, auto-refresh within 60s window
 *
 * Input contracts:
 *  - accountId must be a positive integer (> 0), else throws RangeError
 *  - accessToken / refreshToken / apiDomain must be non-empty strings, else TypeError
 *  - expiresAt must be Number.isFinite(), else throws RangeError
 *  - ENCRYPTION_KEY env must be 64-char hex (32 bytes), else throws at import time
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import type Database from 'better-sqlite3';
import type { PipedriveTokens } from './types';

// ─── Encryption key validation at module import time ─────────────────────────

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

function loadEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !HEX_64_RE.test(raw)) {
    throw new Error(
      'ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
      'Current value is missing or invalid.'
    );
  }
  return Buffer.from(raw, 'hex');
}

// This runs at import time — throws if ENCRYPTION_KEY is invalid.
const ENCRYPTION_KEY: Buffer = loadEncryptionKey();

// ─── AES-256-GCM helpers ─────────────────────────────────────────────────────

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts plaintext using AES-256-GCM.
 * Format: <iv_hex>:<ciphertext_hex>:<authTag_hex>
 */
function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Decrypts a string produced by encrypt().
 */
function decrypt(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const [ivHex, ciphertextHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = createDecipheriv(ALGO, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── DB instance management ───────────────────────────────────────────────────
// Production: lazily pulls the singleton SessionStore DB.
// Tests: replaced via _setDb() for isolation.

let _db: Database.Database | null = null;

/**
 * Test-only: inject an in-memory DB instance.
 * @internal
 */
export function _setDb(db: Database.Database): void {
  _db = db;
}

function getDb(): Database.Database {
  if (_db) return _db;
  // Lazy import to avoid circular deps at load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getStore } = require('../../session-store') as typeof import('../../session-store');
  _db = getStore().getDatabase();
  return _db as Database.Database;
}

// ─── Input validation ─────────────────────────────────────────────────────────

function assertPositiveAccountId(accountId: number): void {
  if (!Number.isInteger(accountId) || accountId <= 0) {
    throw new RangeError(`accountId must be a positive integer, got: ${accountId}`);
  }
}

function assertTokenFields(tokens: PipedriveTokens): void {
  if (!tokens.accessToken) {
    throw new TypeError('accessToken must be a non-empty string');
  }
  if (!tokens.refreshToken) {
    throw new TypeError('refreshToken must be a non-empty string');
  }
  if (!tokens.apiDomain) {
    throw new TypeError('apiDomain must be a non-empty string');
  }
  if (!Number.isFinite(tokens.expiresAt)) {
    throw new RangeError(`expiresAt must be a finite number, got: ${tokens.expiresAt}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const REFRESH_THRESHOLD_SECONDS = 60;

interface TokenRow {
  access_token: string;
  refresh_token_encrypted: string;
  expires_at: number;
  api_domain: string;
}

/**
 * Persist Pipedrive OAuth tokens for an account.
 * refresh_token is stored AES-256-GCM encrypted.
 */
export function saveTokens(accountId: number, tokens: PipedriveTokens): void {
  assertPositiveAccountId(accountId);
  assertTokenFields(tokens);

  const encryptedRefresh = encrypt(tokens.refreshToken);
  const db = getDb();

  db.prepare(
    `INSERT OR REPLACE INTO pipedrive_tokens
       (account_id, access_token, refresh_token_encrypted, expires_at, api_domain)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    accountId,
    tokens.accessToken,
    encryptedRefresh,
    tokens.expiresAt,
    tokens.apiDomain,
  );
}

/**
 * Returns a valid access token for the given account.
 * Auto-refreshes when the token expires within 60 seconds.
 */
export async function getValidAccessToken(accountId: number): Promise<string> {
  assertPositiveAccountId(accountId);

  const db = getDb();
  const row = db
    .prepare<[number], TokenRow>(
      'SELECT access_token, refresh_token_encrypted, expires_at, api_domain FROM pipedrive_tokens WHERE account_id = ?'
    )
    .get(accountId);

  if (!row) {
    throw new Error(`No Pipedrive tokens found for accountId: ${accountId}`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const needsRefresh = row.expires_at - nowSeconds < REFRESH_THRESHOLD_SECONDS;

  if (!needsRefresh) {
    return row.access_token;
  }

  // ── Perform refresh ───────────────────────────────────────────────────────
  const refreshToken = decrypt(row.refresh_token_encrypted);
  const url = `https://${row.api_domain}/oauth/token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Pipedrive token refresh failed for accountId ${accountId}: HTTP ${(response as Response & { status: number }).status}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    api_domain?: string;
  };

  const newExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  saveTokens(accountId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: newExpiresAt,
    apiDomain: data.api_domain ?? row.api_domain,
  });

  return data.access_token;
}

/**
 * Remove stored tokens for an account (no-op if not found).
 */
export function revoke(accountId: number): void {
  assertPositiveAccountId(accountId);
  const db = getDb();
  db.prepare('DELETE FROM pipedrive_tokens WHERE account_id = ?').run(accountId);
}
