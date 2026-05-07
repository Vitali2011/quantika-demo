import { chunkJwc } from '@/lib/knowledge/sources/jwc/chunker';
import type { JwcScrapedBulletin } from '@/lib/knowledge/sources/jwc/scraper';

describe('lib/knowledge/sources/jwc/chunker', () => {
  describe('chunkJwc', () => {
    // TC-NBI-05: Empty array input
    it('should return empty array for empty input', () => {
      const result = chunkJwc([]);
      expect(result).toEqual([]);
    });

    // TC-NBI-06: Empty rawText
    it('should skip bulletin with empty rawText', () => {
      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-001',
          publishDate: '2025-01-15',
          title: 'Empty Bulletin',
          rawText: '',
          sourceUrl: 'https://example.com/001',
        },
      ];

      const result = chunkJwc(bulletins);
      expect(result).toEqual([]);
    });

    // Whitespace-only rawText
    it('should skip bulletin with whitespace-only rawText', () => {
      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-002',
          publishDate: '2025-01-15',
          title: 'Whitespace Bulletin',
          rawText: '   \n\n  \t  ',
          sourceUrl: 'https://example.com/002',
        },
      ];

      const result = chunkJwc(bulletins);
      expect(result).toEqual([]);
    });

    // Short bulletin (~300 words) → 1 chunk
    it('should produce 1 chunk for short bulletin', () => {
      const shortText = 'The Joint War Committee has reviewed war risk areas. '.repeat(
        20
      );

      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-003',
          publishDate: '2025-01-15',
          title: 'Short Bulletin',
          rawText: shortText,
          sourceUrl: 'https://example.com/003',
        },
      ];

      const result = chunkJwc(bulletins);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('Joint War Committee');
      expect(result[0].metadata).toMatchObject({
        source: 'jwc',
        sourceUrl: 'https://example.com/003',
        title: 'Short Bulletin',
        bulletinId: 'JWLA-003',
        publishDate: '2025-01-15',
        chunkIndex: 0,
      });
    });

    // Long bulletin (>8000 chars) → multiple chunks
    it('should split long bulletin into multiple chunks', () => {
      const longParagraph =
        'This is a long bulletin about war risk zones. '.repeat(200);

      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-004',
          publishDate: '2025-01-20',
          title: 'Long Bulletin',
          rawText: longParagraph,
          sourceUrl: 'https://example.com/004',
        },
      ];

      const result = chunkJwc(bulletins);

      expect(result.length).toBeGreaterThan(1);

      result.forEach((chunk, index) => {
        expect(chunk.metadata).toMatchObject({
          source: 'jwc',
          sourceUrl: 'https://example.com/004',
          bulletinId: 'JWLA-004',
          publishDate: '2025-01-20',
          chunkIndex: index,
        });
        expect(chunk.content.length).toBeGreaterThan(0);
      });
    });

    // TC-NBI-11: No region keywords found → regions: []
    it('should return empty regions array when no keywords found', () => {
      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-005',
          publishDate: '2025-01-25',
          title: 'Generic Update',
          rawText: 'General insurance update for maritime industry.',
          sourceUrl: 'https://example.com/005',
        },
      ];

      const result = chunkJwc(bulletins);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toEqual([]);
    });

    // Region extraction — "Black Sea" and "Red Sea" → regions array
    it('should extract regions from bulletin text', () => {
      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-006',
          publishDate: '2025-01-30',
          title: 'Listed Areas Update',
          rawText:
            'The Black Sea and Red Sea remain on the listed areas for war risk. Persian Gulf requires additional premium.',
          sourceUrl: 'https://example.com/006',
        },
      ];

      const result = chunkJwc(bulletins);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toEqual(
        expect.arrayContaining(['Black Sea', 'Red Sea', 'Persian Gulf'])
      );
      expect(result[0].metadata.regions).toHaveLength(3);
    });

    // Metadata completeness
    it('should include all required metadata fields', () => {
      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-007',
          publishDate: '2025-02-05',
          title: 'Full Metadata Test',
          rawText: 'Gulf of Aden piracy risk update.',
          sourceUrl: 'https://example.com/007',
        },
      ];

      const result = chunkJwc(bulletins);

      expect(result).toHaveLength(1);

      const metadata = result[0].metadata;
      expect(metadata).toHaveProperty('source', 'jwc');
      expect(metadata).toHaveProperty('sourceUrl');
      expect(metadata).toHaveProperty('bulletinId');
      expect(metadata).toHaveProperty('publishDate');
      expect(metadata).toHaveProperty('title');
      expect(metadata).toHaveProperty('regions');
      expect(metadata).toHaveProperty('chunkIndex');
    });

    // Multiple regions extraction
    it('should extract multiple regions correctly', () => {
      const bulletins: JwcScrapedBulletin[] = [
        {
          id: 'JWLA-008',
          publishDate: '2025-02-10',
          title: 'Multi-Region Update',
          rawText:
            'War risk zones include: Black Sea, Red Sea, Persian Gulf, Gulf of Guinea, Indian Ocean, and South China Sea.',
          sourceUrl: 'https://example.com/008',
        },
      ];

      const result = chunkJwc(bulletins);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.regions).toEqual(
        expect.arrayContaining([
          'Black Sea',
          'Red Sea',
          'Persian Gulf',
          'Gulf of Guinea',
          'Indian Ocean',
          'South China Sea',
        ])
      );
      expect(result[0].metadata.regions.length).toBe(6);
    });
  });
});
