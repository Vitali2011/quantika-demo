# Attack Plan — Adversarial QA

## Spec: spec-19-lib-knowledge-sources-jwc-adapter-ts-syncjwcrag-separate-from-existing-lib-knowledge-jwc-adapter-ts-structured-war-risk-zones

### Target Functions

1. `scrapeJwc(baseUrl: string)` — lib/knowledge/sources/jwc/scraper.ts:31
2. `syncJwcRag(opts?: SyncJwcRagOptions)` — lib/knowledge/sources/jwc/adapter.ts:17 (STUB)

**CRITICAL CONTEXT:** `syncJwcRag` is a STUB that throws. Only `scrapeJwc` has real implementation to audit.

---

## Class A: Empty / falsy inputs

| ID  | Target       | Attack                                                 | Expected behavior                                            | Severity | Test exists? |
| --- | ------------ | ------------------------------------------------------ | ------------------------------------------------------------ | -------- | ------------ |
| A1  | `scrapeJwc`  | `baseUrl = ""` (empty string)                          | Throw `'baseUrl cannot be empty'`                            | HIGH     | Check tests  |
| A2  | `scrapeJwc`  | `baseUrl = null` (cast to string → `"null"`)           | Throw on invalid URL                                         | HIGH     | **MISSING**  |
| A3  | `scrapeJwc`  | `baseUrl = undefined` (cast to string → `"undefined"`) | Throw on invalid URL                                         | HIGH     | **MISSING**  |
| A4  | `scrapeJwc`  | `baseUrl = "   "` (whitespace only)                    | Throw `'baseUrl cannot be empty'` (line 32 checks `.trim()`) | HIGH     | **MISSING**  |
| A5  | `scrapeJwc`  | Listing HTML = `""` (empty response)                   | Return `[]` (line 37-39)                                     | MEDIUM   | Check tests  |
| A6  | Internal     | `fetchWithTimeout(url, 0)`                             | Immediate timeout                                            | MEDIUM   | **MISSING**  |
| A7  | Internal     | `extractBulletinLinks(html="", baseUrl)`               | Return `[]`                                                  | LOW      | Implicit     |
| A8  | Internal     | `parseBulletin(html="", sourceUrl)`                    | Return `null` (no date → line 121-124)                       | MEDIUM   | **MISSING**  |
| A9  | `syncJwcRag` | `opts.dryRun = undefined`                              | Default false (check implementation)                         | LOW      | STUB         |

**Line 32 guard:** `if (!baseUrl || baseUrl.trim() === '')` — guards A1, A4 ✓. But NOT A2/A3 (type coercion).

---

## Class B: Special floats

| ID  | Target   | Attack                             | Expected behavior                                | Severity | Test exists? |
| --- | -------- | ---------------------------------- | ------------------------------------------------ | -------- | ------------ |
| B1  | Internal | `fetchWithTimeout(url, NaN)`       | Immediate abort or undefined behavior            | MEDIUM   | **MISSING**  |
| B2  | Internal | `fetchWithTimeout(url, Infinity)`  | Never timeout (resource leak)                    | MEDIUM   | **MISSING**  |
| B3  | Internal | `fetchWithTimeout(url, -Infinity)` | Immediate abort or error                         | LOW      | **MISSING**  |
| B4  | Internal | `MAX_CONCURRENT = NaN`             | Infinite loop in `fetchBulletinsWithConcurrency` | HIGH     | **MISSING**  |
| B5  | Internal | `MAX_CONCURRENT = Infinity`        | Resource exhaustion (fetch all at once)          | CRITICAL | **MISSING**  |

**Risk:** `TIMEOUT_MS` and `MAX_CONCURRENT` are constants (line 11-12), so not directly exploitable. But if refactored to config-driven, this is CRITICAL.

---

## Class C: Negative in positive domain

| ID  | Target   | Attack                         | Expected behavior                              | Severity | Test exists? |
| --- | -------- | ------------------------------ | ---------------------------------------------- | -------- | ------------ |
| C1  | Internal | `fetchWithTimeout(url, -1000)` | Immediate abort or error                       | MEDIUM   | **MISSING**  |
| C2  | Internal | `MAX_CONCURRENT = -1`          | No bulletins fetched (deadlock or skip)        | HIGH     | **MISSING**  |
| C3  | Internal | `MAX_CONCURRENT = 0`           | Deadlock: `queue.splice(0, 0)` → infinite loop | CRITICAL | **MISSING**  |

**Line 108:** `queue.splice(0, maxConcurrent)` — if `maxConcurrent = 0`, splices nothing → infinite loop → DoS.

---

## Class D: Out-of-range ratio/percent

| ID  | Target       | Attack                                  | Expected behavior                 | Severity | Test exists? |
| --- | ------------ | --------------------------------------- | --------------------------------- | -------- | ------------ |
| D1  | Internal     | `MAX_CONCURRENT = 0`                    | Infinite loop (see C3)            | CRITICAL | **MISSING**  |
| D2  | `syncJwcRag` | `opts.dryRun = 50` (truthy non-boolean) | Treated as `true` (JS truthiness) | LOW      | STUB         |

**No ratio/percent fields in JWC scraper.** D-class mostly N/A.

---

## Class E: Non-exhaustive switch/union

| ID  | Target      | Attack                                                  | Expected behavior                                | Severity | Test exists? |
| --- | ----------- | ------------------------------------------------------- | ------------------------------------------------ | -------- | ------------ |
| E1  | `scrapeJwc` | `baseUrl = "javascript:alert(1)"`                       | Throw on fetch (invalid protocol)                | CRITICAL | **MISSING**  |
| E2  | `scrapeJwc` | `baseUrl = "file:///etc/passwd"`                        | Throw on fetch (invalid protocol)                | HIGH     | **MISSING**  |
| E3  | `scrapeJwc` | `baseUrl = "data:text/html,<h1>fake</h1>"`              | Throw on fetch (invalid protocol)                | HIGH     | **MISSING**  |
| E4  | Internal    | Link href = `"javascript:alert(1)"` in listing HTML     | Should be skipped (line 79 checks `javascript:`) | MEDIUM   | Check tests  |
| E5  | Internal    | Link href = `"#anchor"` in listing HTML                 | Skipped (line 79 checks `startsWith('#')`)       | LOW      | Implicit     |
| E6  | Internal    | Bulletin HTML with NO `<time>`, NO date patterns        | Return `null` (line 121-124)                     | MEDIUM   | Check tests  |
| E7  | Internal    | `extractId()` returns `null` → ID = `jwc-${Date.now()}` | Non-deterministic ID (line 129)                  | LOW      | **MISSING**  |

**Line 79 guard:** Skips `href.startsWith('#')` and `href.startsWith('javascript:')` ✓. But not `file:`, `data:`, `vbscript:`, etc.

---

## Class F: Substring vs whole-word matching

| ID  | Target   | Attack                                                           | Expected behavior                                                                           | Severity     | Test exists? |
| --- | -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ | ------------ |
| F1  | Internal | Link href = `"evil.html.exe"`                                    | Accepted (no suffix check, only protocol check)                                             | MEDIUM       | **MISSING**  |
| F2  | Internal | Link href = `"../../../../etc/passwd"` (relative path traversal) | Resolved against `baseUrl` via `new URL(href, baseUrl)` (line 80)                           | LOW          | Implicit     |
| F3  | Internal | Bulletin ID extraction: `"JWLA-999999999999999999999"`           | No integer overflow (stored as string)                                                      | LOW          | N/A          |
| F4  | Internal | Date extraction: malformed date like `"99/99/9999"`              | `new Date("99/99/9999")` → Invalid Date → `isNaN(parsed.getTime())` → fallback to `dateStr` | LOW          | **MISSING**  |
| F5  | Internal | Title extraction: `<h1>Title<script>alert(1)</script></h1>`      | Script NOT stripped (only `stripTags(['script', ...])` on full HTML, not on extracted h1)   | **CRITICAL** | **MISSING**  |

**CRITICAL BUG SUSPECTED:** Line 149 calls `htmlToPlainText(h1Match[1])`, which strips ALL tags (line 212 regex `/<[^>]+>/g`). But does NOT strip script CONTENT if script tags are already removed by `stripTags` on line 116. **Wait — need to re-check logic.**

Actually, line 116 strips `<script>` from full HTML BEFORE line 149 extracts title. So `h1Match[1]` already has script removed. **NOT a bug**.

But: What if `<h1>` contains event handlers? `<h1 onmouseover="alert(1)">Title</h1>` → `htmlToPlainText` strips tag but NOT the attribute. **Actually, `htmlToPlainText` strips ALL tags including attributes (line 212).** So this is safe.

**Revised:** F5 is NOT a bug. But let's test it anyway (defense-in-depth).

---

## Class G: Authz / HMAC / Security (XSS)

| ID  | Target      | Attack                                              | Expected behavior                                                                             | Severity | Test exists? |
| --- | ----------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- | ------------ |
| G1  | `scrapeJwc` | Bulletin HTML with `<script>alert(1)</script>`      | Stripped by `stripTags(['script', ...])` (line 116)                                           | CRITICAL | Check tests  |
| G2  | `scrapeJwc` | Bulletin HTML with `<img src=x onerror=alert(1)>`   | Tag stripped by `htmlToPlainText`, but rawText may retain attribute?                          | CRITICAL | **MISSING**  |
| G3  | `scrapeJwc` | Nested `<script><script>alert(1)</script></script>` | Inner script stripped, outer `<script>` tag remains?                                          | CRITICAL | **MISSING**  |
| G4  | `scrapeJwc` | Uppercase `<SCRIPT>alert(1)</SCRIPT>`               | Regex line 140 uses `'gis'` flag (case-insensitive) → stripped ✓                              | MEDIUM   | **MISSING**  |
| G5  | `scrapeJwc` | `<a href="javascript:alert(1)">Link</a>`            | `<a>` tag stripped by `htmlToPlainText`, but `javascript:` URL appears in rawText?            | HIGH     | **MISSING**  |
| G6  | `scrapeJwc` | `<iframe src="https://evil.com">`                   | Not in `stripTags` list → NOT stripped → appears in rawText                                   | HIGH     | **MISSING**  |
| G7  | `scrapeJwc` | `<svg onload=alert(1)>`                             | `<svg>` not in stripTags list → retained, but `htmlToPlainText` strips tags → attribute lost? | MEDIUM   | **MISSING**  |

**CRITICAL GAP:** Line 116 only strips `['script', 'style', 'nav', 'footer']`. Tags like `<iframe>`, `<object>`, `<embed>`, `<svg>`, `<math>`, etc. are NOT stripped.

**Line 212 safety:** `htmlToPlainText` does `html.replace(/<[^>]+>/g, ' ')` — strips ALL tags and attributes. So `<iframe src="evil">` → ` `. Safe for plain text.

**BUT:** What if downstream code uses `rawText` in HTML context without escaping? Then `<iframe>` would execute. **Defense-in-depth:** Should strip `<iframe>` even if converted to plain text.

---

## Class H: External API misuse

| ID  | Target      | Attack                                       | Expected behavior                                                       | Severity | Test exists? |
| --- | ----------- | -------------------------------------------- | ----------------------------------------------------------------------- | -------- | ------------ |
| H1  | `scrapeJwc` | `baseUrl` points to 10GB response            | Timeout after 10s (TIMEOUT_MS), no memory exhaustion                    | HIGH     | **MISSING**  |
| H2  | `scrapeJwc` | `baseUrl` points to slow server (1 byte/sec) | Timeout after 10s                                                       | MEDIUM   | **MISSING**  |
| H3  | `scrapeJwc` | Listing HTML with 10,000 bulletin links      | Fetch all concurrently (MAX_CONCURRENT=3 batches) → resource exhaustion | HIGH     | **MISSING**  |
| H4  | `scrapeJwc` | Individual bulletin response = 100MB         | No size limit → memory exhaustion                                       | HIGH     | **MISSING**  |
| H5  | `scrapeJwc` | Individual bulletin 500 error                | Skip, log warning (line 103), continue ✓                                | LOW      | Check tests  |
| H6  | `scrapeJwc` | Individual bulletin timeout                  | Skip, log warning (line 103), continue ✓                                | LOW      | Check tests  |

**CRITICAL GAP:** No response size limit. Fetch API reads entire response into memory (line 62 `response.text()`). 100MB bulletin → OOM.

---

## Class 7: Config cross-reference

| ID  | Target   | Attack                                                                    | Expected behavior                                  | Severity | Test exists? |
| --- | -------- | ------------------------------------------------------------------------- | -------------------------------------------------- | -------- | ------------ |
| 7.1 | Internal | `new URL(href, baseUrl)` when `href` is absolute                          | Use `href` (ignore `baseUrl`)                      | N/A      | Implicit     |
| 7.2 | Internal | `new URL(href, baseUrl)` when `href` is relative                          | Resolve relative to `baseUrl`                      | N/A      | Implicit     |
| 7.3 | Internal | `normalizeDate()` fallback returns original `dateStr` instead of throwing | Could store invalid date like `"99/99/9999"` in DB | MEDIUM   | **MISSING**  |

**Line 193 issue:** If date parsing fails, returns original `dateStr` unchanged. Could lead to invalid ISO dates in DB (e.g., `"13/45/2026"` → not rejected). But contract says "Missing date → fallback or skip with warning" (line 25). Implementation returns malformed date without warning. **MEDIUM** bug.

---

## Class 8: Test change review

| ID  | Metric                           | Value                            | Threshold         | Verdict                |
| --- | -------------------------------- | -------------------------------- | ----------------- | ---------------------- |
| 8.1 | Changed assertions in test files | 71                               | >5 = RED FLAG     | **⚠️ REVIEW REQUIRED** |
| 8.2 | Test-to-implementation ratio     | 71 assertions / 113 lines = 0.63 | >0.5 = ACCEPTABLE | ✓ PASS                 |

**Manual review needed:** 71 changed assertions is high. Need to check if these are:

- New tests (additions) → OK
- Changed expectations (rewrites) → RED FLAG

Let me inspect the test diff.

---

## Class 9: End-to-end property tests

| ID  | Property                                                                                    | Test coverage                                                 | Severity | Test exists? |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- | ------------ |
| 9.1 | **Regex rejection:** Listing HTML with NO links                                             | Should return `[]`                                            | MEDIUM   | **MISSING**  |
| 9.2 | **Regex rejection:** Bulletin HTML with NO date patterns                                    | Should return `null` (line 121-124) ✓                         | MEDIUM   | Check tests  |
| 9.3 | **HTTP status code:** Tests check `response.ok` (line 58) but not explicit `status === 200` | Implicit via `response.ok`                                    | LOW      | Implicit     |
| 9.4 | **Sanitization completeness:** Tests check absence of `<script>`, but not all XSS vectors   | Missing `<iframe>`, `<object>`, `<embed>`, uppercase variants | HIGH     | **MISSING**  |
| 9.5 | **Sort order:** Bulletins sorted by `publishDate` descending (line 47)                      | Should verify newest first                                    | LOW      | **MISSING**  |
| 9.6 | **Concurrency correctness:** MAX_CONCURRENT=3 should process in batches, not all at once    | Verify batching behavior                                      | LOW      | **MISSING**  |

---

## Summary by severity

| Severity     | Count | Attack IDs                                                                                                                                  |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRITICAL** | 4     | B5 (Infinity concurrent), C3 (0 concurrent → deadlock), E1 (javascript: URL), G3 (nested script)                                            |
| **HIGH**     | 12    | A1-A4 (empty input), B4 (NaN concurrent), C2 (negative concurrent), E2-E3 (file:/data: protocols), G5-G6 (XSS iframe/href), H1, H3-H4 (DoS) |
| **MEDIUM**   | 15    | A5, A6, A8, B1-B2, C1, E4, E6, F1, F4, G4, G7, H2, 7.3, 9.1, 9.2, 9.4                                                                       |
| **LOW**      | 11    | A7, A9, B3, E5, E7, F2-F4, H5-H6, 9.3, 9.5-9.6                                                                                              |

**Total attack vectors identified:** 42
**Total CRITICAL/HIGH:** 16

---

## Prioritized RED test plan

### P0 (CRITICAL — write these first)

1. **spec19-CRIT01-infinite-concurrent** — `MAX_CONCURRENT = Infinity` → resource exhaustion
2. **spec19-CRIT02-zero-concurrent-deadlock** — `MAX_CONCURRENT = 0` → infinite loop
3. **spec19-CRIT03-javascript-url-baseurl** — `scrapeJwc('javascript:alert(1)')`
4. **spec19-CRIT04-nested-script-bypass** — `<script><script>alert(1)</script></script>` in bulletin HTML

### P1 (HIGH — critical for production)

5. **spec19-HIGH01-empty-baseurl** — `scrapeJwc('')`
6. **spec19-HIGH02-whitespace-baseurl** — `scrapeJwc('   ')`
7. **spec19-HIGH03-null-baseurl** — `scrapeJwc(null as any)`
8. **spec19-HIGH04-undefined-baseurl** — `scrapeJwc(undefined as any)`
9. **spec19-HIGH05-file-protocol** — `scrapeJwc('file:///etc/passwd')`
10. **spec19-HIGH06-data-protocol** — `scrapeJwc('data:text/html,<h1>fake</h1>')`
11. **spec19-HIGH07-nan-concurrent** — Internal test with `fetchBulletinsWithConcurrency(urls, NaN)`
12. **spec19-HIGH08-negative-concurrent** — Internal test with `MAX_CONCURRENT = -1`
13. **spec19-HIGH09-iframe-in-bulletin** — `<iframe src="https://evil.com">` not stripped
14. **spec19-HIGH10-javascript-href** — `<a href="javascript:alert(1)">` in bulletin
15. **spec19-HIGH11-large-response-dos** — 10GB listing page
16. **spec19-HIGH12-massive-links-dos** — 10,000 bulletin links
17. **spec19-HIGH13-large-bulletin-dos** — 100MB individual bulletin

### P2 (MEDIUM — important but lower risk)

18. **spec19-MED01-empty-listing-html** — Listing page returns `""`
19. **spec19-MED02-zero-timeout** — `fetchWithTimeout(url, 0)`
20. **spec19-MED03-nan-timeout** — `fetchWithTimeout(url, NaN)`
21. **spec19-MED04-malformed-date** — Bulletin with date `"99/99/9999"` (no warning logged)
22. **spec19-MED05-uppercase-script** — `<SCRIPT>alert(1)</SCRIPT>`
23. **spec19-MED06-no-links-in-listing** — Listing HTML with NO `<a>` tags

### P3 (LOW — edge cases)

- Remaining items from Class F, 9.x (sort order, concurrency batching, etc.)

---

## Regression Lock Mapping

| RC Directory               | Attack Classes                           | Example IDs                           |
| -------------------------- | ---------------------------------------- | ------------------------------------- |
| **RC1-fail-open**          | A (empty input), E (protocol validation) | spec19-HIGH01 to HIGH06               |
| **RC3-magnitude**          | B (NaN/Infinity), C (negative/zero)      | spec19-CRIT01, CRIT02, HIGH07, HIGH08 |
| **RC5-no-fallback**        | H (external API DoS)                     | spec19-HIGH11 to HIGH13               |
| **RC6-security-blacklist** | G (XSS/injection)                        | spec19-CRIT04, HIGH09, HIGH10         |

---

## Notes for test implementation

- **CRIT01, CRIT02:** Not exploitable via public API (MAX_CONCURRENT is constant). But write internal tests for future-proofing.
- **CRIT03:** May be caught by fetch() itself (invalid URL), but should have explicit guard.
- **CRIT04:** Regex `/<script[^>]*>.*?<\/script>/gis` (line 140) is greedy — should handle nested scripts correctly. Verify with test.
- **HIGH09, HIGH10:** Even though `htmlToPlainText` strips tags, defense-in-depth requires explicit `stripTags` for dangerous tags.
- **Class 8 manual review:** Need to git diff test files to check if assertions were CHANGED (red flag) or ADDED (OK).

---

## Next Steps

1. ✅ Complete Class 8 manual review (check test diffs)
2. Write P0 CRITICAL tests (4 tests)
3. Write P1 HIGH tests (13 tests)
4. Run `npm test` and classify failures
5. Generate findings.md with CRITICAL/HIGH/MEDIUM classifications
6. Check pre-existing status (run tests against base branch)
7. Generate verdict.md (BLOCK if any new CRITICAL/HIGH)
