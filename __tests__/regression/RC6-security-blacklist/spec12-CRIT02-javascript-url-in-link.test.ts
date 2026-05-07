// Regression Lock: QA adversarial 2026-05-07
// Class: G (Security/XSS) | Severity: CRITICAL
// Finding: CRIT02 — javascript: URLs in <a href> not sanitized
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-CRIT02: javascript URL in link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('javascript: scheme in <a href> must be stripped from rawHtml', async () => {
    const tocHtml = `<a href="section1.html">Section 1</a>`;

    const sectionHtml = `
      <h1>Section with XSS</h1>
      <p>Click here: <a href="javascript:alert('XSS')">malicious link</a></p>
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
    
    // CRITICAL: javascript: URLs MUST be removed or href attribute stripped
    expect(result[0].rawHtml).not.toContain('javascript:');
    expect(result[0].rawHtml).not.toMatch(/href=["']javascript:/i);

    // NOTE: sanitize-html should block javascript: scheme per allowedSchemes
    // This test verifies the config is correct
  });
});
