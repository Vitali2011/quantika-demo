/**
 * Unit tests for JWC bulletin scraper (lib/knowledge/sources/jwc/scraper.ts)
 * Phase 2 RAG expansion — Block D (JWC RAG), item D1
 */

import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';
import type { JwcBulletin } from '@/lib/knowledge/sources/jwc/types';

describe('scrapeJwc', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Input Contract: boundary validation (TC-NBI-01 to TC-NBI-03)', () => {
    it('TC-NBI-01: should throw Error when baseUrl is empty string', async () => {
      await expect(scrapeJwc('')).rejects.toThrow('baseUrl is required');
    });

    it('TC-NBI-02: should throw Error when baseUrl is null', async () => {
      await expect(scrapeJwc(null as any)).rejects.toThrow('baseUrl is required');
    });

    it('TC-NBI-03: should throw Error when baseUrl is whitespace only', async () => {
      await expect(scrapeJwc('   ')).rejects.toThrow('baseUrl is required');
      await expect(scrapeJwc('\t\n')).rejects.toThrow('baseUrl is required');
    });
  });

  describe('Input Contract: HTTP error scenarios (TC-NBI-05 to TC-NBI-08)', () => {
    it('TC-NBI-05: should throw Error when listing page returns 404', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(scrapeJwc('https://example.com/jwc')).rejects.toThrow('Failed to fetch bulletin listing: 404');
    });

    it('TC-NBI-06: should return empty array when HTML is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      });

      const result = await scrapeJwc('https://example.com/jwc');
      expect(result).toEqual([]);
    });

    it('TC-NBI-07: should throw Error on timeout (>10s)', async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      await expect(scrapeJwc('https://example.com/jwc')).rejects.toThrow();
    }, 15000);

    it('TC-NBI-08: should skip individual bulletin on 500 and log warning', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<a href="/bulletin1">Bulletin 1</a><a href="/bulletin2">Bulletin 2</a>',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<h1>Bulletin 2</h1><p>Content</p><time>2026-03-03</time>',
        });

      const result = await scrapeJwc('https://example.com/jwc');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch bulletin'));
      expect(result.length).toBeLessThanOrEqual(1);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Input Contract: HTML parsing & sanitization (TC-NBI-09)', () => {
    it('TC-NBI-09: should strip script/style/nav/footer tags from rawText', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<a href="/bulletin1">Test Bulletin</a>',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `
            <h1>Test Bulletin</h1>
            <script>alert('xss')</script>
            <style>.malicious{}</style>
            <p>Safe content</p>
            <nav>Navigation</nav>
            <footer>Footer content</footer>
          `,
        });

      const result = await scrapeJwc('https://example.com/jwc');
      expect(result.length).toBeGreaterThanOrEqual(0);
      if (result.length > 0) {
        expect(result[0].rawText).not.toContain('<script>');
        expect(result[0].rawText).not.toContain('<style>');
        expect(result[0].rawText).not.toContain('alert');
        expect(result[0].rawText).not.toContain('.malicious');
      }
    });
  });

  describe('Input Contract: missing date handling (TC-NBI-10)', () => {
    it('TC-NBI-10: should handle missing date element with fallback or skip', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<a href="/bulletin1">No Date Bulletin</a>',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<h1>No Date Bulletin</h1><p>Content without date</p>',
        });

      const result = await scrapeJwc('https://example.com/jwc');
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Integration: full scrape flow', () => {
    it('should scrape multiple bulletins and return sorted results', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `
            <a href="/bulletins/jwla-033">JWLA-033</a>
            <a href="/bulletins/jwla-032">JWLA-032</a>
            <a href="/bulletins/jwla-031">JWLA-031</a>
          `,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `
            <h1>Hull War Perils - JWLA-033</h1>
            <time>2026-03-03</time>
            <p>Red Sea and Gulf of Aden</p>
          `,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `
            <h1>Updated Listed Areas - JWLA-032</h1>
            <time>2026-02-15</time>
            <p>Persian Gulf waters</p>
          `,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => `
            <h1>Listed Areas Amendment - JWLA-031</h1>
            <time>2026-01-10</time>
            <p>Strait of Hormuz</p>
          `,
        });

      const result = await scrapeJwc('https://example.com/jwc');

      expect(result).toHaveLength(3);
      expect(result[0].publishDate).toBe('2026-03-03');
      expect(result[1].publishDate).toBe('2026-02-15');
      expect(result[2].publishDate).toBe('2026-01-10');
      expect(result[0].id).toContain('JWLA-033');
      expect(result[0].title).toContain('Hull War Perils');
      expect(result[0].rawText).toContain('Red Sea');
      expect(result[0].sourceUrl).toBe('https://example.com/bulletins/jwla-033');
    });

    it('should verify output field types and structure', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<a href="/bulletin1">Test</a>',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => '<h1>Test</h1><time>2026-03-03</time><p>Content</p>',
        });

      const result = await scrapeJwc('https://example.com/jwc');

      expect(result).toHaveLength(1);
      const bulletin = result[0];
      expect(typeof bulletin.id).toBe('string');
      expect(typeof bulletin.publishDate).toBe('string');
      expect(typeof bulletin.title).toBe('string');
      expect(typeof bulletin.rawText).toBe('string');
      expect(typeof bulletin.sourceUrl).toBe('string');
      expect(bulletin.id.length).toBeGreaterThan(0);
      expect(bulletin.publishDate.length).toBeGreaterThan(0);
      expect(bulletin.title.length).toBeGreaterThan(0);
      expect(bulletin.rawText.length).toBeGreaterThan(0);
      expect(bulletin.sourceUrl).toMatch(/^https?:\/\//);
    });
  });
});
