/**
 * Integration tests for embedAndStore() with IMSBC-specific parameters (spec-15)
 *
 * Validates IMSBC pipeline integration:
 * - Dual-insert correctness (both imsbc_vec and imsbc_fts)
 * - Content roundtrip (vec0 and FTS5)
 * - FTS5 MATCH query with domain keywords
 * - Vec0 cosine k-NN query with deterministic embeddings
 * - Multi-chunk batch processing
 * - Metadata structure and preservation
 *
 * This validates ROADMAP Phase 2 section A1:
 * "embedAndStore(chunks, { vectorTable: 'imsbc_vec', ftsTable: 'imsbc_fts' })
 *  writes IMSBC chunks to both vec0 and FTS5 tables with correct content and metadata."
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import type { Chunk } from "@/lib/knowledge/embeddings/chunks";
import imsbcChunksFixture from "../../fixtures/imsbc-embedstore-chunks.json";

// Mock embedDocuments for testing
let _mockEmbedDocuments: jest.Mock = jest.fn();

jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedDocuments: (...args: unknown[]) => _mockEmbedDocuments(...args),
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
}));

import { embedAndStore } from "@/lib/knowledge/embeddings/pipeline";

describe("IMSBC embedAndStore integration tests", () => {
  let db: Database.Database;
  const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeEach(() => {
    db = new Database(":memory:");
    sqliteVec.load(db);
    runMigrations(db, allMigrations);

    // Enable RAG
    process.env.KNOWLEDGE_RAG_ENABLED = "true";

    // Reset mock
    _mockEmbedDocuments = jest.fn();
  });

  afterEach(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = originalEnv;
  });

  it("TC-INT-01: dual-insert correctness — rows in both imsbc_vec and imsbc_fts", async () => {
    const chunks = imsbcChunksFixture as Chunk[];

    // Mock embeddings (one per chunk)
    const mockEmbeddings = chunks.map(() => new Float32Array(768).fill(0.5));
    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Verify row count in imsbc_vec
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(chunks.length);

    // Verify row count in imsbc_fts
    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_fts")
      .get() as { count: number };
    expect(ftsCount.count).toBe(chunks.length);
  });

  it("TC-INT-02: content roundtrip (vec0) — content and metadata match original", async () => {
    const chunks = imsbcChunksFixture as Chunk[];

    // Mock embeddings
    const mockEmbeddings = chunks.map(() => new Float32Array(768).fill(0.5));
    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Retrieve all rows from imsbc_vec
    const rows = db
      .prepare("SELECT rowid, content, metadata FROM imsbc_vec ORDER BY rowid")
      .all() as Array<{ rowid: number; content: string; metadata: string }>;

    expect(rows.length).toBe(chunks.length);

    // Verify content and metadata for each chunk
    rows.forEach((row, i) => {
      expect(row.content).toBe(chunks[i].content);

      const metadata = JSON.parse(row.metadata);
      expect(metadata.source).toBe("imsbc");
      expect(metadata.sourceUrl).toBe(chunks[i].metadata.sourceUrl);
      expect(metadata.section).toBe(chunks[i].metadata.section);
      expect(metadata.title).toBe(chunks[i].metadata.title);
      expect(metadata.subsectionIndex).toBe(chunks[i].metadata.subsectionIndex);
    });
  });

  it("TC-INT-03: content roundtrip (FTS5) — content and metadata match original", async () => {
    const chunks = imsbcChunksFixture as Chunk[];

    // Mock embeddings
    const mockEmbeddings = chunks.map(() => new Float32Array(768).fill(0.5));
    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Retrieve all rows from imsbc_fts
    const rows = db
      .prepare("SELECT rowid, content, metadata FROM imsbc_fts ORDER BY rowid")
      .all() as Array<{ rowid: number; content: string; metadata: string }>;

    expect(rows.length).toBe(chunks.length);

    // Verify content and metadata for each chunk
    rows.forEach((row, i) => {
      expect(row.content).toBe(chunks[i].content);

      const metadata = JSON.parse(row.metadata);
      expect(metadata.source).toBe("imsbc");
      expect(metadata.sourceUrl).toBe(chunks[i].metadata.sourceUrl);
      expect(metadata.section).toBe(chunks[i].metadata.section);
      expect(metadata.title).toBe(chunks[i].metadata.title);
      expect(metadata.subsectionIndex).toBe(chunks[i].metadata.subsectionIndex);
    });
  });

  it("TC-INT-04: FTS5 MATCH query — returns chunk with 'IRON ORE FINES'", async () => {
    const chunks = imsbcChunksFixture as Chunk[];

    // Mock embeddings
    const mockEmbeddings = chunks.map(() => new Float32Array(768).fill(0.5));
    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Perform FTS5 MATCH query for domain-specific keyword
    const results = db
      .prepare("SELECT rowid, content, metadata FROM imsbc_fts WHERE imsbc_fts MATCH 'IRON ORE FINES'")
      .all() as Array<{ rowid: number; content: string; metadata: string }>;

    // Should return at least 1 result (fixture has chunk mentioning "IRON ORE FINES")
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify the matching chunk contains the search term
    const matchingChunk = results[0];
    expect(matchingChunk.content).toContain("IRON ORE FINES");

    // Verify metadata structure
    const metadata = JSON.parse(matchingChunk.metadata);
    expect(metadata.source).toBe("imsbc");
    expect(metadata.section).toBe("section-4"); // Known from fixture
  });

  it("TC-INT-05: vec0 cosine k-NN query — returns rows ordered by distance", async () => {
    const chunks = imsbcChunksFixture as Chunk[];

    // Create directionally distinct embeddings to test k-NN ordering
    // Chunk 0: axis-aligned dim 0
    // Chunk 1: axis-aligned dim 1
    // Chunk 2: axis-aligned dim 2
    // Chunk 3: axis-aligned dim 3
    // Chunk 4: axis-aligned dim 4
    const mockEmbeddings = chunks.map((_, i) => {
      const emb = new Float32Array(768).fill(0.0);
      emb[i] = 1.0; // Each chunk has a distinct primary dimension
      return emb;
    });
    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Query embedding close to chunk 1 (axis-aligned dim 1)
    const queryEmbedding = new Float32Array(768).fill(0.0);
    queryEmbedding[1] = 1.0;
    const queryEmbeddingJson = JSON.stringify(Array.from(queryEmbedding));

    // Perform cosine k-NN query
    const results = db
      .prepare(
        `SELECT rowid, content, metadata, distance
         FROM imsbc_vec
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT 5`
      )
      .all(queryEmbeddingJson) as Array<{
        rowid: number;
        content: string;
        metadata: string;
        distance: number;
      }>;

    // Verify results ordered by distance ascending
    expect(results.length).toBeGreaterThan(0);

    // Check ascending distance order
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
    }

    // First result should be chunk 1 (closest to query)
    // Chunk 1 is at index 1 in fixture (rowid 2 if 1-indexed)
    const closestChunk = results[0];
    expect(closestChunk.distance).toBeLessThan(0.1); // Very close (axis-aligned)

    // Verify metadata structure
    const metadata = JSON.parse(closestChunk.metadata);
    expect(metadata.source).toBe("imsbc");
    expect(metadata.sourceUrl).toBeDefined();
    expect(metadata.section).toBeDefined();
    expect(metadata.title).toBeDefined();
    expect(metadata.subsectionIndex).toBeDefined();
  });

  it("TC-INT-06: multi-chunk batch — all 5 chunks appear in both tables", async () => {
    const chunks = imsbcChunksFixture as Chunk[];

    // Verify fixture has 5 chunks
    expect(chunks.length).toBe(5);

    // Mock embeddings
    const mockEmbeddings = chunks.map(() => new Float32Array(768).fill(0.5));
    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Verify all 5 chunks in imsbc_vec
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(5);

    // Verify all 5 chunks in imsbc_fts
    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_fts")
      .get() as { count: number };
    expect(ftsCount.count).toBe(5);

    // Verify each chunk has correct metadata structure
    const vecRows = db
      .prepare("SELECT metadata FROM imsbc_vec")
      .all() as Array<{ metadata: string }>;

    vecRows.forEach((row) => {
      const metadata = JSON.parse(row.metadata);
      expect(metadata.source).toBe("imsbc");
      expect(metadata.sourceUrl).toBeDefined();
      expect(metadata.section).toBeDefined();
      expect(metadata.title).toBeDefined();
      expect(metadata.subsectionIndex).toBeDefined();
      expect(typeof metadata.subsectionIndex).toBe("number");
    });
  });

  it("TC-INT-07: metadata structure — exact schema validation", async () => {
    const chunk: Chunk = {
      content: "SECTION 1 - Definitions.",
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: "section-1",
        title: "SECTION 1 - Definitions",
        subsectionIndex: 0,
      },
    };

    // Mock embedding
    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockEmbedDocuments.mockResolvedValue([mockEmbedding]);

    await embedAndStore([chunk], {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Retrieve from imsbc_vec
    const vecRow = db
      .prepare("SELECT metadata FROM imsbc_vec LIMIT 1")
      .get() as { metadata: string };

    const metadata = JSON.parse(vecRow.metadata);

    // Verify exact metadata schema
    expect(metadata).toEqual({
      source: "imsbc",
      sourceUrl: "https://www.imo.org/cargo",
      section: "section-1",
      title: "SECTION 1 - Definitions",
      subsectionIndex: 0,
    });

    // Verify all required fields present
    expect(metadata.source).toBe("imsbc");
    expect(metadata.sourceUrl).toBe("https://www.imo.org/cargo");
    expect(metadata.section).toBe("section-1");
    expect(metadata.title).toBe("SECTION 1 - Definitions");
    expect(metadata.subsectionIndex).toBe(0);
  });

  it("TC-INT-08: truncate mode — long chunk (>2048 chars) does not throw", async () => {
    // Fixture has chunk 4 (index 4) with >2048 chars
    const chunks = imsbcChunksFixture as Chunk[];
    const longChunk = chunks[4];

    // Verify this chunk is indeed >2048 chars
    expect(longChunk.content.length).toBeGreaterThan(2048);

    // Mock embedding
    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockEmbedDocuments.mockResolvedValue([mockEmbedding]);

    // Should NOT throw with truncate=true
    await embedAndStore([longChunk], {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Verify row was stored
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(1);

    // Verify full content stored (not truncated in DB)
    const row = db
      .prepare("SELECT content FROM imsbc_vec LIMIT 1")
      .get() as { content: string };
    expect(row.content).toBe(longChunk.content);
  });
});
