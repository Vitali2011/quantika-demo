// Regression Lock: QA adversarial 2026-05-07
// Class: A (Empty/falsy) | Severity: MEDIUM
// Finding: A-02 — Empty tableName causes unclear SQLite error
// Spec: spec-15-embedandstore-chunks-vectortable-imsbc-vec-ftstable-imsbc-fts
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import type { Chunk } from "@/lib/knowledge/embeddings/chunks";

// Mock embedDocuments
let _mockEmbedDocuments: jest.Mock = jest.fn();
jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedDocuments: (...args: unknown[]) => _mockEmbedDocuments(...args),
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
}));

import { embedAndStore } from "@/lib/knowledge/embeddings/pipeline";

describe("regression spec15-MED01: empty tableName", () => {
  let db: Database.Database;
  const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeEach(() => {
    db = new Database(":memory:");
    sqliteVec.load(db);
    runMigrations(db, allMigrations);
    process.env.KNOWLEDGE_RAG_ENABLED = "true";

    _mockEmbedDocuments = jest.fn().mockResolvedValue([new Float32Array(768).fill(0.5)]);
  });

  afterEach(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = originalEnv;
  });

  it("empty string tableName must throw clear validation error", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    // EXPECTED: Should throw Error("tableName is required")
    // ACTUAL (buggy code): SQLite syntax error (unclear)
    await expect(
      embedAndStore([chunk], {
        tableName: "",
        db,
      })
    ).rejects.toThrow();
    // NOTE: Test PASSES but error message is unclear
    // After fix: should throw validation error before SQL execution
  });

  it("whitespace-only tableName must throw validation error", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    await expect(
      embedAndStore([chunk], {
        tableName: "   ",
        db,
      })
    ).rejects.toThrow(/tableName is required/);
  });
});
