/**
 * Adversarial regression — JWC scraper ID anti-collision (gap test)
 * Cold-start QA wave 2026-05-07 (Q3 from .test-review-2026-05-07/attack_plan.md)
 *
 * Surface under test: lib/knowledge/sources/jwc/scraper.ts
 *
 * Finding sought:
 * ── Q3 (HIGH) same-filename-different-path ID collision ──────────────────
 * Commit 581209a ("jwc-scraper: URL-hash-based ID to prevent collision (H2)")
 * added a GENERIC_SEGMENTS allowlist for trailing-slash / index.html cases:
 *
 *     const GENERIC_SEGMENTS = new Set(['index.html', 'index.htm', 'index.php', 'default.html']);
 *     const urlMatch = /\/([^\/]+)$/.exec(sourceUrl);
 *     if (urlMatch && !GENERIC_SEGMENTS.has(urlMatch[1])) {
 *       return urlMatch[1];     // ← the filename, NOT a hash of the URL
 *     }
 *     return null;              // ← only here does parseBulletin fall back to sha256(sourceUrl)
 *
 * The hash fallback in parseBulletin (line 161 of scraper.ts) only triggers
 * when extractId returns null. If two bulletins live at
 *     https://www.lmalloyds.com/lma/2024/bulletin-foo.html
 *     https://www.lmalloyds.com/lma/2025/bulletin-foo.html
 * the regex captures `bulletin-foo.html` for BOTH URLs (it is not in the
 * generic set), and the function returns the bare filename. Both bulletins
 * receive the same id, last-write-wins in the vec table → silent data loss.
 *
 * H2 prior-wave tests covered the Date.now() / trailing-slash cases
 * (`H2-a..d`), but NOT the same-filename-different-path case. This file
 * pins that specific gap.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { scrapeJwc } from '@/lib/knowledge/sources/jwc/scraper';

type FetchInit = { signal?: AbortSignal } | undefined;
type FakeResponse = { ok: boolean; status: number; headers: { get: (k: string) => string | null }; text: () => Promise<string> };

function htmlBulletin(opts: { date: string; title: string }): string {
  // Bulletin page WITHOUT a JWLA-NNN id pattern → forces fallback to filename / hash.
  return `<!doctype html>
    <html><head><title>${opts.title}</title></head>
    <body>
      <h1>${opts.title}</h1>
      <time>${opts.date}</time>
      <p>Listed Areas update — routine review of advisories.</p>
    </body></html>`;
}

function htmlListingTwoBulletins(): string {
  return `<!doctype html>
    <html><body>
      <a href="/lma/2024/bulletin-foo.html">Bulletin 2024 Foo</a>
      <a href="/lma/2025/bulletin-foo.html">Bulletin 2025 Foo</a>
    </body></html>`;
}

let originalFetch: typeof globalThis.fetch;

describe('Q3 — JWC scraper id collision on same filename, different path', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('Q3-a: two bulletins under different year directories with the same filename MUST receive distinct ids', async () => {
    // Routing table: listing → both bulletin pages.
    const routes: Record<string, FakeResponse> = {
      'https://www.lmalloyds.com/lma/jointwar': {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => htmlListingTwoBulletins(),
      },
      'https://www.lmalloyds.com/lma/2024/bulletin-foo.html': {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => htmlBulletin({ date: '2024-04-01', title: '2024 advisory' }),
      },
      'https://www.lmalloyds.com/lma/2025/bulletin-foo.html': {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => htmlBulletin({ date: '2025-04-01', title: '2025 advisory' }),
      },
    };

    globalThis.fetch = (async (input: any, _init?: FetchInit) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      const route = routes[url];
      if (!route) {
        throw new Error(`unexpected fetch in test: ${url}`);
      }
      return route as unknown as Response;
    }) as typeof globalThis.fetch;

    const bulletins = await scrapeJwc('https://www.lmalloyds.com/lma/jointwar');

    expect(bulletins).toHaveLength(2);
    const ids = bulletins.map(b => b.id);
    // Critical contract: IDs MUST be unique. Today both → "bulletin-foo.html".
    expect(new Set(ids).size).toBe(2);
    // Also pin: ids must encode something path-distinguishing — either the
    // full url-hash or the path itself. Bare filename "bulletin-foo.html"
    // is insufficient.
    expect(ids[0]).not.toBe('bulletin-foo.html');
    expect(ids[1]).not.toBe('bulletin-foo.html');
  });

  it('Q3-b: a single bulletin at a non-generic filename gets a stable id (control)', async () => {
    const routes: Record<string, FakeResponse> = {
      'https://www.lmalloyds.com/lma/jointwar': {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => `<a href="/lma/2024/uniq-bar.html">B</a>`,
      },
      'https://www.lmalloyds.com/lma/2024/uniq-bar.html': {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => htmlBulletin({ date: '2024-04-01', title: 'uniq' }),
      },
    };

    globalThis.fetch = (async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url ?? String(input);
      const route = routes[url];
      if (!route) throw new Error(`unexpected fetch in test: ${url}`);
      return route as unknown as Response;
    }) as typeof globalThis.fetch;

    const bulletins = await scrapeJwc('https://www.lmalloyds.com/lma/jointwar');
    expect(bulletins).toHaveLength(1);
    expect(typeof bulletins[0].id).toBe('string');
    expect(bulletins[0].id.length).toBeGreaterThan(0);
  });
});
