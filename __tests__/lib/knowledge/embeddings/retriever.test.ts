/**
 * Tests for hybrid retriever sort-and-return step (spec-10)
 *
 * Focuses on:
 * - topN boundary validation
 * - Sort order (score descending, rowid tie-breaking)
 * - RetrievedChunk shape conformance
 * - Range assertions for RRF scores
 */

import { describe, it, expect } from "@jest/globals";
import type { RetrievedChunk, ChunkMetadata } from "@/lib/knowledge/embeddings/chunks";

// We need to test sortAndReturn directly. For now, we'll create a test helper
// that mimics the expected behavior since the function is not exported yet.
type RRFEntry = {
  rowid: string;
  content: string;
  metadata: ChunkMetadata;
  score: number;
};

// Helper to create test RRF entry
function createEntry(
  rowid: string,
  content: string,
  score: number
): RRFEntry {
  return {
    rowid,
    content,
    metadata: { source: "test" },
    score,
  };
}

// Mock sortAndReturn to test - this will be replaced with actual import
// For RED phase, we import the stub which returns []
const { sortAndReturn } = require("@/lib/knowledge/embeddings/retriever-test-helper") as {
  sortAndReturn: (map: Map<string, RRFEntry>, topN: number | undefined) => RetrievedChunk[];
};

describe("retriever sortAndReturn (spec-10)", () => {
  describe("topN boundary validation", () => {
    it("TC-NBI-01: topN=0 returns empty array", () => {
      // RED: This test will fail until sortAndReturn is implemented
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "test doc", 0.02)],
      ]);

      const result = sortAndReturn(rrfMap, 0);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("TC-NBI-02: topN=NaN falls back to default 5", () => {
      // RED: Will fail until implementation
      const rrfMap = new Map<string, RRFEntry>();
      for (let i = 1; i <= 10; i++) {
        rrfMap.set(String(i), createEntry(String(i), `doc ${i}`, 0.03 - i * 0.001));
      }

      const result = sortAndReturn(rrfMap, NaN);

      // Should return 5 results (default)
      expect(result).toHaveLength(5);
    });

    it("TC-NBI-02b: topN=undefined falls back to default 5", () => {
      // RED: undefined should also use default
      const rrfMap = new Map<string, RRFEntry>();
      for (let i = 1; i <= 10; i++) {
        rrfMap.set(String(i), createEntry(String(i), `doc ${i}`, 0.03 - i * 0.001));
      }

      const result = sortAndReturn(rrfMap, undefined);

      expect(result).toHaveLength(5);
    });

    it("TC-NBI-03: topN=-1 returns empty array", () => {
      // RED: Negative topN should return []
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "test doc", 0.02)],
      ]);

      const result = sortAndReturn(rrfMap, -1);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("TC-NBI-04: topN > candidates returns all candidates", () => {
      // RED: When topN exceeds candidate count, return all (no padding)
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "doc1", 0.02)],
        ["2", createEntry("2", "doc2", 0.01)],
      ]);

      const result = sortAndReturn(rrfMap, 100);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.content && r.chunkId)).toBe(true);
    });

    it("TC-NBI-05: empty RRF map returns empty array", () => {
      // RED: Empty input should return []
      const rrfMap = new Map<string, RRFEntry>();

      const result = sortAndReturn(rrfMap, 5);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("TC-NBI-06: NaN scores are filtered out", () => {
      // RED: Entries with NaN scores should be filtered before sorting
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "valid doc", 0.02)],
        ["2", createEntry("2", "nan doc", NaN)],
        ["3", createEntry("3", "another valid", 0.01)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      // Should return 2 results (NaN entry filtered out)
      expect(result).toHaveLength(2);
      expect(result.every((r) => Number.isFinite(r.distance))).toBe(true);
    });
  });

  describe("sort order and tie-breaking", () => {
    it("results are sorted by score descending (highest first)", () => {
      // RED: First result should have highest RRF score
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "low score", 0.01)],
        ["2", createEntry("2", "high score", 0.03)],
        ["3", createEntry("3", "mid score", 0.02)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      // Expected order: 2 (0.03), 3 (0.02), 1 (0.01)
      expect(result).toHaveLength(3);
      expect(result[0].chunkId).toBe("2");
      expect(result[0].distance).toBeGreaterThanOrEqual(0.03);
      expect(result[0].distance).toBeLessThanOrEqual(0.0333); // Max RRF score from spec
      expect(result[1].chunkId).toBe("3");
      expect(result[2].chunkId).toBe("1");
    });

    it("tie-breaking: equal scores ordered by rowid ascending", () => {
      // RED: Deterministic ordering for equal scores
      const rrfMap = new Map<string, RRFEntry>([
        ["3", createEntry("3", "doc3", 0.02)],
        ["1", createEntry("1", "doc1", 0.02)],
        ["2", createEntry("2", "doc2", 0.02)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      // Expected order: 1, 2, 3 (same score, sorted by rowid asc)
      expect(result).toHaveLength(3);
      expect(result[0].chunkId).toBe("1");
      expect(result[1].chunkId).toBe("2");
      expect(result[2].chunkId).toBe("3");
    });
  });

  describe("topN enforcement", () => {
    it("topN=3 returns exactly 3 results from >=3 candidates", () => {
      // RED: Should limit to topN even when more candidates exist
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "doc1", 0.05)],
        ["2", createEntry("2", "doc2", 0.04)],
        ["3", createEntry("3", "doc3", 0.03)],
        ["4", createEntry("4", "doc4", 0.02)],
        ["5", createEntry("5", "doc5", 0.01)],
      ]);

      const result = sortAndReturn(rrfMap, 3);

      expect(result).toHaveLength(3);
      // Should be top 3 by score
      expect(result[0].chunkId).toBe("1");
      expect(result[1].chunkId).toBe("2");
      expect(result[2].chunkId).toBe("3");
    });

    it("topN=3 returns 2 results when only 2 candidates exist", () => {
      // RED: No padding when candidates < topN
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "doc1", 0.02)],
        ["2", createEntry("2", "doc2", 0.01)],
      ]);

      const result = sortAndReturn(rrfMap, 3);

      // Expected result count: 2 (no padding)
      expect(result).toHaveLength(2);
    });
  });

  describe("RetrievedChunk shape validation", () => {
    it("returned objects conform to RetrievedChunk interface", () => {
      // RED: Each result must have content, metadata, distance, chunkId
      const rrfMap = new Map<string, RRFEntry>([
        ["42", createEntry("42", "test content", 0.025)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      expect(result).toHaveLength(1);
      const chunk = result[0];
      expect(chunk).toHaveProperty("content");
      expect(chunk).toHaveProperty("metadata");
      expect(chunk).toHaveProperty("distance");
      expect(chunk).toHaveProperty("chunkId");
      expect(typeof chunk.chunkId).toBe("string");
      expect(chunk.content).toBe("test content");
      expect(chunk.chunkId).toBe("42");
    });

    it("distance field contains RRF score (not cosine distance)", () => {
      // RED: distance should be the RRF score value
      const rrfScore = 0.0163;
      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "doc", rrfScore)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      expect(result).toHaveLength(1);
      expect(result[0].distance).toBe(rrfScore);
      expect(result[0].distance).toBeGreaterThanOrEqual(0.0003); // Min RRF score from spec
      expect(result[0].distance).toBeLessThanOrEqual(0.0333); // Max RRF score from spec
    });

    it("chunkId is string representation of rowid", () => {
      // RED: chunkId should be String(rowid)
      const rowid = "12345";
      const rrfMap = new Map<string, RRFEntry>([
        [rowid, createEntry(rowid, "doc", 0.02)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      expect(result).toHaveLength(1);
      expect(result[0].chunkId).toBe("12345");
      expect(typeof result[0].chunkId).toBe("string");
    });
  });

  describe("range assertions", () => {
    it("RRF scores fall within expected range", () => {
      // Magnitude assertion: 0.0003 to 0.0333
      const minScore = 0.0003;
      const maxScore = 0.0333;

      const rrfMap = new Map<string, RRFEntry>([
        ["1", createEntry("1", "min", minScore)],
        ["2", createEntry("2", "max", maxScore)],
        ["3", createEntry("3", "mid", 0.0163)],
      ]);

      const result = sortAndReturn(rrfMap, 5);

      expect(result).toHaveLength(3);
      result.forEach((chunk) => {
        expect(chunk.distance).toBeGreaterThanOrEqual(0.0003);
        expect(chunk.distance).toBeLessThanOrEqual(0.0333);
      });
    });

    it("result count within expected range", () => {
      // Result count: 0 to 50
      const rrfMap = new Map<string, RRFEntry>();
      for (let i = 1; i <= 50; i++) {
        rrfMap.set(String(i), createEntry(String(i), `doc${i}`, 0.03 - i * 0.0005));
      }

      const result = sortAndReturn(rrfMap, 50);

      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).toHaveLength(50);
    });
  });
});
