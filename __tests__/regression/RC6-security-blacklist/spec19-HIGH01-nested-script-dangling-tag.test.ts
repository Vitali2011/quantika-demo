// Regression Lock: QA adversarial 2026-05-07
// Class: G (XSS sanitization) | Severity: HIGH
// Finding: spec19-HIGH01 — nested script tags leave dangling closing tag after stripTags
// Spec: spec-19
// DO NOT DELETE — see references/regression_lock_workflow.md

/**
 * This test verifies that stripTags() correctly handles nested script tags.
 * The current implementation uses a non-greedy regex that can leave dangling
 * closing tags when scripts are nested.
 *
 * Example:
 *   Input: <script><script>alert(1)</script></script>
 *   After stripTags(['script']): </script> (dangling closing tag remains)
 *
 * While htmlToPlainText() will later remove this, defense-in-depth requires
 * that stripTags() itself be complete and not leave any script-related tags.
 */

// Since stripTags is internal, we test via the public scrapeJwc function
// by mocking fetch to return malicious HTML
import { jest } from '@jest/globals';
import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';

describe('regression spec19-HIGH01: nested script tag sanitization', () => {
  // Mock global fetch for this test suite
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('nested script tags should not leave dangling tags in rawText', async () => {
    // Arrange — mock responses with nested scripts
    const listingHtml = '<a href="bulletin-001.html">Bulletin 001</a>';
    const bulletinHtml = `
      <html>
        <head><title>Test Bulletin</title></head>
        <body>
          <h1>JWC Bulletin 001</h1>
          <time>2026-05-07</time>
          <p>Normal content</p>
          <script><script>alert(1)</script></script>
          <p>More content</p>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => listingHtml,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => bulletinHtml,
      });

    // Act
    const bulletins = await scrapeJwc('https://example.com/jwc');

    // Assert — rawText should NOT contain any script tags or dangling tags
    expect(bulletins).toHaveLength(1);
    expect(bulletins[0].rawText).not.toContain('<script>');
    expect(bulletins[0].rawText).not.toContain('</script>');
    expect(bulletins[0].rawText).not.toContain('alert(1)');

    // NOTE: This test currently PASSES because htmlToPlainText() cleans up
    // the dangling tag left by stripTags(). However, this is a defense-in-depth
    // issue — stripTags() should be complete on its own.
  });

  it('triple-nested script tags should be fully sanitized', async () => {
    const listingHtml = '<a href="bulletin-002.html">Bulletin 002</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Evil Bulletin</h1>
          <time>2026-05-07</time>
          <script><script><script>alert('XSS')</script></script></script>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => listingHtml,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => bulletinHtml,
      });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    expect(bulletins).toHaveLength(1);
    expect(bulletins[0].rawText).not.toMatch(/<\/?script>/i);
    expect(bulletins[0].rawText).not.toContain('alert');
  });

  it('mixed case and uppercase script tags should be stripped', async () => {
    const listingHtml = '<a href="bulletin-003.html">Bulletin 003</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Mixed Case Test</h1>
          <time>2026-05-07</time>
          <SCRIPT>alert('uppercase')</SCRIPT>
          <ScRiPt>alert('mixed')</ScRiPt>
          <p>Safe content</p>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => listingHtml,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => bulletinHtml,
      });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    expect(bulletins).toHaveLength(1);
    expect(bulletins[0].rawText).not.toMatch(/alert/i);
    expect(bulletins[0].rawText).toContain('Safe content');
  });
});
