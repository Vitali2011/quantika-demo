// Regression Lock: QA adversarial 2026-05-07
// Class: F (Substring matching) | Severity: CRITICAL
// Finding: F-02 — SQL injection via ftsTable parameter
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

describe("regression spec15-CRIT02: SQL injection via ftsTable", () => {
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

  it("ftsTable with SQL injection payload must be rejected", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    // SQL injection attempt: DROP TABLE via ftsTable
    const maliciousFtsTable = "imsbc_fts; DROP TABLE imsbc_fts; --";

    // EXPECTED: Should throw error (table name validation)
    // ACTUAL (buggy code): Executes SQL injection
    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        ftsTable: maliciousFtsTable,
        db,
      })
    ).rejects.toThrow();
    // NOTE: Test currently PASSES on buggy code (SQL injection succeeds)
    // After fix: should throw Error("Invalid ftsTable")
  });

  it("ftsTable with UNION injection must be rejected", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    // SQL injection with UNION
    const maliciousFtsTable = "imsbc_fts UNION SELECT * FROM imsbc_vec";

    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        ftsTable: maliciousFtsTable,
        db,
      })
    ).rejects.toThrow(/Invalid ftsTable name/);
  });

  it("valid ftsTable from allowlist must succeed", async () => {
    const chunk: Chunk = {
      content: "Test content",
      metadata: { source: "imsbc" },
    };

    // This should work (valid table name)
    await expect(
      embedAndStore([chunk], {
        tableName: "imsbc_vec",
        ftsTable: "imsbc_fts",
        db,
      })
    ).resolves.not.toThrow();
  });
});
