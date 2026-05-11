/**
 * Adversarial regression tests for verifyWebhookSignature
 * Focus: security edge cases — empty secret, prefix attacks, timing.
 */

import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../lib/whatsapp/signature';

// Helper: compute correct sha256 HMAC for given body + secret
function makeSignature(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

// ---------------------------------------------------------------------------
// H1 — CRITICAL: empty appSecret must be rejected (BUG-A1-1 candidate)
// ---------------------------------------------------------------------------
describe('H1 — empty appSecret', () => {
  const body = 'payload={"id":1}';
  const emptySecret = '';

  test('BUG-A1-1: returns false when appSecret is empty string', () => {
    // Attacker knows secret is empty → crafts valid HMAC with empty key
    const attackerSig = makeSignature(body, emptySecret);
    // Expected: false (empty secret should be treated as misconfigured)
    // If this FAILS (returns true) → BUG-A1-1 confirmed
    expect(verifyWebhookSignature(body, attackerSig, emptySecret)).toBe(false);
  });

  test('BUG-A1-1 variant: empty appSecret with empty body', () => {
    const attackerSig = makeSignature('', emptySecret);
    expect(verifyWebhookSignature('', attackerSig, emptySecret)).toBe(false);
  });

  test('BUG-A1-1 variant: empty appSecret with real-looking payload', () => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const attackerSig = makeSignature(payload, emptySecret);
    expect(verifyWebhookSignature(payload, attackerSig, emptySecret)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// H2 — wrong prefix: "hmac=<correcthex>" must be rejected
// ---------------------------------------------------------------------------
describe('H2 — wrong prefix', () => {
  const body = 'some-payload';
  const secret = 'my-secret';

  test('returns false for "hmac=<correcthex>" (wrong prefix)', () => {
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    const wrongPrefixSig = `hmac=${hex}`;
    // Length differs from "sha256=<hex>", timingSafeEqual throws → catch → false
    expect(verifyWebhookSignature(body, wrongPrefixSig, secret)).toBe(false);
  });

  test('returns false for "sha256 <correcthex>" (space instead of =)', () => {
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    const spaceSig = `sha256 ${hex}`;
    expect(verifyWebhookSignature(body, spaceSig, secret)).toBe(false);
  });

  test('returns false for "SHA256=<correcthex>" (uppercase prefix)', () => {
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    const upperSig = `SHA256=${hex}`;
    // Same length as "sha256=<hex>" but different content
    expect(verifyWebhookSignature(body, upperSig, secret)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// H3 — empty rawBody with valid signature for empty body (expected to PASS)
// ---------------------------------------------------------------------------
describe('H3 — empty rawBody with correct signature', () => {
  const secret = 'real-secret';

  test('returns true for empty rawBody if signature is correct HMAC of empty string', () => {
    const sig = makeSignature('', secret);
    // This is expected behavior: empty body is a valid request if HMAC is correct
    expect(verifyWebhookSignature('', sig, secret)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// H4 — prefix-only signature: "sha256=" (no hex appended)
// ---------------------------------------------------------------------------
describe('H4 — prefix-only signature', () => {
  const body = 'payload';
  const secret = 'real-secret';

  test('returns false for "sha256=" (prefix only, no hex)', () => {
    expect(verifyWebhookSignature(body, 'sha256=', secret)).toBe(false);
  });

  test('returns false for empty signature string', () => {
    // Already guarded by `if (!signature) return false`
    expect(verifyWebhookSignature(body, '', secret)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Baseline: correct signature with real secret must return true
// ---------------------------------------------------------------------------
describe('Baseline — valid signatures', () => {
  const body = '{"message":"hello"}';
  const secret = 'super-secret-123';

  test('returns true for correct signature', () => {
    const sig = makeSignature(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  test('returns false for tampered body', () => {
    const sig = makeSignature(body, secret);
    expect(verifyWebhookSignature(body + ' ', sig, secret)).toBe(false);
  });

  test('returns false for wrong secret', () => {
    const sig = makeSignature(body, 'wrong-secret');
    expect(verifyWebhookSignature(body, sig, secret)).toBe(false);
  });
});
