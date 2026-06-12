/**
 * COLD-START QA adversarial breaker — PR #966 (reverent-hamilton-edd6de)
 * Target: lib/knowledge/sources/imsbc/scraper.ts — 10MB cap on fetchWithRetry.
 *
 * Attacks the gate logic itself, not the happy path:
 *  Y1: content-length is GARBAGE ("not-a-number"). parseInt("not-a-number")=NaN;
 *      `NaN > MAX` is false -> header gate is a no-op. The body gate must then
 *      catch the oversize body. Net: oversize section MUST still be dropped.
 *  Y2: content-length LIES small ("100") but body is 11MB. Header gate passes,
 *      body gate must drop it.
 *  Y3: content-length is exactly 10MB (boundary). 10MB is NOT > 10MB, so it is
 *      ALLOWED through and the section is kept. Pins the off-by-one boundary.
 *  Y4: a normal small section still parses and appears in results (no false drop).
 *  Y5: oversize is dropped WITHOUT crashing scrapeImsbc and WITHOUT retrying
 *      (return null, not throw) — the run completes and just omits the section.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { scrapeImsbc } from '@/lib/knowledge/sources/imsbc/scraper';

const TOC = 'https://example.test/imsbc/toc.html';
const SEC = 'https://example.test/imsbc/INTBSBCC-Sec01.html';
const toc = `<html><body><a href="${SEC}">Section 1</a></body></html>`;

type Maker = (clHeader: string | null, body: string) => void;
let originalFetch: typeof globalThis.fetch;

function install(clHeader: string | null, body: string): void {
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (url === TOC) {
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => toc } as unknown as Response;
    }
    if (url === SEC) {
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? clHeader : null) },
        text: async () => body,
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof globalThis.fetch;
}

const MB = 1024 * 1024;
const small = '<p>ok</p>';

describe('PR#966 Y — imsbc section cap gate', () => {
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('Y1: garbage content-length ("not-a-number") + 11MB body — section MUST be dropped (body gate)', async () => {
    install('not-a-number', 'A'.repeat(11 * MB));
    const r = await scrapeImsbc(TOC);
    expect(r.filter(s => s.sourceUrl === SEC)).toHaveLength(0);
  });

  it('Y2: content-length lies small ("100") but body is 11MB — section MUST be dropped (body gate)', async () => {
    install('100', 'A'.repeat(11 * MB));
    const r = await scrapeImsbc(TOC);
    expect(r.filter(s => s.sourceUrl === SEC)).toHaveLength(0);
  });

  it('Y3 (boundary): content-length EXACTLY 10MB and body exactly 10MB — section is ALLOWED (10MB not > 10MB)', async () => {
    // Off-by-one pin: the guard is strictly `> MAX`, so exactly 10MB passes.
    const body = 'B'.repeat(10 * MB);
    install(String(10 * MB), body);
    const r = await scrapeImsbc(TOC);
    // Exactly-at-limit is intentionally NOT dropped. sanitize-html strips the
    // raw 'B' text (no tags) so rawHtml may be empty, but the section object is
    // still produced — the cap did not fire.
    expect(r.filter(s => s.sourceUrl === SEC)).toHaveLength(1);
  });

  it('Y4: a normal small section still appears (no false-positive drop)', async () => {
    install(String(small.length), small);
    const r = await scrapeImsbc(TOC);
    expect(r.filter(s => s.sourceUrl === SEC)).toHaveLength(1);
  });

  it('Y5: oversize section is dropped without throwing and without crashing the whole run', async () => {
    install(String(11 * MB), 'A'.repeat(11 * MB));
    // scrapeImsbc must resolve (not reject) and simply omit the bad section.
    const r = await scrapeImsbc(TOC);
    expect(Array.isArray(r)).toBe(true);
    expect(r.filter(s => s.sourceUrl === SEC)).toHaveLength(0);
  });
});
