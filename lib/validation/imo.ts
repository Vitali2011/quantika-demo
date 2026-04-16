/**
 * IMO number validation — catches LLM-hallucinated vessel identifiers.
 *
 * IMO format: 7 digits. The last digit is a checksum computed as
 *   (d1*7 + d2*6 + d3*5 + d4*4 + d5*3 + d6*2) mod 10 = d7
 *
 * Real IMO numbers start from 1000000 (historical) but modern issuance is
 * in the 9000000+ range. We accept anything 1000000-9999999 with valid
 * checksum — broader acceptance reduces false negatives on older tonnage.
 */

export interface ImoValidation {
  valid: boolean;
  normalized?: string;      // 7-digit form, no prefix
  reason?: string;
}

function stripImoPrefix(raw: string): string {
  // Strip leading "IMO", "IMO:", "IMO ", "imo" etc.
  return raw.replace(/^\s*imo\s*:?\s*/i, '').trim();
}

export function validateImo(raw: string | null | undefined): ImoValidation {
  if (!raw || typeof raw !== 'string') return { valid: false, reason: 'empty input' };
  const cleaned = stripImoPrefix(raw).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(cleaned)) return { valid: false, reason: 'IMO must be numeric' };
  if (cleaned.length !== 7) return { valid: false, reason: `IMO must be 7 digits (got ${cleaned.length})` };

  const n = parseInt(cleaned, 10);
  if (n < 1_000_000) return { valid: false, reason: 'IMO out of valid range' };

  const digits = cleaned.split('').map(Number);
  const sum =
    digits[0] * 7 +
    digits[1] * 6 +
    digits[2] * 5 +
    digits[3] * 4 +
    digits[4] * 3 +
    digits[5] * 2;
  const expected = sum % 10;
  if (expected !== digits[6]) {
    return { valid: false, reason: `IMO checksum mismatch (got ${digits[6]}, expected ${expected})` };
  }
  return { valid: true, normalized: cleaned };
}

/**
 * Extract a valid IMO from free-form text (vessel description, email body).
 * Returns the canonical 7-digit string, or null if none found.
 */
export function extractImo(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  // Prefer explicit "IMO <digits>" matches
  const explicit = text.match(/imo\s*:?\s*(\d{7})/i);
  if (explicit) {
    const r = validateImo(explicit[1]);
    if (r.valid && r.normalized) return r.normalized;
  }
  // Fallback: any 7-digit sequence — validate each
  const matches = text.match(/\b\d{7}\b/g) || [];
  for (const m of matches) {
    const r = validateImo(m);
    if (r.valid && r.normalized) return r.normalized;
  }
  return null;
}
