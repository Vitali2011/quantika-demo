// Regression Lock: QA adversarial 2026-05-07
// Class: D (Out-of-range magnitude) | Severity: CRITICAL
// Finding: D-01 — Unbounded topK allows DoS via memory exhaustion
// Spec: spec-08-vec0-cosine-k-nn
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";

describe('regression spec-08-D-01: unbounded topK DoS protection', () => {
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

  it('D1-a: topK = 1 billion should throw RangeError or clamp', () => {
    const embedding = new Float32Array(768).fill(0.1);

    // Expected: throw RangeError("topK exceeds maximum") or clamp to reasonable limit
    // Currently: no upper bound → SQLite will attempt to allocate 1B rows
    expect(() => {
      searchVec0(embedding, "imsbc_vec", 1_000_000_000, db);
    }).toThrow(RangeError);
  });

  it('D1-b: topK = MAX_SAFE_INTEGER should throw RangeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    expect(() => {
      searchVec0(embedding, "imsbc_vec", Number.MAX_SAFE_INTEGER, db);
    }).toThrow(RangeError);
  });

  it('D1-c: topK = 100000 (100k) should either work or throw with clear message', () => {
    const embedding = new Float32Array(768).fill(0.1);

    // 100k is plausible but extreme — should either:
    // 1. Work if DB has rows (no artificial limit)
    // 2. Throw with "exceeds maximum topK limit of X"
    
    // If no limit exists, this will attempt to return 100k rows (DoS risk)
    try {
      const result = searchVec0(embedding, "imsbc_vec", 100_000, db);
      // If it succeeds, result should be valid but empty (no rows inserted)
      expect(Array.isArray(result)).toBe(true);
    } catch (err) {
      // If it throws, must be RangeError with clear message
      expect(err).toBeInstanceOf(RangeError);
      expect((err as Error).message).toMatch(/topK|limit|maximum/i);
    }
  });

  it('D1-d: reasonable topK values should work (1, 10, 100, 1000)', () => {
    const embedding = new Float32Array(768).fill(0.1);

    [1, 10, 100, 1000].forEach(topK => {
      expect(() => {
        searchVec0(embedding, "imsbc_vec", topK, db);
      }).not.toThrow();
    });
  });
});
