// Regression Lock: QA adversarial 2026-05-07
// Class: E (Non-exhaustive union) | Severity: CRITICAL
// Finding: spec19-CRIT03 — javascript: protocol in baseUrl bypasses validation
// Spec: spec-19
// DO NOT DELETE — see references/regression_lock_workflow.md

import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';

describe('regression spec19-CRIT03: javascript: protocol baseUrl', () => {
  it('javascript: protocol must be rejected with clear error', async () => {
    // Arrange — attacker-controlled URL with javascript: protocol
    const maliciousUrl = 'javascript:alert(1)';

    // Act & Assert — must throw, not attempt to fetch
    await expect(scrapeJwc(maliciousUrl)).rejects.toThrow(/baseUrl must use http or https/i);

    // NOTE: This test verifies the fix added in spec-19 (protocol validation).
    // Without the guard at scraper.ts:38-41, fetch() would error with unclear message.
  });

  it('vbscript: protocol must be rejected', async () => {
    const maliciousUrl = 'vbscript:msgbox(1)';
    await expect(scrapeJwc(maliciousUrl)).rejects.toThrow(/baseUrl must use http or https/i);
  });

  it('file: protocol must be rejected (LFI prevention)', async () => {
    const maliciousUrl = 'file:///etc/passwd';
    await expect(scrapeJwc(maliciousUrl)).rejects.toThrow(/baseUrl must use http or https/i);
  });

  it('data: protocol must be rejected', async () => {
    const maliciousUrl = 'data:text/html,<h1>Fake JWC Bulletin</h1>';
    await expect(scrapeJwc(maliciousUrl)).rejects.toThrow(/baseUrl must use http or https/i);
  });

  it('ftp: protocol must be rejected', async () => {
    const maliciousUrl = 'ftp://evil.com/bulletins';
    await expect(scrapeJwc(maliciousUrl)).rejects.toThrow(/baseUrl must use http or https/i);
  });
});
