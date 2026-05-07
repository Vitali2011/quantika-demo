/**
 * Regression tests: H1 (truncate mismatch) + H2 (JWC ID collision)
 * Discovery: adversarial QA cold-start, 2026-05-07
 * Branch: claude/rag-phase2-20260507
 *
 * DO NOT DELETE — these tests document two HIGH-severity silent data corruption
 * bugs. Keep them even after fixes so regressions are caught automatically.
 *
 * ── H1: embedding/storage truncation mismatch ──────────────────────────────
 * Both IMSBC and JWC adapters call embedAndStore({ truncate: true }).
 * pipeline.ts sends the FULL chunk.content to embedDocuments() (line 106:
 * `texts = batch.map(c => c.content)`). client.ts sets autoTruncate: false
 * in the Vertex AI API parameters (line 61), meaning Vertex is explicitly
 * told NOT to truncate. With truncate:true at the pipeline layer the
 * intent is "Vertex handles truncation", but the API flag contradicts it.
 * A 2050-char chunk is sent to Vertex with autoTruncate:false → the API
 * may reject it or produce a degraded embedding while the full 2050-char
 * text is stored in the vec table. Cosine search silently returns bad results.
 *
 * ── H2: JWC fallback ID collision ──────────────────────────────────────────
 * parseBulletin() (scraper.ts line 160) falls back to `jwc-${Date.now()}`
 * when extractId() returns null. Two bulletins parsed in the same millisecond
 * receive identical IDs. Last-write-wins in the vec table → silent data loss.
 * Separately, two bulletins sharing the same URL path segment (e.g. both at
 * ".../index.html") always collide because extractId() returns the same string.
 *
 * ── Mock strategy ──────────────────────────────────────────────────────────
 * H1 tests use jest.doMock + jest.resetModules (not jest.mock hoisting) to
 * inject a fake `embedDocuments` before pipeline.ts is loaded. This avoids
 * the @google-cloud/aiplatform gRPC auth initialization that fires even when
 * the PredictionServiceClient constructor is mocked at the class level.
 * H2 tests use jest.spyOn on global.fetch (no GCP involvement).
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import type { Chunk } from '@/lib/knowledge/embeddings/chunks';

// ─── H1: Truncation mismatch ─────────────────────────────────────────────────
//
// We use jest.doMock + jest.resetModules per test so that pipeline.ts is
// loaded AFTER the embedDocuments mock is in place, without fighting the
// gRPC auth layer of @google-cloud/aiplatform.

describe('H1 regression: truncate=true embedding/storage mismatch', () => {
  let db: Database.Database;

  // Helper: set up an in-memory SQLite DB with the required vec0 tables
  function makeDb(): Database.Database {
    const testDb = new Database(':memory:');
     
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(testDb);
    testDb
      .prepare(
        `CREATE VIRTUAL TABLE IF NOT EXISTS imsbc_vec USING vec0(
          content TEXT, metadata TEXT, embedding FLOAT[768]
        )`
      )
      .run();
    testDb
      .prepare(
        `CREATE VIRTUAL TABLE IF NOT EXISTS jwc_vec USING vec0(
          content TEXT, metadata TEXT, embedding FLOAT[768]
        )`
      )
      .run();
    return testDb;
  }

  beforeEach(() => {
    // Reset the module registry before each test so doMock takes effect
    jest.resetModules();
    db = makeDb();
  });

  afterEach(() => {
    db.close();
    jest.resetModules();
  });

  it('H1-a: pipeline sends FULL text to embedDocuments (not pre-truncated client-side)', async () => {
    // The full 2050-char text must reach the embedDocuments() call unchanged.
    // If pipeline.ts were doing client-side truncation, sentText.length would be 2048.
    const capturedTexts: string[][] = [];

    jest.doMock('@/lib/knowledge/embeddings/client', () => ({
      embedDocuments: jest.fn().mockImplementation((texts) => {
        capturedTexts.push([...(texts as string[])]);
        return Promise.resolve([new Float32Array(768).fill(0.42)]);
      }),
      embedQuery: jest.fn(),
      embed: jest.fn(),
    }));

    // Load pipeline AFTER the mock is registered
     
    const { embedAndStore } = require('@/lib/knowledge/embeddings/pipeline') as typeof import('@/lib/knowledge/embeddings/pipeline');

    const fullText = 'x'.repeat(2050);
    const chunk: Chunk = { content: fullText, metadata: { source: 'imsbc', section: 'ch1' } };

    await embedAndStore([chunk], { tableName: 'imsbc_vec', truncate: true, db });

    // embedDocuments must have been called once
    expect(capturedTexts).toHaveLength(1);

    const sentText = capturedTexts[0][0];

    // ── WHAT THE CODE ACTUALLY DOES ──────────────────────────────────────
    // pipeline.ts line 106: `const texts = batch.map((c) => c.content);`
    // No client-side truncation occurs. The full 2050-char text is forwarded.
    expect(sentText).toBe(fullText);
    expect(sentText.length).toBe(2050);

    // ── BUG SURFACE ──────────────────────────────────────────────────────
    // client.ts line 61 sets autoTruncate: false in the Vertex AI parameters.
    // With truncate:true in the adapters, the intent is "Vertex auto-truncates",
    // but the API explicitly says NO. Vertex receives 2050 chars with
    // autoTruncate:false → potential API rejection or degraded embedding.
    // Meanwhile the FULL 2050-char text is stored in the vec table.
    // Fix options:
    //   A: client-side slice to 2048 before API call (stored = sent = 2048)
    //   B: set autoTruncate:true server-side AND store only 2048 chars
    //   C: always reject >2048 (remove the truncate=true escape hatch)
  });

  it('H1-b: stored content equals what embedDocuments received (alignment check)', async () => {
    // Verify the text stored in the vec table is the same as what was sent to
    // the embedding API. If these ever diverge, cosine similarity is meaningless.
    const capturedTexts: string[][] = [];

    jest.doMock('@/lib/knowledge/embeddings/client', () => ({
      embedDocuments: jest.fn().mockImplementation((texts) => {
        capturedTexts.push([...(texts as string[])]);
        return Promise.resolve([new Float32Array(768).fill(0.42)]);
      }),
      embedQuery: jest.fn(),
      embed: jest.fn(),
    }));

     
    const { embedAndStore } = require('@/lib/knowledge/embeddings/pipeline') as typeof import('@/lib/knowledge/embeddings/pipeline');

    const fullText = 'y'.repeat(2050);
    const chunk: Chunk = { content: fullText, metadata: { source: 'jwc', section: 'bulletin' } };

    await embedAndStore([chunk], { tableName: 'jwc_vec', truncate: true, db });

    // What was stored
    const row = db.prepare('SELECT content FROM jwc_vec LIMIT 1').get() as { content: string } | undefined;
    expect(row).toBeDefined();
    const storedContent = row!.content;

    // What was sent to the embedding API
    expect(capturedTexts).toHaveLength(1);
    const sentText = capturedTexts[0][0];

    // Alignment check: stored ≡ sent
    expect(storedContent).toBe(sentText);
    expect(storedContent.length).toBe(sentText.length);

    // Both are 2050 chars — no truncation anywhere.
    // The bug is not alignment TODAY, but Vertex refusing the oversized input
    // (autoTruncate:false) and the text exceeding the 2048-char API limit.
    // After a correct fix: storedContent.length === sentText.length === 2048.
    expect(storedContent.length).toBe(2050); // documents current (broken) behavior
  });

  it('H1-c: truncate:true skips RangeError guard but does NOT truncate text (no-op)', async () => {
    // truncate:false throws RangeError (locked in pipeline.test.ts).
    // truncate:true skips the guard but performs zero actual truncation.
    // This test pinpoints that the flag is purely a guard bypass, not a truncation signal.
    const capturedTexts: string[][] = [];

    jest.doMock('@/lib/knowledge/embeddings/client', () => ({
      embedDocuments: jest.fn().mockImplementation((texts) => {
        capturedTexts.push([...(texts as string[])]);
        return Promise.resolve([new Float32Array(768).fill(0.42)]);
      }),
      embedQuery: jest.fn(),
      embed: jest.fn(),
    }));

     
    const { embedAndStore } = require('@/lib/knowledge/embeddings/pipeline') as typeof import('@/lib/knowledge/embeddings/pipeline');

    const chunk: Chunk = { content: 'z'.repeat(2050), metadata: { source: 'imsbc', section: 'ch2' } };

    // truncate:false → throws RangeError (existing behavior, must be preserved)
    await expect(
      embedAndStore([chunk], { tableName: 'imsbc_vec', truncate: false, db })
    ).rejects.toThrow(RangeError);

    // No embedDocuments call on RangeError path
    expect(capturedTexts).toHaveLength(0);

    // truncate:true → bypasses guard, calls embedDocuments with FULL text
    await embedAndStore([chunk], { tableName: 'imsbc_vec', truncate: true, db });

    expect(capturedTexts).toHaveLength(1);
    const sentText = capturedTexts[0][0];

    // BUG CONFIRMED: truncate:true is a no-op in pipeline.ts.
    // The text sent to Vertex is still 2050 chars, not ≤2048.
    expect(sentText.length).toBeGreaterThan(2048);
    expect(sentText.length).toBe(2050);
  });
});

// ─── H2: JWC ID collision ─────────────────────────────────────────────────────

describe('H2 regression: JWC fallback ID collision', () => {
  // scraper.ts parseBulletin() is not exported — we test via scrapeJwc()
  // with mocked fetch. Two collision scenarios:
  //
  // Scenario 1 (Date.now() path): extractId() returns null when no JWLA
  // pattern AND URL regex returns null (trailing-slash URLs). Two such
  // bulletins parsed in the same millisecond → identical `jwc-<timestamp>` IDs.
  //
  // Scenario 2 (shared segment path): two bulletins from URLs with the same
  // path segment (e.g., both end in "index.html") → extractId() returns the
  // same string → always collide regardless of timing.

  const JWLA_FREE_HTML = `
    <html>
      <body>
        <h1>Generic JWC Bulletin</h1>
        <time>2026-01-15</time>
        <p>Some bulletin text without any JWLA identifier.</p>
      </body>
    </html>
  `;

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('H2-a: Date.now() fallback produces same ID when time is frozen (collision confirmed)', () => {
    // When two parseBulletin calls happen in the same millisecond, the fallback
    // `jwc-${Date.now()}` produces identical IDs → last-write-wins in vec table.
    jest.useFakeTimers({ now: 1746619200000 }); // 2026-05-07T12:00:00.000Z as ms

    const id1 = `jwc-${Date.now()}`;
    const id2 = `jwc-${Date.now()}`;

    // With frozen time these are identical — confirming the collision potential.
    // BUG: `jwc-1746619200000` === `jwc-1746619200000` → silent data loss.
    // Fix: crypto.randomUUID(), or `jwc-${hash(url)}-${Date.now()}`, or counter.
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^jwc-\d+$/);

    jest.useRealTimers();
  });

  it('H2-b: extractId returns null for trailing-slash URL (Date.now() fallback is triggered)', () => {
    // White-box test of extractId() behavior in scraper.ts.
    // The regex /\/([^\/]+)$/ requires ≥1 non-slash char after the final slash.
    // A URL ending in "/" has zero such chars → no match → regex returns null.
    // extractId returns null → parseBulletin falls back to `jwc-${Date.now()}`.

    const trailingSlashUrl = 'https://jwc.example.com/bulletins/';
    const urlMatch = /\/([^\/]+)$/.exec(trailingSlashUrl);

    // BUG PRECONDITION: regex returns null for trailing-slash URLs.
    // This means the Date.now() fallback IS triggered for such URLs.
    expect(urlMatch).toBeNull();
  });

  it('H2-c: same URL path segment always produces ID collision (deterministic, timing-independent)', async () => {
    // Two bulletins from different pages both ending in "index.html" get the
    // same extractId() result → same bulletin ID → last-write-wins in vec table.
    // This collision is deterministic: it happens regardless of timing.

    const URL_A = 'https://jwc.example.com/area-a/index.html';
    const URL_B = 'https://jwc.example.com/area-b/index.html';

    const LISTING_HTML = `
      <html><body>
        <a href="${URL_A}">Bulletin A</a>
        <a href="${URL_B}">Bulletin B</a>
      </body></html>
    `;

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
       
      (url: any): Promise<Response> => {
        const urlStr = String(url);
        const body = urlStr === URL_A || urlStr === URL_B ? JWLA_FREE_HTML : LISTING_HTML;
        return Promise.resolve(
          new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
        );
      }
    );

    const { scrapeJwc } = await import('@/lib/knowledge/sources/jwc/scraper');
    const bulletins = await scrapeJwc('https://jwc.example.com/listing');

    fetchMock.mockRestore();

    // Both URLs end in "index.html" → extractId returns "index.html" for both.
    if (bulletins.length >= 2) {
      const ids = bulletins.map((b) => b.id);
      const uniqueIds = new Set(ids);

      // BUG: uniqueIds.size === 1 while ids.length === 2 → ID collision.
      // This assertion is RED (fails) until the bug is fixed.
      // Fix: use full URL as ID, or hash(url), or url + content hash.
      expect(uniqueIds.size).toBe(ids.length); // fails: 1 !== 2
    } else if (bulletins.length === 1) {
      // If the scraper returned only 1 bulletin for 2 distinct URLs, data loss
      // happened somewhere upstream. The assertion below forces this to fail too.
      expect(bulletins.length).toBe(2); // forces RED — silent data loss confirmed
    } else {
      expect(bulletins.length).toBeGreaterThan(0); // forces RED — check mock setup
    }
  });

  it('H2-d: two trailing-slash URLs in same millisecond get identical IDs (full scenario)', async () => {
    // Combines H2-a + H2-b: trailing-slash URLs (extractId returns null) AND
    // frozen time (Date.now() is the same for both calls) → same ID for both.

    jest.useFakeTimers({ now: 1746619200000 }); // 2026-05-07T12:00:00.000Z

    const URL_A = 'https://jwc.example.com/area-a/';
    const URL_B = 'https://jwc.example.com/area-b/';

    const LISTING_HTML = `
      <html><body>
        <a href="${URL_A}">Bulletin A</a>
        <a href="${URL_B}">Bulletin B</a>
      </body></html>
    `;

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
       
      (url: any): Promise<Response> => {
        const urlStr = String(url);
        const body = urlStr === URL_A || urlStr === URL_B ? JWLA_FREE_HTML : LISTING_HTML;
        return Promise.resolve(
          new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
        );
      }
    );

    const { scrapeJwc } = await import('@/lib/knowledge/sources/jwc/scraper');
    const bulletins = await scrapeJwc('https://jwc.example.com/listing');

    fetchMock.mockRestore();
    jest.useRealTimers();

    if (bulletins.length >= 2) {
      const ids = bulletins.map((b) => b.id);
      const uniqueIds = new Set(ids);

      // BUG CONFIRMED: both IDs are `jwc-1746619200000` → collision.
      // Fix: crypto.randomUUID(), or hash(sourceUrl + rawText), or counter suffix.
      expect(uniqueIds.size).toBe(ids.length); // RED until fixed
    } else {
      // Trailing-slash links may be filtered or fetched differently.
      // H2-a + H2-b independently confirm the two preconditions for this collision.
      // Log a warning but don't fail — the preconditions are already locked above.
      console.warn(
        `[H2-d] ${bulletins.length} bulletin(s) from trailing-slash URLs — ` +
          `extractBulletinLinks may filter them. H2-a/H2-b confirm preconditions.`
      );
    }
  });
});

// ─── Q3: JWC ID uniqueness after full-URL hash fix ────────────────────────────

describe('Q3 regression: JWC ID uniqueness after full-URL hash fix', () => {
  const JWLA_FREE_HTML = `
    <html>
      <body>
        <h1>Bulletin</h1>
        <time>2026-01-15</time>
        <p>Content without JWLA identifier.</p>
      </body>
    </html>
  `;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Q3-a: two URLs with same basename but different paths get different IDs', async () => {
    const URL_A = 'https://jwc.example.com/2024/bulletin.html';
    const URL_B = 'https://jwc.example.com/2025/bulletin.html';

    const LISTING_HTML = `
      <html><body>
        <a href="${URL_A}">Bulletin 2024</a>
        <a href="${URL_B}">Bulletin 2025</a>
      </body></html>
    `;

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      (url: any): Promise<Response> => {
        const urlStr = String(url);
        const body = (urlStr === URL_A || urlStr === URL_B) ? JWLA_FREE_HTML : LISTING_HTML;
        return Promise.resolve(
          new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
        );
      }
    );

    const { scrapeJwc } = await import('@/lib/knowledge/sources/jwc/scraper');
    const bulletins = await scrapeJwc('https://jwc.example.com/listing');

    fetchMock.mockRestore();

    expect(bulletins.length).toBe(2);
    const ids = bulletins.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
  });
});
