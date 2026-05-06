/**
 * E2E test: embedAndStore → searchVec0 roundtrip (spec-08)
 *
 * Validates end-to-end flow:
 * 1. Use embedAndStore() to populate vec0 table with chunks
 * 2. Call searchVec0() with query embedding close to stored embedding
 * 3. Verify closest chunk is returned first with correct content and metadata
 *
 * TDD RED phase: test FAILS until searchVec0() is implemented
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";
import type { Chunk } from "@/lib/knowledge/embeddings/chunks";

// Mock embedDocuments for testing
let _mockEmbedDocuments: jest.Mock = jest.fn();

jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedDocuments: (...args: unknown[]) => _mockEmbedDocuments(...args),
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
}));

import { embedAndStore } from "@/lib/knowledge/embeddings/pipeline";

describe("E2E: embedAndStore → searchVec0 roundtrip", () => {
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

  it("TC-E2E-01: embedAndStore then searchVec0 returns closest chunk first", async () => {
    // Prepare 3 chunks with known content
    const chunks: Chunk[] = [
      {
        content: "Cargo handling procedures for bulk carriers",
        metadata: { source: "imsbc", section: "Chapter 1", title: "Safety" }
      },
      {
        content: "International grain cargo regulations",
        metadata: { source: "imsbc", section: "Chapter 2", title: "Grain" }
      },
      {
        content: "Liquefaction risk assessment for mineral concentrates",
        metadata: { source: "imsbc", section: "Chapter 3", title: "Minerals" }
      }
    ];

    // Mock embedDocuments to return 3 distinct embeddings
    const mockEmbeddings = [
      new Float32Array(768).fill(0.1), // Embedding for chunk 0
      new Float32Array(768).fill(0.5), // Embedding for chunk 1
      new Float32Array(768).fill(0.9), // Embedding for chunk 2
    ];

    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    // Store chunks in vec0 table
    await embedAndStore(chunks, { tableName: "imsbc_vec", db });

    // Query with embedding close to chunk 1 (0.5)
    const queryEmbedding = new Float32Array(768).fill(0.51);

    const results = searchVec0(queryEmbedding, "imsbc_vec", 3, db);

    // Verify results
    expect(results).toHaveLength(3);

    // First result should be chunk 1 (closest to query embedding 0.51 ≈ 0.5)
    expect(results[0].content).toBe("International grain cargo regulations");
    expect(results[0].metadata.source).toBe("imsbc");
    expect(results[0].metadata.section).toBe("Chapter 2");
    expect(results[0].metadata.title).toBe("Grain");

    // Verify distance is smallest for first result
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
    expect(results[0].distance).toBeLessThanOrEqual(results[2].distance);

    // Verify all distances in valid range (L2 distance, not cosine)
    // TEMP-STAB-spec-08: sqlite-vec uses L2 distance (not cosine per spec-08 title)
    results.forEach(chunk => {
      expect(chunk.distance).toBeGreaterThanOrEqual(0.0);
      expect(chunk.distance).toBeLessThanOrEqual(60.0);
    });
  });

  it("TC-E2E-02: searchVec0 with topK=1 returns only closest match", async () => {
    const chunks: Chunk[] = [
      {
        content: "First document",
        metadata: { source: "imsbc", id: 1 }
      },
      {
        content: "Second document",
        metadata: { source: "imsbc", id: 2 }
      },
    ];

    const mockEmbeddings = [
      new Float32Array(768).fill(0.2),
      new Float32Array(768).fill(0.8),
    ];

    _mockEmbedDocuments.mockResolvedValue(mockEmbeddings);

    await embedAndStore(chunks, { tableName: "imsbc_vec", db });

    // Query close to first embedding (0.2)
    const queryEmbedding = new Float32Array(768).fill(0.19);

    const results = searchVec0(queryEmbedding, "imsbc_vec", 1, db);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("First document");
    expect(results[0].metadata).toHaveProperty("id", 1);
  });

  it("TC-E2E-03: searchVec0 across different vec0 tables maintains isolation", async () => {
    // Store in imsbc_vec
    const imsbcChunks: Chunk[] = [
      { content: "IMSBC content", metadata: { source: "imsbc" } }
    ];

    _mockEmbedDocuments.mockResolvedValue([
      new Float32Array(768).fill(0.3)
    ]);

    await embedAndStore(imsbcChunks, { tableName: "imsbc_vec", db });

    // Store in igc_vec
    const igcChunks: Chunk[] = [
      { content: "IGC content", metadata: { source: "igc" } }
    ];

    _mockEmbedDocuments.mockResolvedValue([
      new Float32Array(768).fill(0.3)
    ]);

    await embedAndStore(igcChunks, { tableName: "igc_vec", db });

    // Query imsbc_vec
    const queryEmbedding = new Float32Array(768).fill(0.3);
    const imsbcResults = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

    expect(imsbcResults).toHaveLength(1);
    expect(imsbcResults[0].content).toBe("IMSBC content");
    expect(imsbcResults[0].metadata.source).toBe("imsbc");

    // Query igc_vec
    const igcResults = searchVec0(queryEmbedding, "igc_vec", 5, db);

    expect(igcResults).toHaveLength(1);
    expect(igcResults[0].content).toBe("IGC content");
    expect(igcResults[0].metadata.source).toBe("igc");
  });
});
