/**
 * Boundary tests for embedAndStore() with IMSBC-specific parameters (spec-15)
 *
 * Validates boundary conditions and edge cases:
 * - Empty chunks array → no-op
 * - Single chunk → exactly 1 row in both tables
 * - Large batch (>250) → auto-batching at MAX_BATCH_SIZE=250
 * - truncate=false with long chunk → RangeError
 * - truncate=true with long chunk → no error
 * - Missing ftsTable → rows in vec table only
 * - Unicode metadata → preserved through roundtrip
 *
 * Input Contract Coverage:
 * TC-NBI-01: Empty array `[]` → no-op
 * TC-NBI-03: truncate=false + content>2048 → RangeError
 * TC-NBI-04: truncate=true + content>2048 → success
 * TC-NBI-05: ftsTable=undefined → vec only
 * TC-NBI-06: Unicode metadata → preserved
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import type { Chunk } from "@/lib/knowledge/embeddings/chunks";

// Mock embedDocuments for testing
let _mockEmbedDocuments: jest.Mock = jest.fn();

jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedDocuments: (...args: unknown[]) => _mockEmbedDocuments(...args),
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
}));

import { embedAndStore } from "@/lib/knowledge/embeddings/pipeline";

describe("IMSBC embedAndStore boundary tests", () => {
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

  it("TC-NBI-01: empty chunks array → no-op (no rows in either table)", async () => {
    // Empty array guard — no API call, no INSERT
    await embedAndStore([], {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Verify no rows in imsbc_vec
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(0);

    // Verify no rows in imsbc_fts
    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_fts")
      .get() as { count: number };
    expect(ftsCount.count).toBe(0);

    // Verify embedDocuments was NOT called
    expect(_mockEmbedDocuments).not.toHaveBeenCalled();
  });

  it("TC-NBI-02: single chunk → exactly 1 row in both tables", async () => {
    const chunk: Chunk = {
      content: "SECTION 1 - Definitions. Transportable moisture limit.",
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: "section-1",
        title: "Definitions",
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

    // Verify exactly 1 row in imsbc_vec
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(1);

    // Verify exactly 1 row in imsbc_fts
    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_fts")
      .get() as { count: number };
    expect(ftsCount.count).toBe(1);
  });

  it("TC-NBI-03: large batch (260 chunks > MAX_BATCH_SIZE=250) → all chunks stored", async () => {
    // Generate 260 chunks to test auto-batching
    const chunks: Chunk[] = Array.from({ length: 260 }, (_, i) => ({
      content: `Chunk ${i}: IMSBC cargo safety regulation.`,
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: `section-${i}`,
        title: `Section ${i}`,
        subsectionIndex: 0,
      },
    }));

    // Mock embeddings for all chunks
    // embedDocuments will be called twice: batch 0-249 (250 chunks), batch 250-259 (10 chunks)
    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockEmbedDocuments.mockImplementation((texts: string[]) => {
      return Promise.resolve(Array(texts.length).fill(mockEmbedding));
    });

    await embedAndStore(chunks, {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true,
      db,
    });

    // Verify all 260 rows in imsbc_vec
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(260);

    // Verify all 260 rows in imsbc_fts
    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_fts")
      .get() as { count: number };
    expect(ftsCount.count).toBe(260);

    // Verify embedDocuments called twice (auto-batching at 250)
    expect(_mockEmbedDocuments).toHaveBeenCalledTimes(2);
    expect(_mockEmbedDocuments).toHaveBeenNthCalledWith(1, expect.arrayContaining([expect.any(String)]));
    expect(_mockEmbedDocuments.mock.calls[0][0]).toHaveLength(250);
    expect(_mockEmbedDocuments.mock.calls[1][0]).toHaveLength(10);
  });

  it("TC-NBI-04: truncate=false with chunk >2048 chars → RangeError", async () => {
    const longContent = "A".repeat(2049); // Exceeds MAX_CHUNK_LENGTH=2048
    const chunk: Chunk = {
      content: longContent,
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: "section-7",
        title: "Long section",
        subsectionIndex: 0,
      },
    };

    // Should throw RangeError BEFORE calling embedDocuments
    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        ftsTable: "imsbc_fts",
        truncate: false, // Strict mode
        db,
      })
    ).rejects.toThrow(RangeError);

    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        ftsTable: "imsbc_fts",
        truncate: false,
        db,
      })
    ).rejects.toThrow(/2048 character limit/);

    // Verify embedDocuments was NOT called (cost guard)
    expect(_mockEmbedDocuments).not.toHaveBeenCalled();
  });

  it("TC-NBI-05: truncate=true with chunk >2048 chars → no error (Vertex auto-truncates)", async () => {
    const longContent = "A".repeat(2049); // Exceeds MAX_CHUNK_LENGTH
    const chunk: Chunk = {
      content: longContent,
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: "section-7",
        title: "Long section",
        subsectionIndex: 0,
      },
    };

    // Mock embedding
    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockEmbedDocuments.mockResolvedValue([mockEmbedding]);

    // Should NOT throw with truncate=true
    await embedAndStore([chunk], {
      tableName: "imsbc_vec",
      ftsTable: "imsbc_fts",
      truncate: true, // Allow Vertex auto-truncation
      db,
    });

    // Verify 1 row stored
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(1);

    // Verify embedDocuments was called (no cost guard failure)
    expect(_mockEmbedDocuments).toHaveBeenCalledTimes(1);
  });

  it("TC-NBI-06: missing ftsTable → rows in imsbc_vec only (backward compat)", async () => {
    const chunk: Chunk = {
      content: "SECTION 1 - Definitions.",
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: "section-1",
        title: "Definitions",
        subsectionIndex: 0,
      },
    };

    // Mock embedding
    const mockEmbedding = new Float32Array(768).fill(0.5);
    _mockEmbedDocuments.mockResolvedValue([mockEmbedding]);

    // Call WITHOUT ftsTable
    await embedAndStore([chunk], {
      tableName: "imsbc_vec",
      // ftsTable: undefined (omitted)
      truncate: true,
      db,
    });

    // Verify 1 row in imsbc_vec
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_vec")
      .get() as { count: number };
    expect(vecCount.count).toBe(1);

    // Verify 0 rows in imsbc_fts (no dual-insert)
    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM imsbc_fts")
      .get() as { count: number };
    expect(ftsCount.count).toBe(0);
  });

  it("TC-NBI-07: Unicode metadata → stored and retrieved correctly", async () => {
    const chunk: Chunk = {
      content: "РАЗДЕЛ 4 - Оценка грузов. Liquefaction risk.",
      metadata: {
        source: "imsbc",
        sourceUrl: "https://www.imo.org/cargo",
        section: "section-4",
        title: "Раздел 4 — Оценка грузов",
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

    // Retrieve from imsbc_vec and verify Unicode preserved
    const vecRow = db
      .prepare("SELECT content, metadata FROM imsbc_vec LIMIT 1")
      .get() as { content: string; metadata: string };

    expect(vecRow.content).toBe("РАЗДЕЛ 4 - Оценка грузов. Liquefaction risk.");

    const metadata = JSON.parse(vecRow.metadata);
    expect(metadata.title).toBe("Раздел 4 — Оценка грузов");

    // Retrieve from imsbc_fts and verify Unicode preserved
    const ftsRow = db
      .prepare("SELECT content, metadata FROM imsbc_fts LIMIT 1")
      .get() as { content: string; metadata: string };

    expect(ftsRow.content).toBe("РАЗДЕЛ 4 - Оценка грузов. Liquefaction risk.");

    const ftsMetadata = JSON.parse(ftsRow.metadata);
    expect(ftsMetadata.title).toBe("Раздел 4 — Оценка грузов");
  });
});
