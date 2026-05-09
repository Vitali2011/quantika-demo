/**
 * Unit tests for IGC chunker
 * Focuses on the htmlToPlainText spacing fix for inline tags.
 */

import { chunkIgc } from '@/lib/knowledge/sources/igc/chunker';
import type { ScrapedSection } from '@/lib/knowledge/sources/igc/scraper';

describe('chunkIgc', () => {
  describe('Input Contract — Boundary Tests', () => {
    it('should return empty array when given empty sections array', () => {
      const result = chunkIgc([]);
      expect(result).toEqual([]);
    });

    it('should skip sections with empty rawHtml', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Section 1',
          rawHtml: '',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result).toEqual([]);
    });
  });

  describe('HTML Processing', () => {
    /**
     * TC-IGC-SPACE-01: Adjacent inline tags without whitespace
     * Bug: "6<span>Information</span><span>regarding</span>" → "6Information..." (run-together)
     * Fix: replace tags with ' ' first, then normalise spaces
     */
    it('should insert space between words when adjacent inline tags are stripped', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-6',
          title: 'Grain Loading',
          rawHtml:
            '<p>6<span>Information</span><span>regarding</span><span>ships stability</span><span>and grain loading</span></p>',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC6.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result.length).toBeGreaterThan(0);
      // Must NOT be run-together
      expect(result[0].content).not.toContain('6Information');
      expect(result[0].content).not.toContain('Informationregarding');
      expect(result[0].content).not.toContain('regardingships');
      // Must have spaces
      expect(result[0].content).toBe(
        '6 Information regarding ships stability and grain loading'
      );
    });

    /**
     * TC-IGC-SPACE-02: <strong> tag without surrounding whitespace
     */
    it('should insert space when <strong> tag stripped without surrounding whitespace', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test',
          rawHtml: '<p><strong>Rule:</strong>No space before this text.</p>',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).not.toContain('Rule:No');
      expect(result[0].content).toContain('Rule:');
      expect(result[0].content).toContain('No space');
    });

    it('should strip HTML tags and preserve text content', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: '<p>This is <b>bold</b> and <i>italic</i> text.</p>',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).toBe('This is bold and italic text.');
      expect(result[0].content).not.toContain('<');
      expect(result[0].content).not.toContain('>');
    });

    it('should decode HTML entities correctly', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: '<p>A &amp; B &lt; C &gt; D&nbsp;E</p>',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result.length).toBe(1);
      expect(result[0].content).toContain('A & B < C > D E');
    });

    it('should strip script tags and content', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-1',
          title: 'Test Section',
          rawHtml: '<p>Safe content</p><script>alert("xss")</script><p>More content</p>',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC1.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].content).not.toContain('script');
      expect(result[0].content).not.toContain('alert');
      expect(result[0].content).toContain('Safe content');
    });
  });

  describe('Chunk Metadata', () => {
    it('should attach correct metadata to chunks', () => {
      const sections: ScrapedSection[] = [
        {
          sectionId: 'SECTION-6',
          title: 'Grain Loading',
          rawHtml: '<p>Some content here.</p>',
          sourceUrl: 'https://www.imorules.com/INTGRAIN_SEC6.html',
        },
      ];
      const result = chunkIgc(sections);
      expect(result.length).toBe(1);
      expect(result[0].metadata.source).toBe('igc');
      expect(result[0].metadata.sourceUrl).toBe('https://www.imorules.com/INTGRAIN_SEC6.html');
      expect(result[0].metadata.section).toBe('SECTION-6');
      expect(result[0].metadata.title).toBe('Grain Loading');
      expect(result[0].metadata.subsectionIndex).toBe(0);
    });
  });
});
