# findings.md — Phase 3 Adversarial QA

# PR #99: claude/rag-phase2-20260507

# Date: 2026-05-07

---

## FINDING C1: SQL Injection on read path — BLOCK

**Severity:** CRITICAL / BLOCK
**File:** `lib/knowledge/embeddings/retriever.ts` lines ~324, ~338
**Regression test:** `__tests__/regression/test_retriever_sql_injection.test.ts` — **1 FAIL**

`retrieve()` and `searchVec0()` interpolate `opts.vectorTable` / `opts.ftsTable` directly into SQL
template literals with NO allowlist. `pipeline.ts` (write path, lines 80–96) has the correct pattern:

```ts
const ALLOWED_VEC_TABLES = ['imsbc_vec', 'igc_vec', 'jwc_vec'];
if (!ALLOWED_VEC_TABLES.includes(tableName)) throw new Error(...)
```

The read path has only an empty-string guard — any non-empty payload passes through.

**Confirmed exploit (TC-C1-06 FAILS):**

```
vectorTable = "imsbc_vec UNION SELECT id, secret, NULL, 0.0 FROM sensitive_data"
```

Produces valid SQL (matching column count), SQLite executes it, injected row returned as a
`RetrievedChunk` with `content = "api_key=SECRET_TOKEN_12345"`.

**Note:** Existing tests `spec-08-F1` and `spec15-CRIT01` pass for the wrong reason — multi-statement
SQL is rejected by better-sqlite3 at `prepare()` time, not by an allowlist. They do NOT catch
single-statement UNION injections.

---

## FINDING C2: Citation validator does not exist — BLOCK

**Severity:** CRITICAL / BLOCK
**File:** `lib/knowledge/citations/validator.ts` — MISSING

`lib/knowledge/` directory: alerts.ts, bootstrap.ts, distances/, eca/, embeddings/, flags.ts,
governance.ts, jwc/, sanctions/, sources/, types.ts — **no `citations/` subdirectory exists**.

Full-tree grep for `validateCitations` across `app/` and `lib/`: **zero hits**.

PR #99 claims:

- ✗ `lib/knowledge/citations/validator.ts` was created
- ✗ `validateCitations()` is wired into `app/api/ai/draft-quote/route.ts` after LLM response

Both are false. The feature was never written.

---

## FINDING C3: compare-routes RAG not wired — BLOCK

**Severity:** CRITICAL / BLOCK
**File:** `app/api/voyage/compare-routes/route.ts`

Route only imports `compareRoutes()` from `@/lib/economics/route-decision` and `getPortDa()`.
Grep for `retrieve|jwc_vec|jwc_fts|searchVec|isRagEnabled` across all `app/api/`: **zero hits**.

PR #99 claims `app/api/ai/compare-routes/route.ts` (wrong path) was modified for JWC retrieval.
File is at a different path AND has no RAG wiring. Feature not delivered.

Additional: `lib/prompts/match.ts` is a pure string constant — no `retrieve()` call, no RAG.

---

## FINDING H1: truncate=true / autoTruncate:false contradiction — HIGH

**Severity:** HIGH (data quality)
**Files:** `lib/knowledge/sources/imsbc/adapter.ts:73`, `lib/knowledge/sources/jwc/adapter.ts:68`,
`lib/knowledge/embeddings/client.ts`
**Regression test:** `__tests__/regression/test_adapter_truncation_and_id.test.ts` — 3 GREEN

Both adapters pass `truncate: true` to `embedAndStore()`. BUT `client.ts` line 61 sets
`autoTruncate: { boolValue: false }` in the actual Vertex AI API call. These contradict:

- Today: no truncation occurs anywhere (embeddings and stored text are aligned — H1 tests GREEN)
- Risk: any partial fix that adds client-side truncation will break alignment silently

The `truncate: true` flag is a semantic no-op today, creating false confidence in operators.

---

## FINDING H2: JWC ID collision — HIGH

**Severity:** HIGH (silent data loss)
**File:** `lib/knowledge/sources/jwc/scraper.ts`
**Regression test:** `__tests__/regression/test_adapter_truncation_and_id.test.ts` — **2 FAIL**

Two collision scenarios:

**Scenario A (timing-dependent):** Trailing-slash URLs (`https://example.com/path/`) cause
`extractId()` regex `/\/([^\/]+)$/` to return `null`. Fallback: `jwc-${Date.now()}`.
Two bulletins fetched in the same millisecond → identical ID → last-write-wins.

**Scenario B (deterministic, always reproducible):** Two bulletin pages with the same URL path
segment (e.g. both end in `index.html`) → `extractId()` returns `"index.html"` for both →
same ID regardless of timing.

TC-H2-c and TC-H2-d FAIL: `uniqueIds.size = 1, ids.length = 2`.

---

## FINDING H3: Unicode control char injection — HIGH

**Severity:** HIGH (XSS-adjacent, text integrity)
**File:** `lib/knowledge/sources/imsbc/chunker.ts` lines 47–48
**Regression test:** `__tests__/regression/test_chunker_entity_decode.test.ts` — **7 FAIL**

`htmlToPlainText()` decodes numeric entities via `String.fromCharCode()` with zero validation:

```ts
.replace(/&#(\d+);/g,    (_, dec) => String.fromCharCode(parseInt(dec, 10)))
.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
```

All four attack vectors confirmed live (7 tests FAIL):

| Vector               | Entity                  | Decoded | Effect                         |
| -------------------- | ----------------------- | ------- | ------------------------------ |
| Decimal RTL override | `&#8238;`               | U+202E  | Flips text direction in UI     |
| NUL byte             | `&#0;`                  | U+0000  | Corrupts SQLite C-land strings |
| DEL char             | `&#127;`                | U+007F  | Corrupts downstream consumers  |
| Hex RTL override     | `&#x202E;` / `&#X202E;` | U+202E  | Both hex paths vulnerable      |

Fix: strip Bidi controls (U+202A–202E, U+2066–2069, U+200B, U+FEFF) and C0/C1 chars
(U+0000–001F, U+007F–009F, except `\t`, `\n`, `\r`) after entity decode.
TC-H3-07 (4 tests GREEN) serve as anti-regression anchors for the fix.

---

## MEDIUM findings (documented, no regression tests written)

**M1:** JWC `extractDate()` accepts invalid calendar dates (`2026-13-32`) via pure regex — no
`new Date()` validation. Low exploitation surface but can corrupt `upstreamVersion` metadata.

**M2:** Section/bulletin HTTP failures log `.warn()` but return partial results silently. Consumer
cannot distinguish "got 5 of 50" from "expected 5." No `partialResults` flag.

**M3:** IMSBC empty ToC HTML → throws; JWC empty listing HTML → returns `[]`. Inconsistent
failure modes across scraper families.

**M4:** `topK=0` silently becomes 20 (default) in `retrieve()`. Callers expecting 0 results get 20.

**M5:** `flags.ts` `ftsTableForSource(slug)` has no slug validation — mitigated by pipeline.ts
allowlist but creates implicit dependency.

---

## Coverage gaps (meta — for upstream skill improvement)

- dev-pipeline TDD did not catch the allowlist asymmetry (write path tested, read path not tested
  for UNION injection with matching column count)
- dev-pipeline did not verify feature delivery against PR description (C2, C3 undetected)

---

## Totals (PR #99)

| Severity       | Count          | Tests failing |
| -------------- | -------------- | ------------- |
| CRITICAL/BLOCK | 3 (C1, C2, C3) | 1             |
| HIGH           | 3 (H1, H2, H3) | 9             |
| MEDIUM         | 5              | 0             |
| **Total**      | **11**         | **10**        |

Regression test files written:

- `__tests__/regression/test_retriever_sql_injection.test.ts` — 6 tests, 1 FAIL
- `__tests__/regression/test_adapter_truncation_and_id.test.ts` — 7 tests, 2 FAIL
- `__tests__/regression/test_chunker_entity_decode.test.ts` — 17 tests, 7 FAIL
