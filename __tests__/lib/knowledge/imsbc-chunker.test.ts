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

    /**
     * HTML entity decoding test
     * Acceptance: HTML entities decoded (&amp;, &lt;, &gt;, &nbsp;, &#NNN;)
     */
    it('should decode HTML entities correctly', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: '<p>A &amp; B &lt; C &gt; D&nbsp;E &#169; &#xA9;</p>',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result.length).toBe(1);
      expect(result[0].content).toContain('A & B < C > D E');
      expect(result[0].content).toContain('©'); // Both decimal and hex should decode to copyright symbol
    });
  });

  describe('Chunk Metadata', () => {
    /**
     * Basic metadata correctness test
     * Acceptance: Metadata includes source='imsbc', sourceUrl, section, title, subsectionIndex
     */
    it('should attach correct metadata to chunks', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-42',
          title: 'Sample Section Title',
          rawHtml: '<p>Some content here.</p>',
          sourceUrl: 'https://example.com/imsbc/section-42',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result.length).toBe(1);
      expect(result[0].metadata.source).toBe('imsbc');
      expect(result[0].metadata.sourceUrl).toBe('https://example.com/imsbc/section-42');
      expect(result[0].metadata.section).toBe('SECTION-42');
      expect(result[0].metadata.title).toBe('Sample Section Title');
      expect(result[0].metadata.subsectionIndex).toBe(0);
    });

    /**
     * TC-NBI-06: Empty title/metadata strings → preserve as-is
     * Input Contract row: Empty title/metadata strings | title: "" | Preserve as-is in chunk metadata
     */
    it('should preserve empty title in metadata without error', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: '',
          title: '',
          rawHtml: '<p>Content with no title.</p>',
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result.length).toBe(1);
      expect(result[0].metadata.title).toBe('');
      expect(result[0].metadata.section).toBe('');
    });
  });

  describe('Chunk Sizing and Splitting', () => {
    /**
     * Basic chunking test — 1 section within target size → 1 chunk
     * Acceptance: Chunk size 200-600 tokens target (~800-2400 chars)
     */
    it('should produce single chunk for section within target size', () => {
      // ~1000 chars → ~250 tokens (well within 200-600 token range)
      const text = 'Lorem ipsum dolor sit amet. '.repeat(40);
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: `<p>${text}</p>`,
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);
      expect(result.length).toBe(1);

      // Verify token estimate is in range (200-600 tokens = 800-2400 chars)
      const tokenEstimate = Math.ceil(result[0].content.length / 4);
      expect(tokenEstimate).toBeGreaterThanOrEqual(200);
      expect(tokenEstimate).toBeLessThanOrEqual(600);
    });

    /**
     * TC-NBI-04: Large section splitting
     * Input Contract row: Extreme size | 50,000 chars | Split on paragraph/sentence boundaries, hard cap 8000 chars
     */
    it('should split large section into multiple chunks under hard cap', () => {
      // Create ~10,000 chars text (should produce multiple chunks)
      const paragraph = 'This is a test paragraph with sufficient content to test splitting. '.repeat(20);
      const text = (paragraph + '\n\n').repeat(30); // ~10,800 chars total

      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Large Section',
          rawHtml: `<p>${text}</p>`,
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);

      // Should split into multiple chunks
      expect(result.length).toBeGreaterThan(1);

      // Each chunk must be ≤ 8000 chars (hard cap = 2000 tokens × 4)
      for (const chunk of result) {
        expect(chunk.content.length).toBeLessThanOrEqual(8000);
      }

      // All chunks should have same section metadata
      for (const chunk of result) {
        expect(chunk.metadata.section).toBe('SECTION-1');
        expect(chunk.metadata.title).toBe('Large Section');
      }
    });

    /**
     * TC-NBI-05: Single mega-sentence hard cap enforcement
     * Input Contract row: Single mega-sentence | 12,000 chars, no '.' except end | Split at word boundary ~8000 chars
     */
    it('should split mega-sentence at word boundary when exceeding hard cap', () => {
      // Create single 12,000 char "sentence" (no periods except at end)
      const word = 'word';
      const megaSentence = (word + ' ').repeat(2400) + '.'; // 12,000+ chars, one sentence

      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Mega Sentence',
          rawHtml: `<p>${megaSentence}</p>`,
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);

      // Must split into at least 2 chunks (12000 / 8000 = 1.5)
      expect(result.length).toBeGreaterThanOrEqual(2);

      // Each chunk ≤ 8000 chars
      for (const chunk of result) {
        expect(chunk.content.length).toBeLessThanOrEqual(8000);
      }

      // First chunk should end at word boundary (not mid-word)
      expect(result[0].content.endsWith(' ') || result[0].content.endsWith('.')).toBe(true);
    });

    /**
     * Subsection splitting on SECTION headings
     * Acceptance: Splits on SECTION \d+ / APPENDIX [A-Z] heading patterns
     */
    it('should split on SECTION headings into separate chunk groups', () => {
      const html = `
        <div>
          <h2>SECTION 1</h2>
          <p>Content for section 1. This is part of the first section.</p>
          <h2>SECTION 2</h2>
          <p>Content for section 2. This belongs to the second section.</p>
        </div>
      `;

      const sections: ScrapedSection[] = [
        {
          sectionId: 'COMBINED',
          title: 'Combined Sections',
          rawHtml: html,
          sourceUrl: 'https://example.com/combined',
        },
      ];
      const result = chunkImsbc(sections);

      // Should produce at least 2 chunks (one per SECTION heading)
      expect(result.length).toBeGreaterThanOrEqual(2);

      // First chunk should contain section 1 content
      expect(result[0].content).toContain('section 1');
      expect(result[0].content).not.toContain('section 2');

      // Second chunk should contain section 2 content
      expect(result[1].content).toContain('section 2');
      expect(result[1].content).not.toContain('section 1');
    });

    /**
     * Subsection index tracking
     * Acceptance: subsectionIndex is 0-based within each section
     */
    it('should assign correct subsectionIndex to each chunk within a section', () => {
      // Create content large enough to split into 3 chunks
      const paragraph = 'Test paragraph content here. '.repeat(100);
      const text = (paragraph + '\n\n').repeat(15); // ~4500 chars → should produce ~2 chunks

      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Multi-chunk Section',
          rawHtml: `<p>${text}</p>`,
          sourceUrl: 'https://example.com/section1',
        },
      ];
      const result = chunkImsbc(sections);

      // Verify subsectionIndex increments from 0
      for (let i = 0; i < result.length; i++) {
        expect(result[i].metadata.subsectionIndex).toBe(i);
      }
    });
  });
});
