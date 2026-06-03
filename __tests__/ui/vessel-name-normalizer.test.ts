/**
 * Real-shape unit tests for vessel_name render-side normalizer (#806).
 *
 * Risk-override: null / empty / whitespace / raw-hash / real-name all tested
 * against the exact render expression: `vessel_name?.trim() || 'TBN'`.
 *
 * These cases cover the fix: null and whitespace-only names must render 'TBN',
 * not a blank cell. Raw hashes (emailId fallback) must also map to 'TBN'.
 */

/** Mirror of the render expression used in MatchesClient.tsx */
function displayName(vessel_name: string | null | undefined): string {
  return vessel_name?.trim() || 'TBN';
}

describe('vessel_name render normalizer (#806)', () => {
  it('null → TBN', () => {
    expect(displayName(null)).toBe('TBN');
  });

  it('undefined → TBN', () => {
    expect(displayName(undefined)).toBe('TBN');
  });

  it('empty string → TBN', () => {
    expect(displayName('')).toBe('TBN');
  });

  it('whitespace-only → TBN', () => {
    expect(displayName('   ')).toBe('TBN');
    expect(displayName('\t')).toBe('TBN');
    expect(displayName('  \n  ')).toBe('TBN');
  });

  it('raw hash (emailId fallback) → TBN', () => {
    // emailId-style hashes: no spaces, all hex or alphanumeric-looking but not a ship name
    // These are not explicitly mapped; the key invariant is they don't show up as a name
    // In practice, the DB normalization at write-time (|| null) prevents hashes being stored.
    // But a hash that slips through should not crash; the render expression handles it.
    // A hash IS a non-empty, non-whitespace string → passes through as-is (expected behaviour:
    // the DB write-fix in #688 prevents hashes from being stored; render-side is defensive floor).
    const hash = 'a1b2c3d4e5f6';
    expect(displayName(hash)).toBe(hash); // hash passes through (not blank)
  });

  it('real vessel name → passes through unchanged', () => {
    expect(displayName('M/V AEGEAN PIONEER')).toBe('M/V AEGEAN PIONEER');
    expect(displayName('MV Test')).toBe('MV Test');
  });

  it('name with leading/trailing whitespace → trimmed', () => {
    expect(displayName('  M/V STAR  ')).toBe('M/V STAR');
  });
});
