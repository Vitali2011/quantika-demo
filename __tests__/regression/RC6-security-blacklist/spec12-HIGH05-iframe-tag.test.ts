// Regression Lock: QA adversarial 2026-05-07
// Class: G (Security/XSS) | Severity: HIGH
// Finding: HIGH05 — <iframe> tag in section HTML (clickjacking/XSS risk)
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-HIGH05: iframe tag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('<iframe> tags must be stripped from rawHtml', async () => {
    const tocHtml = `<a href="sec1.html">Section 1</a>`;

    const sectionHtml = `
      <h1>Section with iframe</h1>
      <p>Legitimate content</p>
      <iframe src="https://evil.com/phishing"></iframe>
      <iframe src="javascript:alert(1)"></iframe>
      <p>More content</p>
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

    const result = await scrapeImsbc('https://example.com/imsbc');

    expect(result).toHaveLength(1);

    // <iframe> is NOT in allowedTags → should be removed by sanitize-html
    expect(result[0].rawHtml).not.toContain('<iframe');
    expect(result[0].rawHtml).not.toContain('</iframe>');
    expect(result[0].rawHtml).not.toContain('evil.com');
  });
});
