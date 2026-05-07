// Regression Lock: QA adversarial 2026-05-07
// Class: F (Substring injection) | Severity: CRITICAL
// Finding: NO-ALLOWLIST-READ — retrieve() and searchVec0() have NO allowlist on the read
//          path. pipeline.ts (write path) has ALLOWED_VEC_TABLES / ALLOWED_FTS_TABLES.
//          retriever.ts only checks for empty string — any non-empty string, including SQL
//          injection payloads, passes validation and is interpolated directly into SQL.
//
// CONFIRMED EXFILTRATION VECTOR (manually traced, line 337-339 of retriever.ts):
//   vectorTable = "imsbc_vec UNION SELECT id, secret, NULL, 0.0 FROM any_table"
//   → Full SQL:
//     SELECT rowid, content, metadata, vec_distance_cosine(embedding, ?) as distance
//     FROM imsbc_vec UNION SELECT id, secret, NULL, 0.0 FROM any_table
//     ORDER BY distance LIMIT ?
//   → Executes without throw. Row from any_table appears in results.
//   → Case 6 below proves this in isolation (without mocking retrieve() internals).
//
// Test verdict per case:
//   Case 1: PASS (throw received) — but for WRONG reason: better-sqlite3 rejects
//           multi-statement SQL at prepare(). NOT an allowlist rejection. Spurious pass.
//   Case 2: PASS (throw received) — FTS5 TVF column-count mismatch. Spurious pass.
//   Case 3: PASS (throw received) — existing empty-string guard works. Correct.
//   Case 4: PASS (throw received) — same wrong reason as Case 1. Spurious pass.
//   Case 5: PASS (no throw expected, no throw received) — documents cross-corpus behavior.
//   Case 6: FAIL (no throw received) — UNION exfiltration in vectorTable succeeds.
//           This is the authoritative bug-confirmation test.
//
// DO NOT DELETE — see references/regression_lock_workflow.md

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import sqliteVec from "sqlite-vec";
import { runMigrations } from "@/lib/migrations/runner";
import { allMigrations } from "@/lib/migrations/index";

// Mock embedQuery — retrieve() calls the embedding API internally.
// We must mock it BEFORE importing retrieve, because Jest hoists jest.mock().
// The mock returns a stable Float32Array(768) so network I/O never happens.
jest.mock("@/lib/knowledge/embeddings/client", () => ({
  embedQuery: jest.fn().mockResolvedValue(new Float32Array(768).fill(0.1)),
  embedDocuments: jest.fn().mockResolvedValue([new Float32Array(768).fill(0.5)]),
}));

import { retrieve, searchVec0 } from "@/lib/knowledge/embeddings/retriever";

// ---------------------------------------------------------------------------
// Root cause analysis (documented for reviewers)
// ---------------------------------------------------------------------------
//
// retriever.ts — read path:
//
//   retrieve() guards (lines ~283-287):
//     if (!opts.vectorTable || opts.vectorTable.trim().length === 0) → throw TypeError
//     if (!opts.ftsTable   || opts.ftsTable.trim().length === 0)    → throw TypeError
//   NO further validation. Any non-empty string is interpolated into SQL:
//     `SELECT … FROM ${opts.ftsTable}(?) ORDER BY rank LIMIT ?`      (line ~324)
//     `SELECT … FROM ${opts.vectorTable} ORDER BY distance LIMIT ?`  (line ~338)
//
//   searchVec0() guards (lines ~61-63):
//     if (!tableName || tableName.trim().length === 0) → throw TypeError
//   NO further validation. Any non-empty string is interpolated:
//     `SELECT … FROM ${tableName} ORDER BY distance LIMIT ?`         (line ~92)
//
// pipeline.ts — write path (CORRECT pattern, NOT present in retriever):
//   const ALLOWED_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec'];
//   const ALLOWED_FTS_TABLES = ['imsbc_fts', 'igc_fts', 'jwc_fts'];
//   if (!ALLOWED_VEC_TABLES.includes(tableName)) → throw Error('Invalid table name: …')
//   (pipeline.ts lines ~80-96)
//
// Fix required: mirror pipeline.ts allowlist into retrieve() and searchVec0()
//   before any db.prepare() call. Three guard blocks needed:
//   1. retrieve() — vectorTable allowlist check
//   2. retrieve() — ftsTable allowlist check
//   3. searchVec0() — tableName allowlist check
// ---------------------------------------------------------------------------

describe("regression NO-ALLOWLIST-READ: retrieve() and searchVec0() missing allowlist", () => {
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

  // =========================================================================
  // Case 1: retrieve() with multi-statement DROP TABLE in vectorTable
  //
  // Expected: MUST throw Error (allowlist rejection BEFORE touching SQLite)
  // Actual:   SPURIOUS PASS — better-sqlite3 refuses multi-statement prepare()
  //           and throws SqliteError. The throw happens for the WRONG reason.
  //           After fix: throw Error("Invalid table name") from allowlist at ~line 283,
  //           BEFORE db.prepare() is ever called.
  // =========================================================================
  it("Case 1: retrieve() with DROP TABLE in vectorTable MUST throw Error", async () => {
    // Spurious pass today (SQLite rejects multi-statement), correct pass after allowlist fix.
    // To distinguish: after fix, error message should match /Invalid table name/ or similar.
    await expect(
      retrieve("test query", {
        vectorTable: "imsbc_vec; DROP TABLE imsbc_vec; --",
        ftsTable: "imsbc_fts",
        db,
      })
    ).rejects.toThrow();
    // NOTE: Does NOT prove allowlist exists. See Case 6 for authoritative test.
  });

  // =========================================================================
  // Case 2: retrieve() with UNION column-count mismatch in ftsTable
  //
  // Expected: MUST throw Error (allowlist rejection)
  // Actual:   SPURIOUS PASS — FTS5 TVF returns 4 columns (rowid + content +
  //           metadata + rank), but the injected "SELECT 1,2,3--" returns 3
  //           columns. SQLite throws "SELECTs to the left and right of UNION
  //           do not have the same number of result columns". Wrong reason.
  //           A column-count-matched FTS5 injection would NOT throw (untested
  //           here due to FTS5 TVF complexity — see Case 6 on vectorTable path
  //           for the proven exfiltration vector).
  // =========================================================================
  it("Case 2: retrieve() with UNION SELECT in ftsTable MUST throw Error", async () => {
    // Spurious pass today (column count mismatch). Correct pass after allowlist fix.
    await expect(
      retrieve("test query", {
        vectorTable: "imsbc_vec",
        ftsTable: "imsbc_fts UNION SELECT 1,2,3--",
        db,
      })
    ).rejects.toThrow();
    // NOTE: Does NOT prove allowlist exists. See Case 6 for authoritative test.
  });

  // =========================================================================
  // Case 3: retrieve() with empty vectorTable
  //
  // Expected: MUST throw TypeError
  // Actual:   CORRECT PASS — existing empty-string guard at retriever.ts ~line 283.
  //           This is the ONLY legitimate existing validation. Regression anchor.
  // =========================================================================
  it("Case 3: retrieve() with empty vectorTable MUST throw TypeError", async () => {
    // Existing guard. Regression anchor — must never become a silent no-op.
    await expect(
      retrieve("test query", {
        vectorTable: "",
        ftsTable: "imsbc_fts",
        db,
      })
    ).rejects.toThrow(TypeError);
  });

  // =========================================================================
  // Case 4: searchVec0() with multi-statement DROP TABLE in tableName
  //
  // Expected: MUST throw Error (allowlist rejection BEFORE touching SQLite)
  // Actual:   SPURIOUS PASS — same as Case 1: better-sqlite3 rejects multi-
  //           statement SQL. Wrong reason. After fix: throw from allowlist check
  //           before db.prepare() is called.
  // =========================================================================
  it("Case 4: searchVec0() with DROP TABLE in tableName MUST throw Error", () => {
    const embedding = new Float32Array(768).fill(0.1);

    // Spurious pass today (SQLite rejects multi-statement). Correct pass after fix.
    expect(() => {
      searchVec0(embedding, "imsbc_vec; DROP TABLE users; --", 5, db);
    }).toThrow();
    // NOTE: Does NOT prove allowlist exists. See Case 6 for authoritative test.
  });

  // =========================================================================
  // Case 5: retrieve() with cross-corpus table mismatch (data-integrity gap)
  //
  // Scenario: vectorTable from corpus "imsbc" + ftsTable from corpus "jwc".
  //           Both are in the allowlist (once the allowlist exists). No SQLite
  //           error expected. Results silently mix two independent document corpora.
  //
  // Expected behavior: UNDEFINED in current spec. Two interpretations:
  //   a) ALLOW — caller responsibility; retriever is corpus-agnostic.
  //   b) REJECT — enforce corpus-prefix consistency (imsbc_vec + imsbc_fts only).
  //
  // Current behavior: no throw, returns [] (both tables empty in test DB).
  // This is a DATA INTEGRITY gap, not an injection gap.
  //
  // Recommendation (for post-allowlist hardening):
  //   Validate that vectorTable and ftsTable share the same corpus prefix.
  //   Throw Error("vectorTable and ftsTable must share the same corpus prefix").
  // =========================================================================
  it("Case 5 (UNDOCUMENTED behavior): retrieve() cross-corpus mismatch — documents permissive behavior", async () => {
    // Current behavior: no throw, returns empty array (both tables exist but are empty).
    // If corpus-consistency enforcement is added later, update this to rejects.toThrow(/corpus/).
    const result = await retrieve("test query", {
      vectorTable: "imsbc_vec",
      ftsTable: "jwc_fts",
      db,
    });

    // Both tables empty in test DB → both rankers return [] → RRF returns [].
    expect(Array.isArray(result)).toBe(true);
  });

  // =========================================================================
  // Case 6: AUTHORITATIVE BUG PROOF — UNION exfiltration via vectorTable
  //
  // This is the definitive test proving the missing allowlist is an EXPLOITABLE
  // vulnerability, not just a theoretical gap.
  //
  // Attack vector (manually verified against SQLite + sqlite-vec in isolation):
  //   vectorTable = "imsbc_vec UNION SELECT id, data, NULL, 0.0 FROM sensitive_table"
  //   → Full SQL constructed in retriever.ts line 337-339:
  //     SELECT rowid, content, metadata,
  //            vec_distance_cosine(embedding, ?) as distance
  //     FROM imsbc_vec UNION SELECT id, data, NULL, 0.0 FROM sensitive_table
  //     ORDER BY distance LIMIT ?
  //   → Column count: 4 on left (rowid, content, metadata, distance),
  //                   4 on right (id, data, NULL, 0.0) ✓
  //   → bind params: 2 on left (embedding, topK), 0 on right ✓
  //   → Result: row from sensitive_table returned as a RetrievedChunk.
  //             content = sensitive value, metadata = null, distance = 0.0
  //
  // Expected: MUST throw Error (allowlist rejection before db.prepare())
  // Actual:   FAILS — no throw. Exfiltrated data present in returned results.
  //           When this test FAILS → bug confirmed, unfixed.
  //           When this test PASSES (throw received) → allowlist added, bug fixed.
  //
  // The test uses a separate in-memory DB to avoid interfering with the main
  // beforeEach DB. It inserts a "secrets" row and confirms it appears in output.
  // =========================================================================
  it("Case 6 (AUTHORITATIVE): retrieve() UNION exfiltration in vectorTable MUST throw — currently FAILS", async () => {
    // Set up a fresh DB with both the real imsbc_vec table and a "secrets" table
    // that should never be reachable through the retrieval API.
    const isolatedDb = new Database(":memory:");
    sqliteVec.load(isolatedDb);
    runMigrations(isolatedDb, allMigrations);

    // Simulate sensitive data that exists in the same SQLite database.
    // In production, this could be user API keys, session tokens, etc.
    isolatedDb.exec(
      "CREATE TABLE IF NOT EXISTS sensitive_data (id INTEGER, secret TEXT)"
    );
    isolatedDb.exec(
      "INSERT INTO sensitive_data VALUES (1, 'api_key=SECRET_TOKEN_12345')"
    );

    // Crafted vectorTable: UNION with correct column count (4 columns) and
    // correct bind param count (0 extra — the 2 params from the outer query
    // are consumed by the LEFT side of the UNION only).
    const injectedVectorTable =
      "imsbc_vec UNION SELECT id, secret, NULL, 0.0 FROM sensitive_data";

    // EXPECTED after fix: throw Error("Invalid table name: imsbc_vec UNION …")
    // CURRENT (bug): no throw, sensitive_data row appears in results
    let exfiltrationOccurred = false;
    let threwAsExpected = false;

    try {
      const results = await retrieve("test query", {
        vectorTable: injectedVectorTable,
        ftsTable: "imsbc_fts",
        db: isolatedDb,
      });

      // If we reach here, no throw occurred → injection executed.
      // Check if exfiltrated data is present in results.
      const exfiltratedRow = results.find(
        (chunk) => chunk.content === "api_key=SECRET_TOKEN_12345"
      );
      if (exfiltratedRow) {
        exfiltrationOccurred = true;
      }
    } catch (_err) {
      threwAsExpected = true;
    } finally {
      isolatedDb.close();
    }

    // The test expectation is written for the DESIRED (fixed) behavior.
    // Currently this FAILS because threwAsExpected is false and
    // exfiltrationOccurred is true.
    expect(threwAsExpected).toBe(true);
    expect(exfiltrationOccurred).toBe(false);
  });
});
