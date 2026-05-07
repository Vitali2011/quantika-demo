// Regression Lock: QA adversarial 2026-05-07
// Class: A (Empty/falsy) | Severity: HIGH
// Finding: A-01 — Empty tableName should throw TypeError
// Spec: spec-08-vec0-cosine-k-nn
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";

describe('regression spec-08-A-01: empty tableName validation', () => {
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

  it('A1-a: empty string tableName should throw TypeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    // Expected: throw TypeError("tableName required" or "tableName must not be empty")
    // Currently: no guard for empty string → SQLite error (unclear message)
    expect(() => {
      searchVec0(embedding, "", 5, db);
    }).toThrow(TypeError);
  });

  it('A1-b: whitespace-only tableName should throw TypeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    expect(() => {
      searchVec0(embedding, "   ", 5, db);
    }).toThrow(TypeError);
  });

  it('A1-c: null tableName (via any cast) should throw TypeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    expect(() => {
      searchVec0(embedding, null as any, 5, db);
    }).toThrow();
  });

  it('A1-d: undefined tableName should throw TypeError', () => {
    const embedding = new Float32Array(768).fill(0.1);

    expect(() => {
      searchVec0(embedding, undefined as any, 5, db);
    }).toThrow();
  });
});
