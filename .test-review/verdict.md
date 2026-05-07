# Phase 4 — Verdict (PR #99: claude/rag-phase2-20260507)

**Date:** 2026-05-07
**Reviewer:** test-skill (adversarial QA, cold-start)
**Target:** PR #99, branch `claude/rag-phase2-20260507` → `main`

---

## BLOCK

Three independent BLOCK conditions, each sufficient alone:

### 1. SQL injection on read path (C1) — Security bug

`retrieve()` in `lib/knowledge/embeddings/retriever.ts` has no allowlist on `vectorTable` /
`ftsTable`. UNION SELECT injection with matching column count executes silently, returning injected
rows as `RetrievedChunk` objects. Data exfiltration vector confirmed.

Per verdict tree: "Security bug (SQL injection)" → **BLOCK**

### 2. Citation validator not delivered (C2) — Feature absent

`lib/knowledge/citations/validator.ts` does not exist. `validateCitations()` is not called anywhere.
PR description claims this was built and wired. It was not.

Per verdict tree: "Breaking API change without migration path" / undelivered claimed feature → **BLOCK**

### 3. compare-routes RAG not wired (C3) — Feature absent

`app/api/voyage/compare-routes/route.ts` has zero RAG imports. PR description claims JWC
retrieval was wired for Black Sea / Red Sea / Persian Gulf routes. It was not.

Same as C2 → **BLOCK**

---

## Required fixes before re-review

| ID  | File                                            | Fix                                                                                                                                               |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `lib/knowledge/embeddings/retriever.ts`         | Add allowlist: `['imsbc_vec','igc_vec','jwc_vec']` for vectorTable, `['imsbc_fts','igc_fts','jwc_fts']` for ftsTable — mirror pipeline.ts pattern |
| C2  | `lib/knowledge/citations/validator.ts` (create) | Implement `validateCitations()` and wire into `app/api/ai/draft-quote/route.ts` after LLM call, OR remove claim from PR description               |
| C3  | `app/api/voyage/compare-routes/route.ts`        | Wire JWC `retrieve()` for Black Sea/Red Sea/Persian Gulf, OR remove claim from PR description                                                     |
| H2  | `lib/knowledge/sources/jwc/scraper.ts`          | Replace `jwc-${Date.now()}` fallback with `crypto.randomUUID()` or `hash(sourceUrl + rawText)`                                                    |
| H3  | `lib/knowledge/sources/imsbc/chunker.ts`        | Strip Bidi controls (U+202A–202E, U+2066–2069) and C0/C1 chars after entity decode                                                                |

---

## Test suite (PR #99)

```
Tests:       10 failed, 157 passed, 167 total
Test Suites: 3 failed, 36 passed, 39 total
Time:        6.178 s
```

New regression test files:

```
__tests__/regression/
├── test_retriever_sql_injection.test.ts       (6 tests, 1 FAIL — C1)
├── test_adapter_truncation_and_id.test.ts     (7 tests, 2 FAIL — H2)
└── test_chunker_entity_decode.test.ts         (17 tests, 7 FAIL — H3)
```

All 10 failures document real bugs introduced by this PR. Tests will go green after fixes.
Do not delete them — they are the regression lock.

---

## What is solid (do not regress)

- `pipeline.ts` write-path allowlist — correct, keep as-is
- `searchVec0()` empty-string guard — correct (not sufficient, but keep)
- RRF merge logic — boundary cases handled (topN=0, empty arrays)
- IMSBC scraper 10MB cap and 100-section cap — working
- JWC scraper 50-bulletin cap, iframe/object/embed strip — working
- Migration 018 vec0 dimension enforcement — working (DB rejects wrong dim at INSERT)
- Feature flag `KNOWLEDGE_RAG_ENABLED=false` — safe default confirmed

---

## Previous verdict (PR #8, 2026-04-28)

Archived above this section in findings.md. Pre-existing bugs from PR #8 are not introduced
by PR #99 and do not affect this verdict.
