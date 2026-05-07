// Regression Lock: QA adversarial 2026-05-07
// Class: A (Empty/falsy) | Severity: HIGH
// Finding: HIGH01 — whitespace-only baseUrl accepted as non-empty
// Spec: spec-12-scrapeimsbc-imsbc-source-url
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

describe('regression spec12-HIGH01: whitespace-only baseUrl', () => {
  it('baseUrl with only whitespace must throw IMSBC_SOURCE_URL is empty', async () => {
    // Arrange — whitespace-only inputs
    const inputs = [
      '   ',        // spaces
      '\t',         // tab
      '\n',         // newline
      '  \t\n  ',   // mixed
    ];

    // Act & Assert
    for (const input of inputs) {
      await expect(scrapeImsbc(input)).rejects.toThrow('IMSBC_SOURCE_URL is empty');
    }

    // NOTE: Current code checks `!baseUrl || baseUrl.trim() === ''`
    // This test should PASS if .trim() is used, FAIL if only `!baseUrl` check
  });
});
