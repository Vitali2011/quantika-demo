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

  // U5 / #679 — HONEST REWRITE of the bare `.rejects.toThrow()` case.
  // The previous assertion passed on buggy code: the malicious ftsTable crashed
  // db.prepare with a SQLite syntax error, satisfying `.toThrow()` even with the
  // allowlist guard removed. We now assert the ALLOWLIST message specifically,
  // add a plausible non-allowlisted sentinel ("user_fts"), and verify the guard
  // fires before any FTS SQL is prepared.
  it("rejects a ;DROP TABLE ftsTable payload with the ALLOWLIST error (not a SQLite crash)", async () => {
    const chunk: Chunk = { content: "Test content", metadata: { source: "imsbc" } };
    const maliciousFtsTable = "imsbc_fts; DROP TABLE imsbc_fts; --";
    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec", ftsTable: maliciousFtsTable, db })
    ).rejects.toThrow(/Invalid ftsTable name/);
  });

  it("rejects a plausible non-allowlisted ftsTable (user_fts) — the true guard sentinel", async () => {
    // "user_fts" is a valid SQL identifier — it would NOT crash db.prepare(). The
    // allowlist is the only thing rejecting it. Remove the allowlist and the SUT
    // would attempt INSERT INTO user_fts instead of throwing.
    const chunk: Chunk = { content: "Test content", metadata: { source: "imsbc" } };
    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec", ftsTable: "user_fts", db })
    ).rejects.toThrow(/Invalid ftsTable name: user_fts/);
  });

  it("fires the ftsTable guard BEFORE preparing any FTS insert — db.prepare never runs", async () => {
    const chunk: Chunk = { content: "Test content", metadata: { source: "imsbc" } };
    const prepareSpy = jest.spyOn(db, "prepare");
    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec", ftsTable: "imsbc_fts; DROP TABLE imsbc_fts; --", db })
    ).rejects.toThrow(/Invalid ftsTable name/);
    expect(prepareSpy).not.toHaveBeenCalled();
    prepareSpy.mockRestore();
  });

  it("rejects an empty / whitespace-only ftsTable with a guard error", async () => {
    const chunk: Chunk = { content: "Test content", metadata: { source: "imsbc" } };
    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec", ftsTable: "   ", db })
    ).rejects.toThrow(/ftsTable must be a non-empty string/);
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
