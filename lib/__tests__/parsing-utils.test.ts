/**
 * Tests for parsing utility functions used in AI route handlers.
 * These utilities are defined inline (not yet extracted to a shared module).
 */

// ---------------------------------------------------------------------------
// toConfidence — maps a numeric AI confidence value to a categorical label
// ---------------------------------------------------------------------------

function toConfidence(value: number | null | undefined): 'LOW' | 'MEDIUM' | 'HIGH' | null {
  if (value === null || value === undefined) return null;
  if (value <= 0.3) return 'LOW';
  if (value < 0.7) return 'MEDIUM';
  return 'HIGH';
}

describe('toConfidence', () => {
  it('returns null for null input', () => {
    expect(toConfidence(null)).toBeNull();
  });

  it('returns LOW for 0.0', () => {
    expect(toConfidence(0.0)).toBe('LOW');
  });

  it('returns LOW for 0.3 (inclusive boundary)', () => {
    expect(toConfidence(0.3)).toBe('LOW');
  });

  it('returns MEDIUM for 0.5', () => {
    expect(toConfidence(0.5)).toBe('MEDIUM');
  });

  it('returns HIGH for 0.7 (exclusive boundary)', () => {
    expect(toConfidence(0.7)).toBe('HIGH');
  });

  it('returns HIGH for 1.0', () => {
    expect(toConfidence(1.0)).toBe('HIGH');
  });
});

// ---------------------------------------------------------------------------
// extractNum — extracts a numeric value from a string, ignoring formatting
// ---------------------------------------------------------------------------

function extractNum(s: string): number | null {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/([\d,]+(?:\.[\d]+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

describe('extractNum', () => {
  it('returns null for empty string', () => {
    expect(extractNum('')).toBeNull();
  });

  it('parses a plain numeric string', () => {
    expect(extractNum('42')).toBe(42);
  });

  it('handles string with leading/trailing spaces', () => {
    expect(extractNum('  15  ')).toBe(15);
  });

  it('returns null for a non-numeric string', () => {
    expect(extractNum('hello')).toBeNull();
  });

  it('parses a formatted number with comma separators', () => {
    expect(extractNum('1,234.56')).toBe(1234.56);
  });

  it('extracts number embedded in a string with extra text', () => {
    expect(extractNum('price: 500 USD')).toBe(500);
  });
});
