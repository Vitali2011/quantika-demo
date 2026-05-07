// Regression Lock: QA adversarial 2026-05-07
// Class: 9 (End-to-end property — regex rejection) | Severity: HIGH
// Finding: HIGH09 — ToC with no .html links returns empty array (negative test missing)
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-HIGH09: regex rejection — no HTML links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ToC with no .html/.htm links must return empty array', async () => {
    // Arrange — ToC with links but NONE matching .html pattern
    const tocHtml = `
      <html>
        <body>
          <a href="section1.pdf">Section 1 PDF</a>
          <a href="section2.docx">Section 2 DOCX</a>
          <a href="https://external.com/page">External Link</a>
          <a href="/about">About</a>
          <a href="javascript:void(0)">JavaScript Link</a>
        </body>
      </html>
    `;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => tocHtml,
    });

    // Act
    const result = await scrapeImsbc('https://example.com/imsbc');

    // Assert — no sections extracted (no .html links)
    expect(result).toEqual([]);

    // Verify only ToC was fetched (no section fetches)
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // NOTE: This is a negative test — verifies regex properly REJECTS non-HTML links
    // Current regex: href.includes('.html') || href.includes('.htm')
  });
});
