// Regression Lock: QA adversarial 2026-05-07
// Class: G (XSS sanitization) | Severity: HIGH
// Finding: spec19-HIGH02 — dangerous tags like iframe, object, embed not in stripTags list
// Spec: spec-19
// DO NOT DELETE — see references/regression_lock_workflow.md

/**
 * The stripTags function (scraper.ts:137) only strips: script, style, nav, footer.
 * Other dangerous tags that can execute JavaScript or load external content are NOT stripped:
 * - <iframe> — can load arbitrary URLs, including javascript: URLs
 * - <object> — can embed Flash, Java applets, etc.
 * - <embed> — similar to object
 * - <svg> with <script> inside — SVG scripts execute
 * - <math> — can contain XSS vectors
 *
 * While htmlToPlainText() strips all tags including these, defense-in-depth requires
 * that dangerous tags be explicitly removed by stripTags().
 */

import { jest } from '@jest/globals';
import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';

describe('regression spec19-HIGH02: dangerous tags not stripped', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('iframe tags should not appear in rawText', async () => {
    const listingHtml = '<a href="bulletin-iframe.html">Bulletin</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Bulletin with iframe</h1>
          <time>2026-05-07</time>
          <p>Content before</p>
          <iframe src="https://evil.com/xss.html"></iframe>
          <p>Content after</p>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => listingHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => bulletinHtml });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    // iframe tag attributes (harmful URLs) should be stripped
    // Note: the word 'iframe' in h1 title is fine — we check harmful content
    expect(bulletins[0].rawText).not.toContain('evil.com');
    expect(bulletins[0].rawText).not.toContain('xss.html');
    expect(bulletins[0].rawText).toContain('Content before');
    expect(bulletins[0].rawText).toContain('Content after');
  });

  it('object tags should not appear in rawText', async () => {
    const listingHtml = '<a href="bulletin-object.html">Bulletin</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Bulletin with object</h1>
          <time>2026-05-07</time>
          <object data="https://evil.com/malware.swf" type="application/x-shockwave-flash"></object>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => listingHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => bulletinHtml });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    // 'object' appears in title 'Bulletin with object' — check harmful content only
    expect(bulletins[0].rawText).not.toContain('evil.com');
    expect(bulletins[0].rawText).not.toContain('malware.swf');
  });

  it('embed tags should not appear in rawText', async () => {
    const listingHtml = '<a href="bulletin-embed.html">Bulletin</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Bulletin with embed</h1>
          <time>2026-05-07</time>
          <embed src="https://evil.com/plugin.jar" type="application/x-java-applet">
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => listingHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => bulletinHtml });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    // 'embed' appears in title 'Bulletin with embed' — check harmful content only
    expect(bulletins[0].rawText).not.toContain('evil.com');
    expect(bulletins[0].rawText).not.toContain('plugin.jar');
  });

  it('SVG with script should not execute or appear in rawText', async () => {
    const listingHtml = '<a href="bulletin-svg.html">Bulletin</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Bulletin with SVG XSS</h1>
          <time>2026-05-07</time>
          <svg onload="alert('XSS')"><script>alert('SVG XSS')</script></svg>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => listingHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => bulletinHtml });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    // SVG tags and scripts inside should be removed
    expect(bulletins[0].rawText).not.toContain('svg');
    expect(bulletins[0].rawText).not.toContain('onload');
    expect(bulletins[0].rawText).not.toContain('alert');
  });

  it('javascript: URL in href should not appear in rawText', async () => {
    const listingHtml = '<a href="bulletin-js-href.html">Bulletin</a>';
    const bulletinHtml = `
      <html>
        <body>
          <h1>Bulletin with JS link</h1>
          <time>2026-05-07</time>
          <a href="javascript:alert(document.cookie)">Click me</a>
        </body>
      </html>
    `;

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, text: async () => listingHtml })
      .mockResolvedValueOnce({ ok: true, text: async () => bulletinHtml });

    const bulletins = await scrapeJwc('https://example.com/jwc');

    // javascript: URL should not appear in rawText
    expect(bulletins[0].rawText).not.toContain('javascript:');
    expect(bulletins[0].rawText).not.toContain('alert');
    expect(bulletins[0].rawText).not.toContain('document.cookie');

    // But the link text "Click me" will appear (safe)
    expect(bulletins[0].rawText).toContain('Click me');
  });
});
