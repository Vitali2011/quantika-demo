import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';

describe('lib/knowledge/sources/jwc/scraper', () => {
  describe('scrapeJwc', () => {
    // TC-NBI-01: Empty string baseUrl
    it('should throw when baseUrl is empty string', async () => {
      await expect(scrapeJwc('')).rejects.toThrow('baseUrl is required');
    });

    // TC-NBI-02: Whitespace-only baseUrl
    it('should throw when baseUrl is whitespace only', async () => {
      await expect(scrapeJwc('   ')).rejects.toThrow('baseUrl is required');
    });

    // TC-NBI-03: Invalid URL scheme (ftp)
    it('should throw when baseUrl uses invalid scheme', async () => {
      await expect(scrapeJwc('ftp://invalid.com')).rejects.toThrow(
        'baseUrl must use http or https'
      );
    });

    // TC-NBI-12: Not a URL (no scheme)
    it('should throw when baseUrl has no scheme', async () => {
      await expect(scrapeJwc('not-a-url')).rejects.toThrow(
        'baseUrl must use http or https'
      );
    });

    // TC-NBI-04: Network failure (unreachable URL)
    it('should throw on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(scrapeJwc('https://down.example.com')).rejects.toThrow();
    });

    // TC-NBI-10: HTML with <script> tags should be stripped
    it('should strip script/style/nav/footer from HTML', async () => {
      const listHtml = `
        <html>
        <body>
          <script>alert(1)</script>
          <style>.test{}</style>
          <nav>Nav</nav>
          <ul>
            <li><a href="/bulletins/JWLA-001">Bulletin 1</a></li>
          </ul>
          <footer>Footer</footer>
        </body>
        </html>
      `;

      const detailHtml = `
        <html>
        <body>
          <script>console.log('x')</script>
          <h1>Test Bulletin</h1>
          <p class="date">2025-01-15</p>
          <p>Black Sea risk zone.</p>
          <footer>Copyright</footer>
        </body>
        </html>
      `;

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => listHtml,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => detailHtml,
        } as Response);

      const result = await scrapeJwc('https://example.com/jwc');

      expect(result).toHaveLength(1);
      expect(result[0].rawText).not.toContain('<script>');
      expect(result[0].rawText).not.toContain('<style>');
      expect(result[0].rawText).not.toContain('<nav>');
      expect(result[0].rawText).not.toContain('<footer>');
      expect(result[0].rawText).toContain('Black Sea');
    });

    // Successful scraping with mocked HTML
    it('should return scraped bulletins from mocked HTML', async () => {
      const listHtml = `
        <html>
        <body>
          <ul>
            <li><a href="/bulletins/JWLA-2025-001">Bulletin 1</a></li>
            <li><a href="/bulletins/JWLA-2025-002">Bulletin 2</a></li>
          </ul>
        </body>
        </html>
      `;

      const detailHtml1 = `
        <html>
        <body>
          <h1>Hull War Risk — Listed Areas</h1>
          <p class="date">2025-01-15</p>
          <p>Current war risk zones include Black Sea and Red Sea.</p>
        </body>
        </html>
      `;

      const detailHtml2 = `
        <html>
        <body>
          <h1>Piracy Update</h1>
          <p class="date">2025-01-20</p>
          <p>Gulf of Guinea remains high risk area.</p>
        </body>
        </html>
      `;

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => listHtml,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => detailHtml1,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => detailHtml2,
        } as Response);

      const result = await scrapeJwc('https://example.com/jwc');

      expect(result).toHaveLength(2);

      const bulletin1 = result.find((b) => b.id === 'JWLA-2025-001');
      const bulletin2 = result.find((b) => b.id === 'JWLA-2025-002');

      expect(bulletin1).toMatchObject({
        id: 'JWLA-2025-001',
        publishDate: expect.any(String),
        title: expect.any(String),
        rawText: expect.stringContaining('Black Sea'),
        sourceUrl: expect.stringContaining('JWLA-2025-001'),
      });
      expect(bulletin2).toMatchObject({
        id: 'JWLA-2025-002',
        publishDate: expect.any(String),
        title: expect.any(String),
        rawText: expect.stringContaining('Gulf of Guinea'),
        sourceUrl: expect.stringContaining('JWLA-2025-002'),
      });
    });

    // Partial failure handling (one bulletin 404)
    it('should handle partial failures gracefully', async () => {
      const listHtml = `
        <html>
        <body>
          <ul>
            <li><a href="/bulletins/JWLA-001">Bulletin 1</a></li>
            <li><a href="/bulletins/JWLA-002">Bulletin 2</a></li>
          </ul>
        </body>
        </html>
      `;

      const detailHtml1 = `
        <html><body><h1>Title</h1><p class="date">2025-01-15</p><p>Content</p></body></html>
      `;

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => listHtml,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => detailHtml1,
        } as Response)
        .mockRejectedValueOnce(new Error('404 Not Found'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await scrapeJwc('https://example.com/jwc');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('JWLA-001');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    // Timeout handling
    it('should respect timeout of 10 seconds', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValue(abortError);

      await expect(scrapeJwc('https://slow.example.com')).rejects.toThrow('timeout');
    });
  });
});
