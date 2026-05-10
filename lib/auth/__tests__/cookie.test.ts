/**
 * Tests for lib/auth/cookie.ts
 * HMAC-signed auth cookie: sign/verify roundtrip, tampering, expiry, missing secret.
 */

// Use the Node.js crypto module directly in tests (non-Edge env)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder as typeof global.TextEncoder;

// Polyfill globalThis.crypto for Node test env
import { webcrypto } from 'node:crypto';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

describe('lib/auth/cookie', () => {
  const SECRET = 'test-secret-key-32bytes-minimum!!';
  const USER = 'admin';

  beforeEach(() => {
    jest.resetModules();
  });

  async function getCookieModule() {
    return import('../cookie');
  }

  describe('signAuthCookie / verifyAuthCookie roundtrip', () => {
    it('returns a valid payload for a freshly signed cookie', async () => {
      const { signAuthCookie, verifyAuthCookie } = await getCookieModule();
      const value = await signAuthCookie(USER, SECRET, 7);
      expect(typeof value).toBe('string');
      const result = await verifyAuthCookie(value, SECRET);
      expect(result).not.toBeNull();
      expect(result!.user).toBe(USER);
      expect(result!.exp).toBeGreaterThan(Date.now());
    });

    it('contains two parts separated by a dot', async () => {
      const { signAuthCookie } = await getCookieModule();
      const value = await signAuthCookie(USER, SECRET, 7);
      const parts = value.split('.');
      expect(parts).toHaveLength(2);
    });
  });

  describe('tampering detection', () => {
    it('rejects a cookie with modified payload', async () => {
      const { signAuthCookie, verifyAuthCookie } = await getCookieModule();
      const value = await signAuthCookie(USER, SECRET, 7);
      const [payload, sig] = value.split('.');
      // Flip a char in the payload
      const tampered = payload.slice(0, -1) + (payload.slice(-1) === 'a' ? 'b' : 'a');
      const result = await verifyAuthCookie(`${tampered}.${sig}`, SECRET);
      expect(result).toBeNull();
    });

    it('rejects a cookie with modified signature', async () => {
      const { signAuthCookie, verifyAuthCookie } = await getCookieModule();
      const value = await signAuthCookie(USER, SECRET, 7);
      const [payload, sig] = value.split('.');
      const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === 'a' ? 'b' : 'a');
      const result = await verifyAuthCookie(`${payload}.${tamperedSig}`, SECRET);
      expect(result).toBeNull();
    });

    it('rejects a cookie signed with a different secret', async () => {
      const { signAuthCookie, verifyAuthCookie } = await getCookieModule();
      const value = await signAuthCookie(USER, 'another-secret-key-32bytes!!!!!!', 7);
      const result = await verifyAuthCookie(value, SECRET);
      expect(result).toBeNull();
    });
  });

  describe('expiry', () => {
    it('rejects an expired cookie', async () => {
      const { signAuthCookie, verifyAuthCookie } = await getCookieModule();
      // Sign with -1 days (already expired)
      const value = await signAuthCookie(USER, SECRET, -1);
      const result = await verifyAuthCookie(value, SECRET);
      expect(result).toBeNull();
    });
  });

  describe('missing / malformed cookie', () => {
    it('returns null for empty string', async () => {
      const { verifyAuthCookie } = await getCookieModule();
      expect(await verifyAuthCookie('', SECRET)).toBeNull();
    });

    it('returns null for a cookie missing the dot separator', async () => {
      const { verifyAuthCookie } = await getCookieModule();
      expect(await verifyAuthCookie('nodot', SECRET)).toBeNull();
    });

    it('returns null for a cookie with invalid base64 payload', async () => {
      const { verifyAuthCookie } = await getCookieModule();
      expect(await verifyAuthCookie('!!!.abc123', SECRET)).toBeNull();
    });
  });
});
