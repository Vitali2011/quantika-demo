// Regression Lock: QA adversarial 2026-05-07
// Class: G (Security/XSS) | Severity: CRITICAL
// Finding: CRIT03 — data: URLs in <img src> can embed HTML/JS
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-CRIT03: data scheme in img', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('data: URLs in <img src> must be stripped (can contain HTML/JS)', async () => {
    const tocHtml = `<a href="sec1.html">Sec 1</a>`;

    const sectionHtml = `
      <h1>Section</h1>
      <img src="data:text/html,<script>alert('XSS via data URL')</script>" />
      <img src="data:image/svg+xml,<svg onload=alert(1)>" />
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

    // CRITICAL: data: scheme MUST be blocked (not in allowedSchemes)
    expect(result[0].rawHtml).not.toContain('data:');
    expect(result[0].rawHtml).not.toMatch(/src=["']data:/i);

    // NOTE: sanitize-html allowedSchemes only includes http/https
    // This test verifies data: is properly rejected
  });
});
