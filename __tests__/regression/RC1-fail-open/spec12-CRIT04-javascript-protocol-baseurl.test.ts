// Regression Lock: QA adversarial 2026-05-07
// Class: E (Non-exhaustive protocol check) | Severity: CRITICAL
// Finding: CRIT04 — javascript: protocol in baseUrl not explicitly rejected
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

describe('regression spec12-CRIT04: javascript protocol in baseUrl', () => {
  it('javascript: protocol in baseUrl must throw Invalid IMSBC_SOURCE_URL', async () => {
    // Arrange — javascript: URL (XSS vector if ever used in browser context)
    const maliciousUrl = 'javascript:alert(document.cookie)';

    // Act & Assert
    await expect(scrapeImsbc(maliciousUrl)).rejects.toThrow('Invalid IMSBC_SOURCE_URL');

    // NOTE: Current code checks protocol !== 'http:' && !== 'https:' → should reject
    // BUT: URL() constructor may fail to parse javascript: as valid URL
    // This test ensures rejection happens via EITHER path
  });
});
