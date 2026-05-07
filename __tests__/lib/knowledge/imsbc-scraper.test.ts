/**
 * Tests for IMSBC Code HTML scraper
 * Spec: spec-12-scrapeimsbc-imsbc-source-url
 */

import { scrapeImsbc, ScrapedSection } from '@/lib/knowledge/sources/imsbc/scraper';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock global fetch
global.fetch = jest.fn();

describe('scrapeImsbc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input validation (Input Contract)', () => {
    // TC-NBI-01: Empty string
    test('throws on empty string baseUrl', async () => {
      await expect(scrapeImsbc('')).rejects.toThrow('IMSBC_SOURCE_URL is empty');
    });

    // TC-NBI-02: null/undefined
    test('throws on null baseUrl', async () => {
      await expect(scrapeImsbc(null as any)).rejects.toThrow('IMSBC_SOURCE_URL is empty');
    });

    test('throws on undefined baseUrl', async () => {
      await expect(scrapeImsbc(undefined as any)).rejects.toThrow('IMSBC_SOURCE_URL is empty');
    });

    // TC-NBI-03: Invalid URL format
    test('throws on invalid URL format', async () => {
      await expect(scrapeImsbc('not-a-url')).rejects.toThrow('Invalid IMSBC_SOURCE_URL: not-a-url');
    });

    // TC-NBI-04: Invalid protocol
    test('throws on non-HTTP/HTTPS protocol', async () => {
      await expect(scrapeImsbc('ftp://example.com')).rejects.toThrow('Invalid IMSBC_SOURCE_URL: ftp://example.com');
    });
  });

  describe('ToC fetching', () => {
    // TC-NBI-05: HTTP error
    test('throws on 404 ToC response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(scrapeImsbc('https://example.com/imsbc')).rejects.toThrow('Failed to fetch IMSBC ToC: 404');
    });

    test('fetches ToC and extracts section links', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('sectionId');
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('rawHtml');
      expect(result[0]).toHaveProperty('sourceUrl');
    });
  });

  describe('HTML sanitization', () => {
    // TC-NBI-06: Script removal
    test('strips script tags and content from rawHtml', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      // Verify script tags are stripped
      expect(result[0].rawHtml).not.toContain('<script>');
      expect(result[0].rawHtml).not.toContain('alert(');
      expect(result[0].rawHtml).not.toContain('console.log');
    });

    test('strips style tags from rawHtml', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      expect(result[0].rawHtml).not.toContain('<style>');
      expect(result[0].rawHtml).not.toContain('font-family');
    });

    test('strips nav tags from rawHtml', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      expect(result[0].rawHtml).not.toContain('<nav>');
    });

    test('strips footer tags from rawHtml', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      expect(result[0].rawHtml).not.toContain('<footer>');
      expect(result[0].rawHtml).not.toContain('Copyright IMO');
    });

    test('removes event handler attributes from elements', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      expect(result[0].rawHtml).not.toContain('onclick');
      expect(result[0].rawHtml).not.toContain('onerror');
    });

    test('preserves allowlisted HTML elements', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      // Should preserve semantic elements
      expect(result[0].rawHtml).toContain('<h1>');
      expect(result[0].rawHtml).toContain('<p>');
      expect(result[0].rawHtml).toContain('<table>');
      expect(result[0].rawHtml).toContain('<strong>');
      expect(result[0].rawHtml).toContain('<em>');
    });
  });

  describe('Partial failure handling', () => {
    test('returns successfully scraped sections when one section fails', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      const fetchedUrls: string[] = [];

      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        fetchedUrls.push(url);

        // First call: ToC
        if (url.includes('imsbc') && !url.includes('.html')) {
          return {
            ok: true,
            status: 200,
            text: async () => tocHtml,
          };
        }

        // Section 2 - always fail (both initial and retry)
        if (url.includes('Sec02')) {
          throw new Error('Network error');
        }

        // Other sections - success
        return {
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        };
      });

      const result = await scrapeImsbc('https://example.com/imsbc');

      // Should have 2 sections (out of 3 in ToC) - Section 2 failed after retry
      expect(result).toHaveLength(2);
      expect(result.some((s) => s.sectionId === 'SECTION-02')).toBe(false);
    });
  });

  describe('Timeout handling', () => {
    test('aborts request on timeout', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(async (url: string, options?: { signal?: AbortSignal }) => {
        callCount++;

        // First call: ToC
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => tocHtml,
          };
        }

        // Section calls: simulate timeout by checking if abort signal fires
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              text: async () => sectionHtml,
            });
          }, 15000); // Longer than 10s timeout

          // Listen for abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const result = await scrapeImsbc('https://example.com/imsbc');

      // All sections should timeout and be skipped
      expect(result.length).toBeLessThan(3);
    }, 20000);
  });

  describe('Section ordering', () => {
    test('returns sections sorted by sectionId in natural order', async () => {
      const tocHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-toc-sample.html'), 'utf-8');
      const sectionHtml = readFileSync(join(__dirname, '../../fixtures/imsbc-section-sample.html'), 'utf-8');

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => tocHtml,
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => sectionHtml,
        });

      const result = await scrapeImsbc('https://example.com/imsbc');

      // Check that sections are ordered
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1].sectionId;
        const curr = result[i].sectionId;

        // Natural ordering: SECTION-1 < SECTION-2 < APPENDIX-A
        expect(prev.localeCompare(curr, undefined, { numeric: true })).toBeLessThanOrEqual(0);
      }
    });
  });
});
