// Regression Lock: QA adversarial 2026-05-07
// Class: H (External API misuse) | Severity: HIGH
// Finding: HIGH06 — large response body (10GB) causes memory exhaustion
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

global.fetch = jest.fn();

describe('regression spec12-HIGH06: large response DoS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ToC response > 10MB should be rejected or timeout', async () => {
    // Arrange — simulate large response (not actually 10GB, but conceptually)
    const largeHtml = '<a href="sec1.html">Sec</a>'.repeat(1_000_000);  // ~30MB string

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => largeHtml,
    });

    // Act & Assert
    // Expected: either timeout (10s) or memory limit rejection
    // Current implementation: NO size check → will attempt to parse 30MB HTML

    await expect(async () => {
      const result = await scrapeImsbc('https://example.com/imsbc');
      // If this succeeds, check that parsing didn't crash
      expect(result).toBeDefined();
    }).rejects.toThrow();  // Should timeout or throw

    // NOTE: Current code has NO response size limit
    // This is a DoS vector: malicious mirror can send 10GB HTML
    // Expected fix: add Content-Length check or streaming parser with limit
  }, 15000);  // 15s timeout for test itself
});
