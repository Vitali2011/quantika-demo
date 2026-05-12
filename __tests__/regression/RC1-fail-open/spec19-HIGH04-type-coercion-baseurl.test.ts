// Regression Lock: QA adversarial 2026-05-07
// Class: A (Empty/falsy inputs) | Severity: HIGH
// Finding: spec19-HIGH04 — null/undefined baseUrl coerced to string "null"/"undefined"
// Spec: spec-19
// DO NOT DELETE — see references/regression_lock_workflow.md

/**
 * TypeScript allows `scrapeJwc(null as any)` and `scrapeJwc(undefined as any)`.
 * JavaScript coerces null → "null" and undefined → "undefined".
 * The guard `if (!baseUrl || baseUrl.trim() === '')` (scraper.ts:32) checks falsy,
 * but `null` is falsy so it SHOULD be caught.
 *
 * However, if the type annotation is bypassed (e.g., JS caller, or `as any`),
 * we should verify the guard works correctly.
 */

import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';

describe('regression spec19-HIGH04: null/undefined baseUrl type coercion', () => {
  it('null baseUrl should throw with clear error', async () => {
    // Arrange — bypass TypeScript with `as any`
    const nullUrl = null as any;

    // Act & Assert — should be caught by `!baseUrl` check
    await expect(scrapeJwc(nullUrl)).rejects.toThrow(/baseUrl is required/i);
  });

  it('undefined baseUrl should throw with clear error', async () => {
    const undefinedUrl = undefined as any;
    await expect(scrapeJwc(undefinedUrl)).rejects.toThrow(/baseUrl is required/i);
  });

  it('empty object baseUrl should throw', async () => {
    // An object without toString() would be "[object Object]"
    const objUrl = {} as any;
    await expect(scrapeJwc(objUrl)).rejects.toThrow();
  });

  it('number baseUrl should throw or be coerced to string URL', async () => {
    const numberUrl = 12345 as any;

    // Number 12345 → string "12345", which fails protocol check
    await expect(scrapeJwc(numberUrl)).rejects.toThrow(/baseUrl must use http or https/i);
  });

  it('boolean true baseUrl should throw', async () => {
    const boolUrl = true as any;
    await expect(scrapeJwc(boolUrl)).rejects.toThrow(/baseUrl must use http or https/i);
  });
});
