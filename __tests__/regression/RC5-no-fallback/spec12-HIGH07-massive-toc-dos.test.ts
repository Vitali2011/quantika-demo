// Regression Lock: QA adversarial 2026-05-07
// Class: H (External API misuse) | Severity: HIGH
// Finding: HIGH07 — ToC with 10,000 section links causes resource exhaustion
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-HIGH07: massive ToC DoS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ToC with 10,000 section links should fail gracefully', async () => {
    // Arrange — ToC with 10,000 links
    const links = Array.from({ length: 10_000 }, (_, i) => 
      `<a href="section-${i}.html">Section ${i}</a>`
    ).join('\n');

    const tocHtml = `<html><body>${links}</body></html>`;

    let fetchCount = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      fetchCount++;
      
      // ToC fetch
      if (url.includes('imsbc') && !url.includes('section-')) {
        return {
          ok: true,
          status: 200,
          text: async () => tocHtml,
        };
      }

      // Section fetches — simulate slow response
      await new Promise((resolve) => setTimeout(resolve, 100));  // 100ms delay
      return {
        ok: true,
        status: 200,
        text: async () => '<h1>Section</h1>',
      };
    });

    // Act
    const startTime = Date.now();
    const result = await scrapeImsbc('https://example.com/imsbc');
    const duration = Date.now() - startTime;

    // Assert
    // With MAX_CONCURRENT=3, 10,000 sections would take ~333 seconds (unacceptable)
    // Expected: scraper should have a maximum section count limit
    
    // For now, verify concurrency limit works (should take ~100ms * 10,000 / 3 = ~333s)
    // This test will timeout (Jest default 5s) → proves DoS vulnerability

    expect(result.length).toBeLessThanOrEqual(10_000);
    expect(duration).toBeLessThan(60_000);  // Should complete in < 60s with limit

    // NOTE: Current code has NO limit on number of sections
    // This is a DoS vector: malicious ToC can trigger 10,000+ HTTP requests
  }, 65000);  // Allow 65s for test
});
