// Regression Lock: QA adversarial 2026-05-07
// Class: 9 (End-to-end property) | Severity: HIGH
// Finding: 9-02 — Distance ordering must be ascending (closest first)
// Spec: spec-08-vec0-cosine-k-nn
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";
import { searchVec0 } from "@/lib/knowledge/embeddings/retriever";

describe('regression spec-08-9-02: distance ordering validation', () => {
  let db: Database.Database;
  const originalEnv = process.env.KNOWLEDGE_RAG_ENABLED;

  beforeEach(() => {
    db = new Database(":memory:");
    sqliteVec.load(db);
    runMigrations(db, allMigrations);
    process.env.KNOWLEDGE_RAG_ENABLED = "true";

    // Create 768-dimensional test vectors
    const vec1 = Array(768).fill(0.1); // Close to query
    const vec2 = Array(768).fill(0.9); // Far from query
    const vec3 = Array(768).fill(0.5); // Medium distance

    // Insert test vectors (rowid auto-assigned)
    const stmt = db.prepare(`
      INSERT INTO imsbc_vec (content, metadata, embedding)
      VALUES (?, ?, ?)
    `);
    
    stmt.run('close match', '{"source":"test","id":"close"}', JSON.stringify(vec1));
    stmt.run('far match', '{"source":"test","id":"far"}', JSON.stringify(vec2));
    stmt.run('medium match', '{"source":"test","id":"medium"}', JSON.stringify(vec3));
  });

  afterEach(() => {
    db.close();
    process.env.KNOWLEDGE_RAG_ENABLED = originalEnv;
  });

  it('9-2-a: results must be sorted by distance ascending', () => {
    // Query embedding similar to "close match"
    const queryEmbedding = new Float32Array(768).fill(0.1);

    const results = searchVec0(queryEmbedding, "imsbc_vec", 10, db);

    // Verify results are non-empty
    expect(results.length).toBeGreaterThan(0);

    // Verify distance ordering: distance[i] <= distance[i+1]
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].distance).toBeLessThanOrEqual(results[i + 1].distance);
    }

    // Verify first result is "close match" (closest to query)
    expect(results[0].content).toBe('close match');
  });

  it('9-2-b: distance values must be in valid range [0.0, 2.0]', () => {
    const queryEmbedding = new Float32Array(768).fill(0.5);

    const results = searchVec0(queryEmbedding, "imsbc_vec", 10, db);

    // Cosine distance range: [0, 2] (0 = identical, 1 = orthogonal, 2 = opposite)
    // Allow small floating-point epsilon for near-zero distances
    const EPSILON = 1e-5;
    results.forEach(result => {
      expect(result.distance).toBeGreaterThanOrEqual(-EPSILON);
      expect(result.distance).toBeLessThanOrEqual(2.0 + EPSILON);
    });
  });

  it('9-2-c: chunkId must match rowid as string', () => {
    const queryEmbedding = new Float32Array(768).fill(0.1);

    const results = searchVec0(queryEmbedding, "imsbc_vec", 10, db);

    // Verify chunkId is string representation of rowid
    results.forEach(result => {
      expect(typeof result.chunkId).toBe('string');
      expect(result.chunkId).toMatch(/^\d+$/); // numeric string
    });
  });

  it('9-2-d: metadata must be parsed correctly', () => {
    const queryEmbedding = new Float32Array(768).fill(0.1);

    const results = searchVec0(queryEmbedding, "imsbc_vec", 10, db);

    results.forEach(result => {
      expect(result.metadata).toBeDefined();
      expect(typeof result.metadata).toBe('object');
      // Should have "source" field from test data
      expect(result.metadata).toHaveProperty('source');
    });
  });
});
