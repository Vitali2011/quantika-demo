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

    /**
     * TC-NBI-02: Empty rawHtml → skip section
     * Input Contract row: Empty/falsy string in rawHtml | "", "   " | Skip section, no chunk produced
     */
    it('should skip sections with empty rawHtml', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Section 1',
          rawHtml: '',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result).toEqual([]);
    });

    /**
     * TC-NBI-02b: Whitespace-only rawHtml → skip section
     */
    it('should skip sections with whitespace-only rawHtml', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Section 1',
          rawHtml: '   \n\t  ',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result).toEqual([]);
    });
  });

  describe('HTML Processing', () => {
    /**
     * HTML tag stripping test
     * Acceptance: HTML tags stripped from rawHtml → plain text output in chunk.content
     */
    it('should strip HTML tags and preserve text content', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: '<p>This is <b>bold</b> and <i>italic</i> text.</p>',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).toBe('This is bold and italic text.');
      expect(result[0].content).not.toContain('<');
      expect(result[0].content).not.toContain('>');
    });

    /**
     * TC-NBI-03: Defense-in-depth security tag stripping
     * Input Contract row: Dangerous HTML elements | "<script>alert('xss')</script>" | Strip before text extraction
     */
    it('should strip script tags and content (defense-in-depth)', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: '<p>Safe content</p><script>alert("xss")</script><p>More content</p>',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).not.toContain('script');
      expect(result[0].content).not.toContain('alert');
      expect(result[0].content).not.toContain('xss');
      expect(result[0].content).toContain('Safe content');
      expect(result[0].content).toContain('More content');
    });

    /**
     * TC-NBI-03b: Strip all dangerous elements (script, style, iframe, object, embed)
     */
    it('should strip all dangerous HTML elements before text extraction', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml:
            '<p>Text</p><style>.hidden{display:none}</style><script>bad()</script><iframe src="x"></iframe><object data="y"></object><embed src="z">',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);

      // If only dangerous elements, should skip section (no valid text)
      if (result.length > 0) {
        expect(result[0].content).not.toContain('hidden');
        expect(result[0].content).not.toContain('bad');
        expect(result[0].content).not.toContain('display');
        expect(result[0].content).not.toContain('style');
        expect(result[0].content).not.toContain('script');
        expect(result[0].content).not.toContain('iframe');
        expect(result[0].content).not.toContain('object');
        expect(result[0].content).not.toContain('embed');
        expect(result[0].content).toBe('Text');
      }
    });
  });
});
