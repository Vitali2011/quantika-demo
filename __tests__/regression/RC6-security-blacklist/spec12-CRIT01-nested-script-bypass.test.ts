// Regression Lock: QA adversarial 2026-05-07
// Class: G (Security/XSS) | Severity: CRITICAL
// Finding: CRIT01 — nested <script> tags bypass single-pass regex sanitization
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

// Mock global fetch
global.fetch = jest.fn();

describe('regression spec12-CRIT01: nested script bypass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nested <script> tags must be fully stripped from rawHtml', async () => {
    // Arrange — malicious HTML with nested scripts (classic regex bypass)
    const tocHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <a href="evil.html">Section 1</a>
        </body>
      </html>
    `;

    const sectionHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Malicious Section</h1>
          <p>Normal content</p>
          <script><script>alert('XSS via nested script')</script></script>
          <p>More content</p>
        </body>
      </html>
    `;

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

    // Act
    const result = await scrapeImsbc('https://example.com/imsbc');

    // Assert — rawHtml MUST NOT contain any executable script
    expect(result).toHaveLength(1);
    expect(result[0].rawHtml).not.toContain('<script>');
    expect(result[0].rawHtml).not.toContain('</script>');
    expect(result[0].rawHtml).not.toContain('alert(');
    expect(result[0].rawHtml).not.toContain('XSS');

    // NOTE: Current regex may leave residual <script> after first pass
    // This test MUST fail if sanitization is single-pass regex-based
  });
});
