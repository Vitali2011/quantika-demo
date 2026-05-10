/**
 * lib/auth/cookie.ts
 * HMAC-signed auth cookie helpers using Web Crypto API (Edge Runtime compatible).
 *
 * Cookie value format: <base64url(payload)>.<hex(hmac-sha256(payload, secret))>
 * Payload: JSON { user: string, exp: number }  — exp is ms timestamp (Date.now() + N days).
 */

export interface AuthPayload {
  user: string;
  exp: number;
}

/** Name of the auth cookie. */
export const AUTH_COOKIE_NAME = 'demo_auth';

// ---------- internal helpers ----------

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Convert to base64 then make URL-safe
  const b64 = btoa(String.fromCharCode(...arr));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const raw = atob(b64 + pad);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- public API ----------

/**
 * Sign a cookie value for the given user.
 * @param user    Username to embed
 * @param secret  DEMO_AUTH_SECRET
 * @param days    Validity in days
 */
export async function signAuthCookie(
  user: string,
  secret: string,
  days: number,
): Promise<string> {
  const payload: AuthPayload = {
    user,
    exp: Date.now() + days * 86_400_000,
  };

  const enc = new TextEncoder();
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)));

  const key = await importKey(secret);
  const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sig = toHex(sigBuf);

  return `${payloadB64}.${sig}`;
}

/**
 * Verify a cookie value. Returns the payload if valid, null otherwise.
 */
export async function verifyAuthCookie(
  value: string,
  secret: string,
): Promise<AuthPayload | null> {
  try {
    if (!value || !value.includes('.')) return null;

    const dotIdx = value.indexOf('.');
    const payloadB64 = value.slice(0, dotIdx);
    const sig = value.slice(dotIdx + 1);

    if (!payloadB64 || !sig) return null;

    // Re-compute expected signature
    const enc = new TextEncoder();
    const key = await importKey(secret);
    const sigBuf = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
    const expectedSig = toHex(sigBuf);

    // Constant-time compare (timing-safe)
    if (!timingSafeEqual(sig, expectedSig)) return null;

    // Decode payload
    const payloadBytes = fromBase64Url(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadStr) as AuthPayload;

    // Check expiry
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
