// Regression Lock: QA adversarial 2026-05-07
// Class: F (Substring matching) | Severity: CRITICAL
// Finding: F-01 — SQL injection via tableName parameter
// Spec: spec-15-embedandstore-chunks-vectortable-imsbc-vec-ftstable-imsbc-fts
// DO NOT DELETE — see references/regression_lock_workflow.md
//
// U5 / #679 — HONEST REWRITE.
// The prior version's first case used a bare `.rejects.toThrow()`. That passes
// on BOTH buggy and fixed code: the malicious name crashes `db.prepare()` with a
// SQLite syntax error, which satisfies `.toThrow()` even when the allowlist guard
// is absent. The allowlist guard in pipeline.ts (ALLOWED_VEC_TABLES.includes) is
// the only thing standing between a user-controlled tableName and raw
// `INSERT INTO ${tableName}` SQL. The mutation-honest contract below asserts the
// guard SPECIFICALLY:
//   (a) the thrown error is the allowlist message, not a SQLite parse error;
//   (b) the guard fires BEFORE any SQL is prepared/run (db.prepare is never
//       called and the target table is never mutated);
//   (c) a plausible, well-formed but non-allowlisted name ("user_data") — which
//       would NOT crash SQLite's parser — is still rejected. This case is the
//       true regression sentinel: remove the allowlist and (c) goes RED while a
//       bare crash-based assertion would stay green.

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import type { Chunk } from "@/lib/knowledge/embeddings/chunks";

// Mock ONLY the embedding API boundary (network). The SUT — the allowlist guard
// and the SQL prepare/run path — runs for real against an in-memory SQLite DB.
let _mockEmbedDocuments: jest.Mock = jest.fn();
jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedDocuments: (...args: unknown[]) => _mockEmbedDocuments(...args),
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
}));

import { embedAndStore } from "@/lib/knowledge/embeddings/pipeline";

describe("regression spec15-CRIT01: SQL injection via tableName (allowlist guard)", () => {
  let db: Database.Database;
  const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;
  const chunk: Chunk = { content: "Test content", metadata: { source: "imsbc" } };

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

  it("rejects a classic ;DROP TABLE payload with the ALLOWLIST error (not a SQLite crash)", async () => {
    const malicious = "imsbc_vec; DROP TABLE imsbc_vec; --";
    await expect(
      embedAndStore([chunk], { tableName: malicious, db })
    ).rejects.toThrow(/Invalid table name/);
  });

  it("rejects a plausible non-allowlisted table name (user_data) — the true guard sentinel", async () => {
    // "user_data" is a valid SQL identifier: it would NOT crash db.prepare().
    // The ONLY thing that rejects it is the allowlist. Remove the allowlist and
    // this assertion flips from 'Invalid table name' to a write into user_data.
    await expect(
      embedAndStore([chunk], { tableName: "user_data", db })
    ).rejects.toThrow(/Invalid table name: user_data/);
  });

  it("fires the guard BEFORE touching the DB — db.prepare is never called", async () => {
    const prepareSpy = jest.spyOn(db, "prepare");
    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec; DROP TABLE imsbc_vec; --", db })
    ).rejects.toThrow(/Invalid table name/);
    expect(prepareSpy).not.toHaveBeenCalled();
    prepareSpy.mockRestore();
  });

  it("leaves the real target table intact after a DROP-TABLE injection attempt", async () => {
    // Pre-existence: migrations created imsbc_vec.
    const before = db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'imsbc_vec'")
      .get();
    expect(before).toBeTruthy();

    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec; DROP TABLE imsbc_vec; --", db })
    ).rejects.toThrow(/Invalid table name/);

    // The guard threw before any SQL ran — the table must still exist and be empty.
    const after = db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'imsbc_vec'")
      .get();
    expect(after).toBeTruthy();
    const rows = db.prepare("SELECT COUNT(*) AS n FROM imsbc_vec").get() as { n: number };
    expect(rows.n).toBe(0);
    expect(_mockEmbedDocuments).not.toHaveBeenCalled();
  });

  it("rejects an empty / whitespace-only table name (MED01) with a guard error", async () => {
    await expect(
      embedAndStore([chunk], { tableName: "   ", db })
    ).rejects.toThrow(/tableName is required/);
  });

  it("accepts an allowlisted vec table (imsbc_vec) without throwing", async () => {
    await expect(
      embedAndStore([chunk], { tableName: "imsbc_vec", db })
    ).resolves.not.toThrow();
  });
});
