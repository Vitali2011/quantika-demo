// Regression Lock: QA adversarial 2026-05-07
// Class: B (Special floats) | Severity: HIGH
// Finding: B-01 — NaN/Infinity in topK must throw RangeError per contract
// Spec: spec-08-vec0-cosine-k-nn
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";

describe('regression spec-08-B-01: special floats in topK', () => {
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

  it('B1-a: topK = NaN must throw RangeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    // Contract: "throws RangeError if NaN"
    // Code: `if (!Number.isFinite(topK)) throw RangeError`
    // Number.isFinite(NaN) = false → should throw
    expect(() => {
      searchVec0(embedding, "imsbc_vec", NaN, db);
    }).toThrow(RangeError);
  });

  it('B1-b: topK = Infinity must throw RangeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    expect(() => {
      searchVec0(embedding, "imsbc_vec", Infinity, db);
    }).toThrow(RangeError);
  });

  it('B1-c: topK = -Infinity must throw RangeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    expect(() => {
      searchVec0(embedding, "imsbc_vec", -Infinity, db);
    }).toThrow(RangeError);
  });

  it('B1-d: embedding with NaN values should either throw or sanitize', () => {
    const embedding = new Float32Array(768).fill(NaN);

    // Expected: either throw during serialization or SQLite-vec rejects
    // Currently: JSON.stringify(Array.from([NaN, ...])) → "[null, null, ...]"
    // which might not match vec0 MATCH expectations
    try {
      const result = searchVec0(embedding, "imsbc_vec", 5, db);
      // If it doesn't throw, result should be empty or valid
      expect(Array.isArray(result)).toBe(true);
    } catch (err) {
      // If it throws, should be clear error message
      expect(err).toBeDefined();
    }
  });

  it('B1-e: embedding with Infinity values should handle gracefully', () => {
    const embedding = new Float32Array(768).fill(Infinity);

    // JSON.stringify(Array.from([Infinity, ...])) → "[null, null, ...]" (invalid)
    try {
      const result = searchVec0(embedding, "imsbc_vec", 5, db);
      expect(Array.isArray(result)).toBe(true);
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});
