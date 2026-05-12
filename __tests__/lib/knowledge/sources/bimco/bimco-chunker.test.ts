/**
 * RED tests for bimco-chunker (spec gamma-09)
 * Input contract coverage from .specs/gamma-09-input-contracts.md
 */

import { chunkBimco } from '@/lib/knowledge/sources/bimco/chunker';

describe('bimco-chunker', () => {
  // TC-BC-01: Empty rawText → return []
  it('returns empty array for empty rawText', () => {
    const result = chunkBimco('', 'GENCON 2022');
    expect(result).toEqual([]);
  });

  // TC-BC-02: null rawText → return []
  it('returns empty array for null rawText', () => {
    const result = chunkBimco(null as any, 'GENCON 2022');
    expect(result).toEqual([]);
  });

  // TC-BC-03: undefined rawText → return []
  it('returns empty array for undefined rawText', () => {
    const result = chunkBimco(undefined as any, 'GENCON 2022');
    expect(result).toEqual([]);
  });

  // TC-BC-04: Invalid charterParty → throw Error
  it('throws Error for invalid charterParty', () => {
    expect(() => chunkBimco('some text', 'INVALID' as any)).toThrow('Invalid charterParty');
  });

  // TC-BC-05: Non-string rawText → throw TypeError
  it('throws TypeError for non-string rawText (number)', () => {
    expect(() => chunkBimco(123 as any, 'GENCON 2022')).toThrow(TypeError);
  });

  // TC-BC-06: Non-string rawText → throw TypeError (object)
  it('throws TypeError for non-string rawText (object)', () => {
    expect(() => chunkBimco({} as any, 'GENCON 2022')).toThrow(TypeError);
  });

  // TC-BC-07: Non-string rawText → throw TypeError (array)
  it('throws TypeError for non-string rawText (array)', () => {
    expect(() => chunkBimco([] as any, 'GENCON 2022')).toThrow(TypeError);
  });

  // TC-BC-08: Valid text → returns BimcoClause array with correct structure
  it('returns BimcoClause array with correct structure', () => {
    const rawText = `
      Clause 1: Vessel Name
      The vessel shall be named as per the charter party.

      Clause 2: Cargo
      The cargo shall be loaded as per specifications.
    `;
    const result = chunkBimco(rawText, 'GENCON 2022');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    // Verify structure of first clause
    const firstClause = result[0];
    expect(firstClause).toHaveProperty('id');
    expect(firstClause).toHaveProperty('charterParty');
    expect(firstClause).toHaveProperty('clauseNumber');
    expect(firstClause).toHaveProperty('title');
    expect(firstClause).toHaveProperty('text');
    expect(firstClause).toHaveProperty('sourceUrl');
  });

  // TC-BC-09: Each chunk has non-empty text
  it('ensures all chunks have non-empty text', () => {
    const rawText = `
      Clause 1: Test
      Content here.

      Clause 2: Another
      More content.
    `;
    const result = chunkBimco(rawText, 'HEAVYCON');

    result.forEach((clause) => {
      expect(clause.text).toBeTruthy();
      expect(clause.text.length).toBeGreaterThan(0);
    });
  });

  // TC-BC-10: charterParty field set correctly
  it('sets charterParty field correctly for GENCON 2022', () => {
    const rawText = 'Clause 1: Test\nSome content.';
    const result = chunkBimco(rawText, 'GENCON 2022');

    result.forEach((clause) => {
      expect(clause.charterParty).toBe('GENCON 2022');
    });
  });

  // TC-BC-11: charterParty field set correctly for HEAVYCON
  it('sets charterParty field correctly for HEAVYCON', () => {
    const rawText = 'Clause 1: Test\nSome content.';
    const result = chunkBimco(rawText, 'HEAVYCON');

    result.forEach((clause) => {
      expect(clause.charterParty).toBe('HEAVYCON');
    });
  });

  // TC-BC-12: charterParty field set correctly for PROJECTCON
  it('sets charterParty field correctly for PROJECTCON', () => {
    const rawText = 'Clause 1: Test\nSome content.';
    const result = chunkBimco(rawText, 'PROJECTCON');

    result.forEach((clause) => {
      expect(clause.charterParty).toBe('PROJECTCON');
    });
  });

  // TC-BC-13: Very large text (no arbitrary limit)
  it('processes very large text without errors', () => {
    // Generate a 1MB string
    const largeText = 'Clause 1: Test\n' + 'x'.repeat(1024 * 1024);
    expect(() => chunkBimco(largeText, 'GENCON 2022')).not.toThrow();
  });

  // TC-BC-14: Whitespace-only rawText → return []
  it('returns empty array for whitespace-only rawText', () => {
    const result = chunkBimco('   \n\n\t  ', 'GENCON 2022');
    expect(result).toEqual([]);
  });
});
