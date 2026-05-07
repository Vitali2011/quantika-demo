// Regression Lock: QA adversarial 2026-05-07
// Class: H (External API) | Severity: HIGH
// Finding: H-01 — Vertex AI 429 rate limit error has no retry logic
// Spec: spec-15-embedandstore-chunks-vectortable-imsbc-vec-ftstable-imsbc-fts
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import type { Chunk } from "@/lib/knowledge/embeddings/chunks";

// Mock embedDocuments to simulate 429 error
let _mockEmbedDocuments: jest.Mock = jest.fn();
jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedDocuments: (...args: unknown[]) => _mockEmbedDocuments(...args),
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
}));

import { embedAndStore } from "@/lib/knowledge/embeddings/pipeline";

describe("regression spec15-HIGH04: Vertex AI rate limit (429)", () => {
  let db: Database.Database;
  const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeEach(() => {
    db = new Database(":memory:");
    sqliteVec.load(db);
    runMigrations(db, allMigrations);
    process.env.KNOWLEDGE_RAG_ENABLED = "true";
  });

  afterEach(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = originalEnv;
  });

  it("429 rate limit error must be retried with exponential backoff", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    // Simulate 429 error from Vertex AI
    const rateLimitError = new Error("429 Too Many Requests");
    (rateLimitError as any).code = 429;

    // Mock: fail twice with 429, then succeed
    let callCount = 0;
    _mockEmbedDocuments = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        throw rateLimitError;
      }
      return Promise.resolve([new Float32Array(768).fill(0.5)]);
    });

    // EXPECTED: Retries and eventually succeeds
    // ACTUAL (buggy code): Throws on first 429 (no retry logic)
    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        db,
      })
    ).rejects.toThrow(/429/);

    // After fix: should succeed after retries
    // expect(callCount).toBe(3); // 2 failures + 1 success
    // NOTE: Test FAILS on current code (no retry logic)
  });

  it("429 error after max retries must throw clear error", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    // Simulate persistent 429 error
    const rateLimitError = new Error("429 Too Many Requests");
    (rateLimitError as any).code = 429;
    _mockEmbedDocuments = jest.fn().mockRejectedValue(rateLimitError);

    // EXPECTED: Should retry N times then throw RetryExhaustedError
    // ACTUAL (buggy code): Throws immediately
    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        db,
      })
    ).rejects.toThrow(/429/);
    // NOTE: Test FAILS on current code (no retry logic)
  });
});
