/**
 * Unit tests for JWC bulletin chunker
 * Tests chunk sizing, region extraction, metadata, splitting, and edge cases
 */

import { chunkJwc } from '@/lib/knowledge/sources/jwc/chunker';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';
import sampleBulletins from '../../fixtures/jwc-bulletins-sample.json';

// JwcScrapedBulletin type definition (from spec-17)
interface JwcScrapedBulletin {
  id: string;
  publishDate: string;
  title: string;
  rawText: string;
  sourceUrl: string;
}

const bulletins = sampleBulletins as JwcScrapedBulletin[];

describe('chunkJwc', () => {
  describe('Input Contract - Boundary Tests', () => {
    // TC-NBI-01: Empty bulletins array
    it('TC-NBI-01: should return empty array for empty bulletins input', () => {
      const result = chunkJwc([]);
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    // TC-NBI-02: Empty rawText
    it('TC-NBI-02: should skip bulletin with empty rawText', () => {
      const emptyBulletin = bulletins.find((b) => b.id === 'jwc-006');
      expect(emptyBulletin).toBeDefined();
      expect(emptyBulletin!.rawText).toBe('');

      const result = chunkJwc([emptyBulletin!]);
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    // TC-NBI-03: Whitespace-only rawText
    it('TC-NBI-03: should skip bulletin with whitespace-only rawText', () => {
      const whitespaceBulletin = bulletins.find((b) => b.id === 'jwc-007');
      expect(whitespaceBulletin).toBeDefined();
      expect(whitespaceBulletin!.rawText.trim()).toBe('');

      const result = chunkJwc([whitespaceBulletin!]);
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    // TC-NBI-04: Very long bulletin without paragraph breaks
    it('TC-NBI-04: should split very long bulletin (50k chars) on sentence boundaries', () => {
      const longSentence =
        'This is a sentence about war risk in the Black Sea. '.repeat(900);
      const longBulletin: JwcScrapedBulletin = {
        id: 'jwc-long-001',
        publishDate: '2024-01-01T00:00:00.000Z',
        title: 'Long Bulletin Test',
        rawText: longSentence,
        sourceUrl: 'https://example.com/jwc/long-001',
      };

      const result = chunkJwc([longBulletin]);

      // Each chunk should be ≤ 8000 chars
      result.forEach((chunk) => {
        expect(chunk.content.length).toBeLessThanOrEqual(8000);
      });

      // Should produce multiple chunks
      expect(result.length).toBeGreaterThan(1);

      // chunkIndex should increment
      result.forEach((chunk, idx) => {
        expect(chunk.metadata.chunkIndex).toBe(idx);
      });
    });

    // TC-NBI-05: Very long single sentence (no periods except at end)
    it('TC-NBI-05: should split very long single sentence at word boundaries', () => {
      const longWords =
        'word '.repeat(3000) + 'final word in the Black Sea area.';
      const longBulletin: JwcScrapedBulletin = {
        id: 'jwc-long-002',
        publishDate: '2024-01-01T00:00:00.000Z',
        title: 'Long Single Sentence Test',
        rawText: longWords,
        sourceUrl: 'https://example.com/jwc/long-002',
      };

      const result = chunkJwc([longBulletin]);

      // Should split into multiple chunks
      expect(result.length).toBeGreaterThan(1);

      // Each chunk should be ≤ 8000 chars
      result.forEach((chunk) => {
        expect(chunk.content.length).toBeLessThanOrEqual(8000);
      });

      // Chunks should have proper indices
      result.forEach((chunk, idx) => {
        expect(chunk.metadata.chunkIndex).toBe(idx);
      });
    });

    // TC-NBI-06: No regions in text
    it('TC-NBI-06: should return empty regions array when no regions detected', () => {
      const noRegionBulletin = bulletins.find((b) => b.id === 'jwc-005');
      expect(noRegionBulletin).toBeDefined();

      const result = chunkJwc([noRegionBulletin!]);
      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toEqual([]);
      expect(Array.isArray(result[0].metadata.regions)).toBe(true);
    });
  });

  describe('Basic Chunking Behavior', () => {
    // Single short bulletin produces 1 chunk
    it('should produce exactly 1 chunk for short bulletin (~500 words)', () => {
      const shortBulletin = bulletins.find((b) => b.id === 'jwc-001');
      expect(shortBulletin).toBeDefined();

      const result = chunkJwc([shortBulletin!]);
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Black Sea');
      expect(result[0].metadata.chunkIndex).toBe(0);
    });

    // Multiple bulletins produce chunks in order
    it('should produce chunks from multiple bulletins in order', () => {
      const bulletin1 = bulletins.find((b) => b.id === 'jwc-001');
      const bulletin2 = bulletins.find((b) => b.id === 'jwc-002');
      expect(bulletin1).toBeDefined();
      expect(bulletin2).toBeDefined();

      const result = chunkJwc([bulletin1!, bulletin2!]);
      expect(result.length).toBeGreaterThanOrEqual(2);

      // First chunk should be from bulletin1
      expect(result[0].metadata.bulletinId).toBe('jwc-001');
      // There should be at least one chunk from bulletin2
      const bulletin2Chunks = result.filter(
        (c) => c.metadata.bulletinId === 'jwc-002'
      );
      expect(bulletin2Chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Region Extraction', () => {
    // Black Sea and Sea of Azov extraction
    it('should extract Black Sea and Sea of Azov from bulletin text', () => {
      const bulletin = bulletins.find((b) => b.id === 'jwc-001');
      expect(bulletin).toBeDefined();
      expect(bulletin!.rawText).toContain('Black Sea');
      expect(bulletin!.rawText).toContain('Sea of Azov');

      const result = chunkJwc([bulletin!]);
      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toContain('Black Sea');
      expect(result[0].metadata.regions).toContain('Sea of Azov');
    });

    // Russian text region extraction
    it('should extract Persian Gulf from Russian text (Персидский залив)', () => {
      const bulletin = bulletins.find((b) => b.id === 'jwc-004');
      expect(bulletin).toBeDefined();
      expect(bulletin!.rawText).toContain('Персидский залив');

      const result = chunkJwc([bulletin!]);
      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toContain('Persian Gulf');
    });

    // Multiple regions in comprehensive advisory
    it('should extract multiple regions from comprehensive bulletin', () => {
      const bulletin = bulletins.find((b) => b.id === 'jwc-008');
      expect(bulletin).toBeDefined();

      const result = chunkJwc([bulletin!]);
      const regions = result[0].metadata.regions;

      // Should detect many regions (at least 10)
      expect(regions.length).toBeGreaterThanOrEqual(10);

      // Verify specific regions
      expect(regions).toContain('Black Sea');
      expect(regions).toContain('Red Sea');
      expect(regions).toContain('Persian Gulf');
      expect(regions).toContain('Gulf of Aden');
      expect(regions).toContain('Gulf of Oman');
      expect(regions).toContain('Suez Canal');
      expect(regions).toContain('Mediterranean');
      expect(regions).toContain('Libya');
      expect(regions).toContain('Israel');
      expect(regions).toContain('Lebanon');
      expect(regions).toContain('Nigeria');
      expect(regions).toContain('South China Sea');
      expect(regions).toContain('Malacca Strait');
      expect(regions).toContain('Indian Ocean');
      expect(regions).toContain('Somalia');
      expect(regions).toContain('Arabian Sea');
    });

    // Region deduplication
    it('should deduplicate regions when mentioned multiple times', () => {
      const bulletin = bulletins.find((b) => b.id === 'jwc-009');
      expect(bulletin).toBeDefined();
      // This bulletin mentions "Black Sea" three times
      const blackSeaCount = (bulletin!.rawText.match(/Black Sea/gi) || [])
        .length;
      expect(blackSeaCount).toBeGreaterThanOrEqual(3);

      const result = chunkJwc([bulletin!]);
      expect(result).toHaveLength(1);

      // Should have Black Sea only once in regions array
      const regions = result[0].metadata.regions;
      const blackSeaInRegions = regions.filter((r: string) => r === 'Black Sea')
        .length;
      expect(blackSeaInRegions).toBe(1);
    });

    // Case-insensitive matching
    it('should perform case-insensitive region matching', () => {
      const bulletin: JwcScrapedBulletin = {
        id: 'jwc-case-test',
        publishDate: '2024-01-01T00:00:00.000Z',
        title: 'Case Test',
        rawText:
          'Risk in the black sea, BLACK SEA, and Black Sea regions. Also RED SEA and red sea.',
        sourceUrl: 'https://example.com/jwc/case-test',
      };

      const result = chunkJwc([bulletin]);
      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toContain('Black Sea');
      expect(result[0].metadata.regions).toContain('Red Sea');

      // Should have each region only once despite different cases
      const regions = result[0].metadata.regions;
      const blackSeaCount = regions.filter((r: string) => r === 'Black Sea').length;
      const redSeaCount = regions.filter((r: string) => r === 'Red Sea').length;
      expect(blackSeaCount).toBe(1);
      expect(redSeaCount).toBe(1);
    });
  });

  describe('Metadata Correctness', () => {
    it('should include correct metadata for each chunk', () => {
      const bulletin = bulletins.find((b) => b.id === 'jwc-001');
      expect(bulletin).toBeDefined();

      const result = chunkJwc([bulletin!]);
      expect(result).toHaveLength(1);

      const chunk = result[0];
      expect(chunk.metadata.source).toBe('jwc');
      expect(chunk.metadata.sourceUrl).toBe(bulletin!.sourceUrl);
      expect(chunk.metadata.title).toBe(bulletin!.title);
      expect(chunk.metadata.bulletinId).toBe(bulletin!.id);
      expect(chunk.metadata.publishDate).toBe(bulletin!.publishDate);
      expect(chunk.metadata.chunkIndex).toBe(0);
      expect(Array.isArray(chunk.metadata.regions)).toBe(true);
    });

    it('should have incrementing chunkIndex for multi-chunk bulletins', () => {
      const longSentence =
        'This is a sentence about war risk in the Red Sea. '.repeat(900);
      const longBulletin: JwcScrapedBulletin = {
        id: 'jwc-multi-chunk',
        publishDate: '2024-01-01T00:00:00.000Z',
        title: 'Multi-Chunk Test',
        rawText: longSentence,
        sourceUrl: 'https://example.com/jwc/multi-chunk',
      };

      const result = chunkJwc([longBulletin]);
      expect(result.length).toBeGreaterThan(1);

      // Verify chunkIndex sequence
      result.forEach((chunk, idx) => {
        expect(chunk.metadata.chunkIndex).toBe(idx);
        expect(chunk.metadata.bulletinId).toBe('jwc-multi-chunk');
        expect(chunk.metadata.source).toBe('jwc');
      });
    });
  });

  describe('Whitespace Normalization', () => {
    it('should normalize whitespace in chunk content', () => {
      const bulletin: JwcScrapedBulletin = {
        id: 'jwc-whitespace',
        publishDate: '2024-01-01T00:00:00.000Z',
        title: 'Whitespace Test',
        rawText:
          '  Multiple   spaces   and\n\n\nnewlines   should   be   normalized.  ',
        sourceUrl: 'https://example.com/jwc/whitespace',
      };

      const result = chunkJwc([bulletin]);
      expect(result).toHaveLength(1);

      const content = result[0].content;
      // Should not have leading/trailing whitespace
      expect(content).toBe(content.trim());
      // Should not have multiple consecutive spaces
      expect(content).not.toMatch(/  +/);
    });
  });

  describe('Chunk Size Constraints', () => {
    it('should ensure all chunks are within 8000 char limit', () => {
      const veryLongText =
        'This is a long bulletin about war risk. '.repeat(500);
      const bulletin: JwcScrapedBulletin = {
        id: 'jwc-size-test',
        publishDate: '2024-01-01T00:00:00.000Z',
        title: 'Size Test',
        rawText: veryLongText,
        sourceUrl: 'https://example.com/jwc/size-test',
      };

      const result = chunkJwc([bulletin]);

      result.forEach((chunk) => {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.content.length).toBeLessThanOrEqual(8000);
      });
    });
  });

  describe('Mixed Scenarios', () => {
    it('should handle mix of valid and invalid bulletins', () => {
      const validBulletin = bulletins.find((b) => b.id === 'jwc-001');
      const emptyBulletin = bulletins.find((b) => b.id === 'jwc-006');
      const whitespaceBulletin = bulletins.find((b) => b.id === 'jwc-007');

      const result = chunkJwc([
        validBulletin!,
        emptyBulletin!,
        whitespaceBulletin!,
      ]);

      // Should only produce chunk from valid bulletin
      expect(result).toHaveLength(1);
      expect(result[0].metadata.bulletinId).toBe('jwc-001');
    });
  });
});
