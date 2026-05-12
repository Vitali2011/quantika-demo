# Attack Plan — Adversarial QA

## Spec: spec-15-embedandstore-chunks-vectortable-imsbc-vec-ftstable-imsbc-fts

### Target: `embedAndStore(chunks, opts)` — lib/knowledge/embeddings/pipeline.ts:43

**CRITICAL CONTEXT:** This PR adds ONLY tests. All implementation code already exists on base branch `claude/rag-phase2-20260507`.

The attack plan focuses on finding **PRE-EXISTING bugs** that the new tests FAIL to catch.

---

## Class A: Empty / falsy inputs

| ID  | Attack                                          | Expected behavior                               | Severity | Test exists?  | Line ref        |
| --- | ----------------------------------------------- | ----------------------------------------------- | -------- | ------------- | --------------- |
| A1  | `chunks = []`                                   | No-op, no API call, no INSERT                   | LOW      | ✓ (TC-NBI-01) | pipeline.ts:50  |
| A2  | `opts.tableName = ""`                           | SQLite error (invalid table)                    | MEDIUM   | **MISSING**   | pipeline.ts:91  |
| A3  | `opts.ftsTable = ""`                            | SQLite error (invalid table)                    | MEDIUM   | **MISSING**   | pipeline.ts:96  |
| A4  | `opts.db = null`                                | TypeError on `db.prepare()`                     | HIGH     | **MISSING**   | pipeline.ts:79  |
| A5  | `chunk.content = ""`                            | Empty string embedded (valid, costs API quota)  | MEDIUM   | **MISSING**   | pipeline.ts:84  |
| A6  | `chunk.metadata = null`                         | `JSON.stringify(null)` → `"null"` string stored | MEDIUM   | **MISSING**   | pipeline.ts:106 |
| A7  | `process.env.KNOWLEDGE_RAG_ENABLED = undefined` | Proceeds anyway (no guard in pipeline)          | LOW      | N/A           | N/A             |

**Risk:** A4 (null db) could crash prod if `getDb()` fails silently. A5/A6 waste API quota on invalid data.

---

## Class B: Special floats

| ID  | Attack                                      | Expected behavior                                              | Severity | Test exists? | Line ref        |
| --- | ------------------------------------------- | -------------------------------------------------------------- | -------- | ------------ | --------------- |
| B1  | `chunk.metadata.subsectionIndex = NaN`      | `JSON.stringify({..., subsectionIndex: NaN})` → `null` in JSON | MEDIUM   | **MISSING**  | pipeline.ts:106 |
| B2  | `chunk.metadata.subsectionIndex = Infinity` | `JSON.stringify` → `null` in JSON                              | MEDIUM   | **MISSING**  | pipeline.ts:106 |
| B3  | `MAX_BATCH_SIZE = NaN` (internal)           | Infinite loop in `for`                                         | HIGH     | N/A (const)  | pipeline.ts:24  |
| B4  | `MAX_CHUNK_LENGTH = NaN` (internal)         | `chunk.content.length > NaN` = false → no truncate check       | HIGH     | N/A (const)  | pipeline.ts:25  |

**Risk:** B1/B2 cause silent data corruption (NaN → null in DB). B3/B4 are hardcoded, but if ever config-driven, CRITICAL.

---

## Class C: Negative in positive domain

| ID  | Attack                                | Expected behavior                                  | Severity | Test exists? | Line ref        |
| --- | ------------------------------------- | -------------------------------------------------- | -------- | ------------ | --------------- |
| C1  | `chunk.metadata.subsectionIndex = -1` | Stored as `-1` (semantically invalid but no guard) | LOW      | **MISSING**  | pipeline.ts:106 |
| C2  | `MAX_BATCH_SIZE = -1` (internal)      | `for` loop never executes (deadlock)               | CRITICAL | N/A (const)  | pipeline.ts:82  |
| C3  | `MAX_CHUNK_LENGTH = -1` (internal)    | All chunks rejected (DoS)                          | HIGH     | N/A (const)  | pipeline.ts:57  |

**Risk:** C2/C3 are hardcoded, but if ever exposed as config, instant DoS.

---

## Class D: Out-of-range ratio/percent

| ID  | Attack                                        | Expected behavior                     | Severity | Test exists? | Line ref       |
| --- | --------------------------------------------- | ------------------------------------- | -------- | ------------ | -------------- |
| D1  | `MAX_BATCH_SIZE = 0` (internal)               | Infinite loop (never advances)        | CRITICAL | N/A (const)  | pipeline.ts:82 |
| D2  | `MAX_BATCH_SIZE = 251` (over Vertex limit)    | Vertex API error 400                  | HIGH     | **MISSING**  | pipeline.ts:24 |
| D3  | `MAX_CHUNK_LENGTH = 2049` (over Vertex limit) | Vertex truncates silently (data loss) | MEDIUM   | **MISSING**  | pipeline.ts:25 |

**Risk:** D1 is deadlock. D2/D3 cause API failures or silent data loss if constants ever changed.

---

## Class E: Non-exhaustive switch/union

| ID  | Attack                                                      | Expected behavior                                | Severity | Test exists?             | Line ref        |
| --- | ----------------------------------------------------------- | ------------------------------------------------ | -------- | ------------------------ | --------------- |
| E1  | `chunk.metadata` missing `source` field                     | Stored as-is (downstream RAG might fail)         | MEDIUM   | **MISSING**              | pipeline.ts:106 |
| E2  | `tableName = "nonexistent_table"`                           | SQLite error `no such table`                     | MEDIUM   | ✓ (implied by TC-INT-01) | pipeline.ts:91  |
| E3  | `ftsTable = "nonexistent_table"`                            | SQLite error `no such table`                     | MEDIUM   | **MISSING**              | pipeline.ts:96  |
| E4  | `embedding` from API is wrong dimension (e.g., 512 not 768) | Vec0 INSERT succeeds (vec0 auto-pads/truncates?) | HIGH     | **MISSING**              | pipeline.ts:104 |

**Risk:** E4 is critical — wrong-dimension vectors silently corrupt similarity search.

---

## Class F: Substring vs whole-word matching

| ID  | Attack                                              | Expected behavior                           | Severity | Test exists?      | Line ref        |
| --- | --------------------------------------------------- | ------------------------------------------- | -------- | ----------------- | --------------- |
| F1  | `tableName = "imsbc_vec; DROP TABLE imsbc_vec; --"` | SQL injection (template literal vulnerable) | CRITICAL | **MISSING**       | pipeline.ts:91  |
| F2  | `ftsTable = "imsbc_fts; DROP TABLE imsbc_fts; --"`  | SQL injection                               | CRITICAL | **MISSING**       | pipeline.ts:96  |
| F3  | `chunk.content` contains SQL quotes `'`             | Escaped by prepared statement bind          | N/A      | Implicit (SQLite) | pipeline.ts:109 |

**Risk:** F1/F2 are SQL injection. Line 91/96 use template literals `INSERT INTO ${tableName}` — NO prepared statement for table name.

**Actual code inspection:**

```typescript
const stmt = db.prepare(
  `INSERT INTO ${tableName} (content, metadata, embedding) VALUES (@content, @metadata, @embedding)`
);
```

This is **VULNERABLE to SQL injection** if `tableName` is user-controlled.

---

## Class G: Authz / HMAC / Security

| ID  | Attack                                                      | Expected behavior                              | Severity | Test exists? | Line ref        |
| --- | ----------------------------------------------------------- | ---------------------------------------------- | -------- | ------------ | --------------- |
| G1  | Malicious `chunk.metadata` with XSS payload                 | Stored as JSON string (safe unless rendered)   | MEDIUM   | **MISSING**  | pipeline.ts:106 |
| G2  | `GOOGLE_CLOUD_PROJECT` env poisoned                         | Embeddings sent to attacker's GCP project      | CRITICAL | **MISSING**  | client.ts:16    |
| G3  | `GOOGLE_APPLICATION_CREDENTIALS` points to attacker key     | Embeddings stolen via attacker service account | CRITICAL | **MISSING**  | client.ts:22    |
| G4  | Vertex AI API returns malicious embedding (e.g., all zeros) | Stored as-is (no validation)                   | HIGH     | **MISSING**  | pipeline.ts:101 |

**Risk:** G2/G3 are supply-chain attacks. G4 is data poisoning (malicious embeddings).

---

## Class H: External API misuse

| ID  | Attack                                                   | Expected behavior                                | Severity | Test exists?  | Line ref     |
| --- | -------------------------------------------------------- | ------------------------------------------------ | -------- | ------------- | ------------ |
| H1  | Vertex AI API returns 429 (rate limit)                   | Error bubbles to caller (no retry logic)         | HIGH     | **MISSING**   | client.ts:50 |
| H2  | Vertex AI API returns 500 (server error)                 | Error bubbles (no retry logic)                   | HIGH     | **MISSING**   | client.ts:50 |
| H3  | Vertex AI API timeout (slow response)                    | Hangs forever (no timeout in `client.predict()`) | HIGH     | **MISSING**   | client.ts:50 |
| H4  | Vertex AI API returns wrong response schema              | Crash on `pred.structValue.fields.embeddings...` | HIGH     | **MISSING**   | client.ts:68 |
| H5  | Batch of 260 chunks → 2 API calls @ $0.00025/call = cost | Logged nowhere (no cost tracking)                | MEDIUM   | ✓ (TC-NBI-03) | client.ts:47 |

**Risk:** H1-H4 cause prod crashes. No resilience (retries, timeouts, fallback).

---

## Class 7: Config cross-reference

| ID  | Attack                                                          | Expected behavior                            | Severity | Test exists? | Line ref                     |
| --- | --------------------------------------------------------------- | -------------------------------------------- | -------- | ------------ | ---------------------------- |
| 7.1 | `PROJECT_ID` env vs hardcoded default                           | Uses env if set, else `"quantika-demo-2026"` | N/A      | Implicit     | client.ts:16                 |
| 7.2 | `LOCATION` hardcoded to `"us-central1"`                         | No mismatch (no other location config)       | N/A      | Implicit     | client.ts:17                 |
| 7.3 | `DIMENSIONS = 768` vs actual model output                       | Model always returns 768 (Vertex contract)   | N/A      | Implicit     | client.ts:19                 |
| 7.4 | `MAX_BATCH_SIZE = 250` (pipeline) vs `MAX_BATCH = 250` (client) | Identical (correct)                          | N/A      | Implicit     | pipeline.ts:24, client.ts:20 |

**Assessment:** No cross-reference bugs detected. Config values are semantically aligned.

---

## Class 8: Test change review

```bash
git diff claude/rag-phase2-20260507...spec/spec-15-embedandstore-chunks-vectortable-imsbc-vec-ftstable-imsbc-fts -- '__tests__/**/*.test.ts' '**/*.spec.ts' | grep -E '^[-].*expect\(' | wc -l
```

**Result:** 0 (no removed/changed assertions)

**Verdict:** No test rewriting. All tests are new. **PASS** on Class 8.

---

## Class 9: End-to-end property tests

| ID  | Property                                                   | Test coverage                                            | Severity | Test exists? |
| --- | ---------------------------------------------------------- | -------------------------------------------------------- | -------- | ------------ |
| 9.1 | Vec0 INSERT → SELECT roundtrip for embedding               | Tests read `distance`, not raw embedding                 | MEDIUM   | **PARTIAL**  |
| 9.2 | FTS5 MATCH returns ONLY matching rows (no false positives) | Test checks `toContain` but not false negatives          | MEDIUM   | **PARTIAL**  |
| 9.3 | k-NN query returns EXACTLY k results (or fewer if <k rows) | Test checks `results.length > 0`, not exact k            | MEDIUM   | **PARTIAL**  |
| 9.4 | Cosine distance correctness (0 = identical, 2 = opposite)  | Test checks `distance < 0.1` (threshold, not exact math) | MEDIUM   | **PARTIAL**  |
| 9.5 | Unicode content → embedding → SELECT preserves characters  | ✓ (TC-NBI-07)                                            | N/A      | ✓            |

**Critical gap:** No test verifies that vec0 cosine distance formula is CORRECT (not just monotonic).

---

## Summary by severity

| Severity     | Count | Attack IDs                                                                                                                                      |
| ------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRITICAL** | 5     | C2 (negative batch deadlock), D1 (zero batch deadlock), F1/F2 (SQL injection), G2/G3 (GCP hijack)                                               |
| **HIGH**     | 10    | A4 (null db), B3/B4 (NaN constants), C3 (negative length), D2 (batch>250), E4 (wrong dimension), G4 (malicious embedding), H1-H4 (API failures) |
| **MEDIUM**   | 14    | A2, A3, A5, A6, B1, B2, D3, E1, E3, G1, H5, 9.1-9.4                                                                                             |
| **LOW**      | 2     | A1 (covered), A7, C1                                                                                                                            |

**Total attack vectors identified:** 31
**Total tests exist (author):** 15 test cases across 2 files
**Total MISSING tests:** 26

---

## Prioritized RED test plan

### P0 (CRITICAL — SQL injection & supply chain)

1. **spec15-CRIT01-sql-injection-tablename** — `tableName="imsbc_vec; DROP TABLE imsbc_vec; --"`
2. **spec15-CRIT02-sql-injection-ftstable** — `ftsTable="imsbc_fts; DROP TABLE imsbc_fts; --"`
3. **spec15-CRIT03-gcp-project-hijack** — `GOOGLE_CLOUD_PROJECT="attacker-project"`
4. **spec15-CRIT04-gcp-credentials-hijack** — `GOOGLE_APPLICATION_CREDENTIALS="/tmp/attacker.json"`

### P1 (HIGH — crashes & data corruption)

5. **spec15-HIGH01-null-db** — `db: null`
6. **spec15-HIGH02-batch-over-limit** — `MAX_BATCH_SIZE=251` (requires patching const)
7. **spec15-HIGH03-wrong-embedding-dimension** — Mock returns Float32Array(512) not 768
8. **spec15-HIGH04-vertex-rate-limit** — Mock throws 429 error
9. **spec15-HIGH05-vertex-server-error** — Mock throws 500 error
10. **spec15-HIGH06-vertex-timeout** — Mock hangs forever
11. **spec15-HIGH07-vertex-wrong-schema** — Mock returns `{predictions: [{foo: 'bar'}]}`
12. **spec15-HIGH08-malicious-embedding** — Mock returns all-zeros vector

### P2 (MEDIUM — edge cases & metadata corruption)

13. **spec15-MED01-empty-tablename** — `tableName=""`
14. **spec15-MED02-empty-ftstable** — `ftsTable=""`
15. **spec15-MED03-empty-content** — `chunk.content=""`
16. **spec15-MED04-null-metadata** — `chunk.metadata=null`
17. **spec15-MED05-nan-subsectionindex** — `metadata.subsectionIndex=NaN`
18. **spec15-MED06-infinity-subsectionindex** — `metadata.subsectionIndex=Infinity`
19. **spec15-MED07-missing-source** — `metadata` without `source` field
20. **spec15-MED08-nonexistent-ftstable** — `ftsTable="fake_table"`

### P3 (LOW — internal const robustness, not exploitable in current code)

- Skip (constants are hardcoded, not config-driven yet)

---

## Notes for test implementation

- Use **RC6-security-blacklist** directory for F1/F2/G-class (SQL injection, GCP hijack)
- Use **RC1-fail-open** directory for A, E classes (empty input, missing fields)
- Use **RC3-magnitude** directory for B, C, D classes (NaN, negative, out-of-range)
- Use **RC5-no-fallback** directory for H-class (Vertex API failures)
- Each test MUST fail on current code (verify before filing)
- Regression lock: DO NOT DELETE after fix — permanent protection

---

## SQL Injection POC (F1/F2)

**Vulnerable code:**

```typescript
const stmt = db.prepare(
  `INSERT INTO ${tableName} (content, metadata, embedding) VALUES (@content, @metadata, @embedding)`
);
```

**Attack:**

```typescript
await embedAndStore([chunk], {
  tableName: "imsbc_vec; DROP TABLE imsbc_vec; --",
  db,
});
```

**Result:** SQLite executes:

```sql
INSERT INTO imsbc_vec; DROP TABLE imsbc_vec; -- (content, metadata, embedding) VALUES (...)
```

This is a **CRITICAL** vulnerability. Table name MUST be validated against allowlist.

---

## Expected fixes (for reference, not implementation)

### Fix F1/F2 (SQL injection)

```typescript
const ALLOWED_TABLES = ["imsbc_vec", "igc_vec", "jwc_vec", "imsbc_fts", "igc_fts", "jwc_fts"];
if (!ALLOWED_TABLES.includes(tableName)) {
  throw new Error(`Invalid table name: ${tableName}`);
}
if (ftsTable && !ALLOWED_TABLES.includes(ftsTable)) {
  throw new Error(`Invalid ftsTable: ${ftsTable}`);
}
```

### Fix G2/G3 (GCP hijack)

- Validate `GOOGLE_CLOUD_PROJECT` against allowlist in deployment config
- Use Workload Identity (GKE) to prevent credential hijacking

### Fix H1-H4 (API resilience)

- Add retry logic with exponential backoff (max 3 retries)
- Add timeout (e.g., 30s) to `client.predict()` call
- Validate response schema before accessing nested fields

---

## Conclusion

**Verdict SO FAR (before running tests):** This PR adds comprehensive boundary tests, but MISSES critical vulnerabilities:

- **2 CRITICAL SQL injection bugs** (F1/F2)
- **2 CRITICAL supply-chain risks** (G2/G3)
- **6 HIGH resilience gaps** (H1-H4, E4, G4)

**Recommendation:** BLOCK until P0 vulnerabilities are fixed + regression tests added.
