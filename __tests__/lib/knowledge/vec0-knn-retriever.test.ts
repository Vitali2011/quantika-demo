/**
 * Unit + integration tests for searchVec0() (spec-08)
 *
 * Validates vec0 cosine k-NN retriever:
 * - Input boundary validation (dimension, topK, feature flag)
 * - Distance ordering (ascending - closest first)
 * - Content and metadata fidelity
 * - Metadata JSON parsing
 * - topK limits and defaults
 * - Cross-table isolation
 * - Distance magnitude range [0.0, 2.0]
 *
 * Input Contract (from spec-08):
 * - embedding: Float32Array[768] required, throws RangeError if not 768-dimensional
 * - tableName: string required, SQLite throws if nonexistent
 * - topK: number optional (default 5), throws RangeError if NaN/Infinity/negative
 * - db: Database optional (defaults to getDb())
 * - Feature flag: throws Error if KNOWLEDGE_RAG_ENABLED !== "true"
 *
 * TDD RED phase: all tests FAIL until searchVec0() is implemented
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import type { ChunkMetadata, RetrievedChunk } from "@/lib/knowledge/embeddings/chunks";

// Import searchVec0 - will fail in RED phase until implemented
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";

describe("searchVec0() vec0 cosine k-NN retriever (spec-08)", () => {
  let db: Database.Database;
  const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeEach(() => {
    // In-memory database for isolation
    db = new Database(":memory:");
    sqliteVec.load(db);

    // Run migrations to create vec0 tables
    runMigrations(db, allMigrations);

    // Enable RAG for most tests
    process.env.KNOWLEDGE_RAG_ENABLED = "true";
  });

  afterEach(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = originalEnv;
  });

  describe("Input Contract: boundary validation", () => {
    it("TC-NBI-01: embedding dimension 384 → throws RangeError", () => {
      const invalidEmbedding = new Float32Array(384).fill(0.1);

      expect(() => {
        searchVec0(invalidEmbedding, "imsbc_vec", 5, db);
      }).toThrow(RangeError);

      expect(() => {
        searchVec0(invalidEmbedding, "imsbc_vec", 5, db);
      }).toThrow("Embedding must be 768-dimensional");
    });

    it("TC-NBI-02: embedding dimension 1536 → throws RangeError", () => {
      const invalidEmbedding = new Float32Array(1536).fill(0.1);

      expect(() => {
        searchVec0(invalidEmbedding, "imsbc_vec", 5, db);
      }).toThrow(RangeError);

      expect(() => {
        searchVec0(invalidEmbedding, "imsbc_vec", 5, db);
      }).toThrow("Embedding must be 768-dimensional");
    });

    it("TC-NBI-03: topK = -1 → throws RangeError", () => {
      const embedding = new Float32Array(768).fill(0.1);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", -1, db);
      }).toThrow(RangeError);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", -1, db);
      }).toThrow("topK must be a positive integer");
    });

    it("TC-NBI-04: topK = 0 → returns empty array", () => {
      const embedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(embedding, "imsbc_vec", 0, db);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("TC-NBI-05: topK = NaN → throws RangeError", () => {
      const embedding = new Float32Array(768).fill(0.1);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", NaN, db);
      }).toThrow(RangeError);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", NaN, db);
      }).toThrow("topK must be a positive integer");
    });

    it("TC-NBI-06: topK = Infinity → throws RangeError", () => {
      const embedding = new Float32Array(768).fill(0.1);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", Infinity, db);
      }).toThrow(RangeError);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", Infinity, db);
      }).toThrow("topK must be a positive integer");
    });

    it("TC-NBI-07: unknown table → allowlist rejects before SQLite", () => {
      const embedding = new Float32Array(768).fill(0.1);

      expect(() => {
        searchVec0(embedding, "nonexistent_vec", 5, db);
      }).toThrow(/invalid table name/i);
    });

    it("TC-NBI-08: KNOWLEDGE_RAG_ENABLED=false → throws Error", () => {
      process.env.KNOWLEDGE_RAG_ENABLED = "false";
      const embedding = new Float32Array(768).fill(0.1);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", 5, db);
      }).toThrow(Error);

      expect(() => {
        searchVec0(embedding, "imsbc_vec", 5, db);
      }).toThrow("RAG is not enabled");
    });
  });

  describe("Basic retrieval and ordering", () => {
    beforeEach(() => {
      // Insert 5 test chunks with known embeddings
      for (let i = 1; i <= 5; i++) {
        const embedding = new Float32Array(768).fill(i * 0.1);
        const embeddingJson = JSON.stringify(Array.from(embedding));
        const metadata = JSON.stringify({
          source: "imsbc",
          section: `Section ${i}`,
          title: `Document ${i}`
        });

        db.prepare(
          "INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)"
        ).run(embeddingJson, `Test content ${i}`, metadata);
      }
    });

    it("TC-BR-01: basic retrieval returns sorted results by distance ascending", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 3, db);

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);

      // Verify ascending order: each distance >= previous distance
      for (let i = 1; i < result.length; i++) {
        expect(result[i].distance).toBeGreaterThanOrEqual(result[i - 1].distance);
      }
    });

    it("TC-BR-02: distance ordering - closest match first", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result).toHaveLength(5);
      // First result should have smallest distance (closest to query)
      expect(result[0].distance).toBeLessThanOrEqual(result[1].distance);
      expect(result[0].distance).toBeLessThanOrEqual(result[4].distance);
    });

    it("TC-BR-03: content and metadata fidelity", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result).toHaveLength(5);

      // Verify content matches inserted values
      const contents = result.map(r => r.content);
      expect(contents).toContain("Test content 1");
      expect(contents).toContain("Test content 2");

      // Verify metadata structure
      result.forEach(chunk => {
        expect(chunk.metadata).toHaveProperty("source");
        expect(chunk.metadata.source).toBe("imsbc");
      });
    });

    it("TC-BR-04: metadata JSON parsing to ChunkMetadata", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result).toHaveLength(5);

      result.forEach(chunk => {
        expect(chunk.metadata).toHaveProperty("source");
        expect(chunk.metadata).toHaveProperty("section");
        expect(chunk.metadata).toHaveProperty("title");
        expect(typeof chunk.metadata.source).toBe("string");
        expect(typeof chunk.metadata.section).toBe("string");
        expect(typeof chunk.metadata.title).toBe("string");
      });
    });
  });

  describe("topK limits and defaults", () => {
    beforeEach(() => {
      // Insert 10 test chunks
      for (let i = 1; i <= 10; i++) {
        const embedding = new Float32Array(768).fill(i * 0.05);
        const embeddingJson = JSON.stringify(Array.from(embedding));
        const metadata = JSON.stringify({ source: "imsbc", id: i });

        db.prepare(
          "INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)"
        ).run(embeddingJson, `Content ${i}`, metadata);
      }
    });

    it("TC-LIMIT-01: topK=3 returns exactly 3 results from 10 rows", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 3, db);

      expect(result).toHaveLength(3);
    });

    it("TC-LIMIT-02: default topK returns 5 results", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      // Call without topK parameter
      const result = searchVec0(queryEmbedding, "imsbc_vec", undefined, db);

      expect(result.length).toBeLessThanOrEqual(5);
      expect(result.length).toBeGreaterThan(0);
    });

    it("TC-LIMIT-03: topK > table size returns all available rows", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 100, db);

      expect(result).toHaveLength(10); // Only 10 rows exist
    });
  });

  describe("Empty table and cross-table isolation", () => {
    it("TC-EMPTY-01: empty table returns []", () => {
      const queryEmbedding = new Float32Array(768).fill(0.1);

      // imsbc_vec starts empty
      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("TC-ISOLATION-01: cross-table isolation - insert into imsbc_vec, query igc_vec returns []", () => {
      // Insert into imsbc_vec
      const embedding = new Float32Array(768).fill(0.1);
      const embeddingJson = JSON.stringify(Array.from(embedding));
      const metadata = JSON.stringify({ source: "imsbc" });

      db.prepare(
        "INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)"
      ).run(embeddingJson, "IMSBC content", metadata);

      // Query igc_vec (different table)
      const queryEmbedding = new Float32Array(768).fill(0.1);
      const result = searchVec0(queryEmbedding, "igc_vec", 5, db);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("Expected Output Ranges (magnitude assertions)", () => {
    beforeEach(() => {
      // Insert chunks to test distance range
      const identicalEmbedding = new Float32Array(768).fill(0.5);
      const oppositeEmbedding = new Float32Array(768).fill(-0.5);

      db.prepare(
        "INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)"
      ).run(
        JSON.stringify(Array.from(identicalEmbedding)),
        "Identical vector",
        JSON.stringify({ source: "imsbc", test: "identical" })
      );

      db.prepare(
        "INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)"
      ).run(
        JSON.stringify(Array.from(oppositeEmbedding)),
        "Opposite vector",
        JSON.stringify({ source: "imsbc", test: "opposite" })
      );
    });

    it("TC-RANGE-01: cosine distance within [-epsilon, 2.0]", () => {
      const queryEmbedding = new Float32Array(768).fill(0.5);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result.length).toBeGreaterThan(0);

      // vec_distance_cosine returns values in [0, 2] (1 - cos_sim).
      // Allow tiny negative float epsilon from sqlite-vec arithmetic.
      result.forEach(chunk => {
        expect(chunk.distance).toBeGreaterThanOrEqual(-1e-9);
        expect(chunk.distance).toBeLessThanOrEqual(2.0);
      });
    });

    it("TC-RANGE-02: chunkId (rowid) is positive integer as string", () => {
      const queryEmbedding = new Float32Array(768).fill(0.5);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result.length).toBeGreaterThan(0);

      result.forEach(chunk => {
        expect(typeof chunk.chunkId).toBe("string");
        const rowidInt = parseInt(chunk.chunkId, 10);
        expect(rowidInt).toBeGreaterThanOrEqual(1);
        expect(rowidInt).toBeLessThanOrEqual(2 ** 63 - 1);
      });
    });

    it("TC-RANGE-03: result count within [0, topK]", () => {
      const queryEmbedding = new Float32Array(768).fill(0.5);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 3, db);

      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe("RetrievedChunk shape validation", () => {
    beforeEach(() => {
      const embedding = new Float32Array(768).fill(0.3);
      const metadata = JSON.stringify({
        source: "imsbc",
        section: "Chapter 1",
        title: "Test Document"
      });

      db.prepare(
        "INSERT INTO imsbc_vec (embedding, content, metadata) VALUES (?, ?, ?)"
      ).run(
        JSON.stringify(Array.from(embedding)),
        "Test chunk content",
        metadata
      );
    });

    it("TC-SHAPE-01: returned objects conform to RetrievedChunk interface", () => {
      const queryEmbedding = new Float32Array(768).fill(0.3);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result).toHaveLength(1);

      const chunk = result[0];
      expect(chunk).toHaveProperty("content");
      expect(chunk).toHaveProperty("metadata");
      expect(chunk).toHaveProperty("distance");
      expect(chunk).toHaveProperty("chunkId");

      expect(typeof chunk.content).toBe("string");
      expect(typeof chunk.metadata).toBe("object");
      expect(typeof chunk.distance).toBe("number");
      expect(typeof chunk.chunkId).toBe("string");
    });

    it("TC-SHAPE-02: chunkId is string representation of rowid", () => {
      const queryEmbedding = new Float32Array(768).fill(0.3);

      const result = searchVec0(queryEmbedding, "imsbc_vec", 5, db);

      expect(result).toHaveLength(1);

      const chunk = result[0];
      expect(typeof chunk.chunkId).toBe("string");
      expect(parseInt(chunk.chunkId, 10)).toBeGreaterThan(0);
    });
  });
});
