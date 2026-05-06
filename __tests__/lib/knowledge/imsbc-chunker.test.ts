/**
 * Unit tests for IMSBC chunker
 * Spec: spec-13-chunkimsbc-sections
 */

import { chunkImsbc } from '@/lib/knowledge/sources/imsbc/chunker';
import type { ScrapedSection } from '@/lib/knowledge/sources/imsbc/scraper';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';

describe('chunkImsbc', () => {
  describe('Input Contract — Boundary Tests', () => {
    /**
     * TC-NBI-01: Empty array → return []
     * Input Contract row: Empty array | [] | Return [] (no error)
     */
    it('should return empty array when given empty sections array', () => {
      const sections: ScrapedSection[] = [];
      const result = chunkImsbc(sections);
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
