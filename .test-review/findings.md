# findings.md — feat-bunker-oilmonster-blacksea adversarial QA (2026-06-02)
# Reviewer: cold-session adversarial QA

## Summary

23 adversarial tests written to `tests/regression/oilmonster-adversarial.test.ts`. All 23 pass.
The "DEMONSTRATES BUG" tests pass by asserting the CURRENT (buggy) behavior — they will FAIL
once the bug is fixed, alerting developers to update expected behavior.

## BUG-1 — HIGH — Per-port prices bypass range validation

**File:** `lib/knowledge/bunker/oilmonster-adapter.ts` lines 311-318 (per-port upsert)
**Severity:** HIGH — missing guard identical to the one applied on main table

The main table enforces `RANGE_VLSFO = { min: 200, max: 2000 }` and rejects out-of-range prices
with a `console.warn` + skip. The per-port upsert for Istanbul (TRIST) and Piraeus (GRPIR) has
**no range validation**. An unrealistic scraper value like 99999.00 would be inserted directly.

```ts
// main table — range validated (correct)
if (entry.vlsfo < RANGE_VLSFO.min || entry.vlsfo > RANGE_VLSFO.max) {
  console.warn(`[OilMonster] ${entry.portName} VLSFO ${entry.vlsfo} out of range`);
} else {
  upsertBunkerPrice(db, { ... });  // only if in range
  rowsChanged++;
}

// per-port — NO range check (BUG)
upsertBunkerPrice(db, {
  port_unlocode: unlocode,
  fuel_grade: 'VLSFO',
  price_usd_per_mt: parsed.vlsfo,  // any value accepted
  ...
});
rowsChanged++;
```

**Regression test:** B1 tests in `tests/regression/oilmonster-adversarial.test.ts`
- `DEMONSTRATES BUG: per-port Istanbul price 99999.00 is inserted without range check` — PASS (documents bug)
- `DEMONSTRATES BUG: per-port Istanbul price 1.00 (below 200 floor) is inserted` — PASS (documents bug)

**Fix:** Add range check before per-port `upsertBunkerPrice` call, identical to main table guard.

---

## BUG-2 — MEDIUM — ROCND proxy bypasses range validation

**File:** `lib/knowledge/bunker/oilmonster-adapter.ts` lines 329-338 (Constanta proxy)
**Severity:** MEDIUM — inherits BUG-1's extreme values and amplifies by +40

If Istanbul returns an extreme price (see BUG-1), the ROCND proxy = Istanbul + 40 is also
inserted without range validation. Example: Istanbul=99999.00 → ROCND=100039.00.

**Regression test:** B2 tests in `tests/regression/oilmonster-adversarial.test.ts`
- `DEMONSTRATES BUG: ROCND proxy = Istanbul(99999) + 40 is inserted without range check` — PASS

**Fix:** Add range check for `rocndPrice` before upserting ROCND.

---

## BUG-3 — MEDIUM — Parser implicitly requires `<i>` arrow icon before price (fragile dependency)

**File:** `lib/knowledge/bunker/oilmonster-adapter.ts` line 189
**Severity:** MEDIUM — will break if OilMonster removes the arrow icon from the price display

The price regex `/class="scrapitemprice"[\s\S]*?>([\d,]+\.\d{2})<span>\$US\/MT/` relies on the
non-greedy `[\s\S]*?>` finding the `>` at the END of the `</i>` closing tag before the price:

```
<div class="scrapitemprice">\n<i class="bi bi-arrow-down ..."></i>947.00<span>$US/MT</span>
```

If the arrow icon is removed, the HTML becomes:
```
<div class="scrapitemprice">\n947.00<span>$US/MT</span>
```

The newline after `>` prevents the regex from matching — the `>` is not immediately followed by
a price digit. Result: `OilMonsterStructureChangedError` thrown silently.

**Verified:** `node -e` test confirmed — without `<i></i>`, `\\n` before price → NO MATCH.
**Regression test:** B3 tests document this fragility with a failing test for the future scenario.

---

## LOW-4 — Price must have EXACTLY 2 decimal places (undocumented constraint)

**File:** `lib/knowledge/bunker/oilmonster-adapter.ts` line 189
**Severity:** LOW — real-world OilMonster prices consistently use 2 decimal places

Regex `[\d,]+\.\d{2}` requires exactly 2 decimal digits. Prices with 1 decimal (`947.5`),
3 decimals (`947.000`), or no decimal (`947`) throw `OilMonsterStructureChangedError`.
This constraint is not documented in code comments.

**Regression tests:** B4 tests document this behavior (3 tests for edge cases).

---

## LOW-5 — Misleading test name (documentation bug only)

**File:** `__tests__/lib/knowledge/bunker/oilmonster-adapter.test.ts` line 202
**Severity:** LOW — test assertion is correct, only the test name is wrong

Test is named: `'throws OilMonsterParseError for non-numeric price text'`
But the assertion is: `expect(...).toThrow(OilMonsterStructureChangedError)`

The name says `ParseError`, the assertion says `StructureChangedError`. The assertion is
correct (N/A doesn't match the price regex, so `priceMatch = null` → throws
`StructureChangedError`). Only the test description is misleading.

---

## VERIFIED OK — Staleness boundary arithmetic

Exactly 30 days old: `ageDays = 30`, `30 > 30 = false` → NOT stale (correct).
31 days old: `ageDays = 31`, `31 > 30 = true` → stale (correct).
Float division: both dates are UTC midnight, so `/ 86_400_000` is exact.
**Regression tests:** B5 tests verify boundary cases.

---

## VERIFIED OK — Constanta proxy arithmetic

`Math.round((947.00 + 40) * 100) / 100 = 987.00` — exact, no float drift.
**Regression tests:** B2 happy-path test verifies exact equality.

---

## Totals (feat-bunker-oilmonster-blacksea)

| Severity | Count | Production risk |
|---|---|---|
| HIGH | 1 (BUG-1) | DB corruption with extreme prices |
| MEDIUM | 2 (BUG-2, BUG-3) | ROCND inherits BUG-1; fragile parser |
| LOW | 2 (LOW-4, LOW-5) | Undocumented constraint; wrong test name |

Tests written: 23 in `tests/regression/oilmonster-adversarial.test.ts` — all PASS (documenting current behavior).

---

# PREVIOUS REVIEW (PR #739 adversarial QA — 2026-06-01)
# Reviewer: cold-session test-skill, branch fix/eua-bunker-ets (synced 7c4e7a84)

## BUG-1 — HIGH — parseTradingEconomicsHtml: integer prices not extracted

**File:** `lib/knowledge/eua/tradingeconomics-adapter.ts:20–51`

All three parse strategies use `([\d]+\.[\d]+)` which requires a decimal point.
Integer prices like `"Last":65` fail ALL three → throws TradingEconomicsParseError
→ refreshTradingEconomics returns null → valid EUA price silently discarded.

Repro: `parseTradingEconomicsHtml('<script>var te = {"Last":65};</script>')` → throws
Expected: `{ price: 65, priceDate: '...' }`

4 adversarial tests FAIL in `tests/regression/test_eua_bunker_ets_adversarial.test.ts`.
Fix: change each regex from `([\d]+\.[\d]+)` to `([\d]+(?:\.[\d]+)?)`.

## Passing (28/32 adversarial tests GREEN)
- BunkerIndex whitespace (a02831ff), structural check, NaN price handling: PASS
- ETS Cf=3.151 formula for all 4 fixtures: PASS
- HFO/HSFO stayed 3.114 (no regression): PASS
- Fixture drift from Cf=3.114: all <0.31% (well within ±2%): PASS
- Existing 47 tests in 3 suites: PASS

## VERDICT: BLOCK — BUG-1 HIGH (new file, not pre-existing on main)

---
# Legacy findings (PR #99: claude/rag-phase2-20260507)

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
