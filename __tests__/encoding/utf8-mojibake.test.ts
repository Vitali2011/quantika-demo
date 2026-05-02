/**
 * βf2-03 — UTF-8 mojibake regression guard
 *
 * Root cause: lib/sample-data/client-replies.json had latin1-as-utf8 encoded
 * characters (e.g. "MÃ¼ller" instead of "Müller"). Fixed by rewriting the
 * corrupted strings with correct UTF-8 literals.
 *
 * This test:
 * 1. Verifies the fixture no longer contains mojibake sequences.
 * 2. Verifies a decode helper is idempotent on clean input.
 * 3. Verifies ASCII passes through unchanged.
 */

import clientReplies from '@/lib/sample-data/client-replies.json';

/**
 * Detects latin1-double-encoded (mojibake) byte sequences in a string.
 * These appear when UTF-8 bytes are interpreted as latin1 and then
 * re-encoded as UTF-8 (e.g. "ü" → "Ã¼").
 */
function hasMojibake(str: string): boolean {
  // Common mojibake patterns from latin1→utf8 double-encode
  return /Ã[¡-¿]|â€[""–—]/.test(str);
}

/**
 * Decode a latin1-double-encoded string back to UTF-8.
 * If the string is already clean, it is returned unchanged (idempotent).
 */
function decodeMojibake(input: string): string {
  if (!hasMojibake(input)) return input;
  // Re-interpret the UTF-8 string as latin1 bytes to recover original UTF-8
  return Buffer.from(input, 'latin1').toString('utf8');
}

describe('UTF-8 mojibake — fixture guard (βf2-03)', () => {
  it('fixture has no mojibake in body/snippet fields', () => {
    for (const reply of clientReplies) {
      const r = reply as Record<string, unknown>;
      if (typeof r.body === 'string') {
        expect(hasMojibake(r.body)).toBe(false);
      }
      if (typeof r.snippet === 'string') {
        expect(hasMojibake(r.snippet)).toBe(false);
      }
    }
  });

  it('decodeMojibake converts mojibake input to clean UTF-8', () => {
    expect(decodeMojibake('MÃ¼ller GmbH')).toBe('Müller GmbH');
  });

  it('decodeMojibake is idempotent on already-clean UTF-8 input', () => {
    expect(decodeMojibake('Müller GmbH')).toBe('Müller GmbH');
  });

  it('decodeMojibake is a no-op for plain ASCII', () => {
    expect(decodeMojibake('Plain ASCII')).toBe('Plain ASCII');
  });
});
