// Regression Lock: QA adversarial 2026-05-07
// Class: F (Substring injection) | Severity: CRITICAL
// Finding: F-01 — SQL injection via tableName parameter (no escaping)
// Spec: spec-08-vec0-cosine-k-nn
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";

describe('regression spec-08-F-01: SQL injection via tableName', () => {
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

  it('F1-a: DROP TABLE injection must be rejected or sanitized', () => {
    const embedding = new Float32Array(768).fill(0.1);
    const maliciousTable = "imsbc_vec'; DROP TABLE imsbc_vec; --";

    // Expected: function should throw Error or TypeError (table validation)
    // Currently: SQLite will execute the injection if tableName is not sanitized
    expect(() => {
      searchVec0(embedding, maliciousTable, 5, db);
    }).toThrow();
  });

  it('F1-b: UNION injection must be rejected', () => {
    const embedding = new Float32Array(768).fill(0.1);
    const maliciousTable = "imsbc_vec WHERE 1=1 UNION SELECT 1, 'injected', '{}', 0.0 --";

    expect(() => {
      searchVec0(embedding, maliciousTable, 5, db);
    }).toThrow();
  });

  it('F1-c: multi-statement injection must be rejected', () => {
    const embedding = new Float32Array(768).fill(0.1);
    const maliciousTable = "imsbc_vec; DELETE FROM imsbc_vec; --";

    expect(() => {
      searchVec0(embedding, maliciousTable, 5, db);
    }).toThrow();
  });

  it('F1-d: semicolon in tableName must be rejected', () => {
    const embedding = new Float32Array(768).fill(0.1);
    const maliciousTable = "imsbc_vec; SELECT 1";

    expect(() => {
      searchVec0(embedding, maliciousTable, 5, db);
    }).toThrow();
  });

  it('F1-e: valid tableName with underscore should work', () => {
    const embedding = new Float32Array(768).fill(0.1);
    
    // This should NOT throw (valid table name)
    expect(() => {
      searchVec0(embedding, "imsbc_vec", 5, db);
    }).not.toThrow();
  });
});
