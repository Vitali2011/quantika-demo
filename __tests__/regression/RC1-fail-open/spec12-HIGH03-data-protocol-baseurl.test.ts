// Regression Lock: QA adversarial 2026-05-07
// Class: E (Non-exhaustive protocol) | Severity: HIGH
// Finding: HIGH03 — data: protocol in baseUrl bypasses fetch
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

describe('regression spec12-HIGH03: data protocol in baseUrl', () => {
  it('data: protocol in baseUrl must throw Invalid IMSBC_SOURCE_URL', async () => {
    // Arrange — data: URL (embedded HTML)
    const dataUrl = 'data:text/html,<h1>Fake IMSBC</h1><a href="fake.html">Fake Section</a>';

    // Act & Assert
    await expect(scrapeImsbc(dataUrl)).rejects.toThrow('Invalid IMSBC_SOURCE_URL');

    // NOTE: data: URLs can bypass HTTP entirely
    // Current protocol check should reject this
  });
});
