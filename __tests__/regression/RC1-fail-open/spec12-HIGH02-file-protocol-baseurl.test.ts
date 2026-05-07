// Regression Lock: QA adversarial 2026-05-07
// Class: E (Non-exhaustive protocol) | Severity: HIGH
// Finding: HIGH02 — file:// protocol in baseUrl enables local file access
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

describe('regression spec12-HIGH02: file protocol in baseUrl', () => {
  it('file:// protocol in baseUrl must throw Invalid IMSBC_SOURCE_URL', async () => {
    // Arrange — file:// URL (local file read vector)
    const fileUrls = [
      'file:///etc/passwd',
      'file:///C:/Windows/System32/config/SAM',
      'file://localhost/etc/hosts',
    ];

    // Act & Assert
    for (const url of fileUrls) {
      await expect(scrapeImsbc(url)).rejects.toThrow('Invalid IMSBC_SOURCE_URL');
    }

    // NOTE: Current code checks protocol !== 'http:' && !== 'https:' → should reject
    // This test verifies file:// is properly rejected
  });
});
