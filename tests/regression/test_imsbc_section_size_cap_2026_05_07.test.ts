/**
 * Adversarial regression — IMSBC scraper missing size cap on section fetches
 * Cold-start QA wave 2026-05-07 (Q6 from .test-review-2026-05-07/attack_plan.md)
 *
 * Surface under test: lib/knowledge/sources/imsbc/scraper.ts
 *
 * Finding sought:
 * ── Q6 (MEDIUM) section fetch lacks 10MB body cap ────────────────────────
 * fetchWithTimeout (lines 112-145) enforces a 10MB body cap (both
 * content-length AND post-`text()` length). It is used for the ToC fetch.
 * Individual section pages are fetched with fetchWithRetry (lines 150-177),
 * which has NO size guard. A malicious or pathological IMSBC mirror could
 * serve a 100MB section page; node consumes it into memory before sanitize-html
 * runs. Since `MAX_CONCURRENT=3` runs three section fetches in parallel,
 * a coordinated three-section attack lands ~300MB of HTML in process memory.
 *
 * Defense exists for the ToC; the symmetric defense for sections is missing.
 *
 * STATUS 2026-06-12: finding re-verified still OPEN — fetchWithRetry returns
 * `await response.text()` with no content-length or body-size guard. Both tests
 * are marked `it.failing` (jest: passes while the bug persists, flips red the
 * moment the cap lands) so the regression suite stays green for cold-QA without
 * masking the open finding. When the 10MB cap is added to fetchWithRetry,
 * convert these back to plain `it(...)`.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

type Headers = { get: (k: string) => string | null };
type FakeResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
};

let originalFetch: typeof globalThis.fetch;

const TOC_URL = 'https://example.test/imsbc/toc.html';
const SECTION_URL = 'https://example.test/imsbc/INTBSBCC-Sec01.html';

function htmlToc(): string {
  return `<html><body><a href="${SECTION_URL}">Section 1</a></body></html>`;
}

describe('Q6 — IMSBC section fetch missing 10MB body cap', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // it.failing: documented OPEN finding (see header) — flips red when the cap is added.
  it.failing('Q6-a: a section fetch declaring content-length > 10MB MUST be rejected (parity with ToC)', async () => {
    // Section page advertises 11MB — same defense MUST apply as for ToC.
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url === TOC_URL) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => htmlToc(),
        } as unknown as Response;
      }
      if (url === SECTION_URL) {
        return {
          ok: true,
          status: 200,
          headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? String(11 * 1024 * 1024) : null) },
          text: async () => '<p>x</p>'.repeat(2_000),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof globalThis.fetch;

    const result = await scrapeImsbc(TOC_URL);

    // Today scraper returns the section anyway because fetchWithRetry skips
    // the size guard. Strict contract: section over the cap is dropped or
    // throws — at minimum, the resulting array MUST NOT include this section.
    // Failing test pins the missing cap.
    const sections = result.filter(s => s.sourceUrl === SECTION_URL);
    expect(sections).toHaveLength(0);
  });

  // it.failing: documented OPEN finding (see header) — flips red when the cap is added.
  it.failing('Q6-b: a section fetch with no content-length but body > 10MB MUST be rejected', async () => {
    // Some malicious mirrors omit content-length (chunked transfer-encoding).
    // The post-text() body length check exists in fetchWithTimeout but NOT in
    // fetchWithRetry — so this attack vector is unguarded today.
    const bigBody = '<p>Z</p>' + 'A'.repeat(11 * 1024 * 1024); // ~11MB

    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      if (url === TOC_URL) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => htmlToc(),
        } as unknown as Response;
      }
      if (url === SECTION_URL) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },         // ← no content-length
          text: async () => bigBody,            // ← 11MB body
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof globalThis.fetch;

    const result = await scrapeImsbc(TOC_URL);

    const sections = result.filter(s => s.sourceUrl === SECTION_URL);
    expect(sections).toHaveLength(0);
  });
});
