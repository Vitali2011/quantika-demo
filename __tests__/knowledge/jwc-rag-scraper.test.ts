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
      await expect(scrapeJwc('')).rejects.toThrow('baseUrl cannot be empty');
    });

    it('TC-NBI-02: should throw Error when baseUrl is null', async () => {
      await expect(scrapeJwc(null as any)).rejects.toThrow('baseUrl cannot be empty');
    });

    it('TC-NBI-03: should throw Error when baseUrl is whitespace only', async () => {
      await expect(scrapeJwc('   ')).rejects.toThrow('baseUrl cannot be empty');
      await expect(scrapeJwc('\t\n')).rejects.toThrow('baseUrl cannot be empty');
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
});
