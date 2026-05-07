// Regression Lock: QA adversarial 2026-05-07
// Class: B (Special floats) | Severity: MEDIUM
// Finding: B-01 — NaN in metadata.subsectionIndex becomes null in JSON
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

describe("regression spec15-MED05: NaN in metadata", () => {
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

  it("NaN in metadata.subsectionIndex must be rejected or normalized", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: {
        source: "imsbc",
        subsectionIndex: NaN as any,
      },
    };

    // EXPECTED: Should either throw or normalize NaN to 0
    // ACTUAL (buggy code): JSON.stringify(NaN) → null (silent corruption)
    await embedAndStore([chunk], {
      tableName: "imsbc_vec",
      db,
    });

    // Verify: metadata in DB should NOT have null for subsectionIndex
    const row = db.prepare("SELECT metadata FROM imsbc_vec LIMIT 1").get() as { metadata: string };
    const metadata = JSON.parse(row.metadata);

    // After fix: should be 0 or error
    // Currently: metadata.subsectionIndex === null (data corruption)
    expect(metadata.subsectionIndex).not.toBe(null);
    // NOTE: Test FAILS on current code (NaN → null)
  });

  it("Infinity in metadata must be rejected or normalized", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: {
        source: "imsbc",
        subsectionIndex: Infinity as any,
      },
    };

    await embedAndStore([chunk], {
      tableName: "imsbc_vec",
      db,
    });

    const row = db.prepare("SELECT metadata FROM imsbc_vec LIMIT 1").get() as { metadata: string };
    const metadata = JSON.parse(row.metadata);

    // Currently: metadata.subsectionIndex === null (data corruption)
    expect(metadata.subsectionIndex).not.toBe(null);
    // NOTE: Test FAILS on current code (Infinity → null)
  });
});
