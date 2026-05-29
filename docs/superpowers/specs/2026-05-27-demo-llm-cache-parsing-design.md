# Demo LLM Cache Parsing — Design

**Date:** 2026-05-27
**Status:** Approved, ready for plan
**Owner:** Виталий (founder)
**Spec chain:** Builds on `2026-05-27-quantika-demo-frozen-snapshot-design.md` (PR #599 merged as `89fcba1`).

## Problem

After PR #599 merge, `data/demo-seed.db` contains **153 emails but 0 matches**. Root cause: `scripts/demo-seed/analyze.ts` and `scripts/demo-seed/build.ts` use regex-only extraction (`extractFacts` in analyze.ts) that matches literal `LAYCAN:` / `OPEN DATE:` labels — real broker emails don't use those labels, so only 3/153 emails yielded structured dates and 0 cargo↔vessel matches survived the pairing step.

## Goal

Run the 153 raw emails through this repo's **live LLM HTTP parsers** once, cache structured results to disk keyed by corpus hash, and feed them into `analyze.ts` + `build.ts`. Target: `data/demo-seed.db.matches` row count **>50** (current: 0).

## Non-goals

- E2E playwright tests (deferred to PR #599 Task 23).
- CI fixture-corpus smoke build (deferred to PR #599 Task 24).
- Reactivating DEMO_MODE guards on `/api/ai/*` endpoints (the user already trimmed those pre-merge).
- Adding `SCRIPT_AUTH_BYPASS` env flag — prod code stays untouched.

## Architecture (3 changes)

| Component | Action | Responsibility |
|---|---|---|
| `scripts/demo-seed/parse-via-devserver.ts` | CREATE | Driver: seed session, drive 4 LLM endpoints, write cache. |
| `scripts/demo-seed/llm-cache.ts` | CREATE | Pure helpers: `corpusHash()`, `readCache()`, `writeCache()`. |
| `scripts/demo-seed/analyze.ts` | MODIFY | Prefer LLM cache over regex `extractFacts` when present. |
| `scripts/demo-seed/build.ts` | MODIFY | Write real cargo/vessel/recap rows into `parsed_results` from cache. |
| `.gitignore` | MODIFY | Add `scripts/demo-seed/.llm-cache/`. |

## Data flow

```
.private/raw-emails/*.json (153 Gmail threads)
        ↓ scripts/demo-seed/parse-via-devserver.ts
[dev-server on :3000] ←─ POST /api/ai/classify
                     ←─ POST /api/ai/parse-cargo
                     ←─ POST /api/ai/parse-vessel
                     ←─ POST /api/ai/parse-recap
        ↓ read updated session from data/sessions.db
scripts/demo-seed/.llm-cache/<sha256>.json (gitignored)
        ↓ scripts/demo-seed/analyze.ts
scripts/demo-seed/manifest.json (offsets driven by REAL laycan/open_date)
        ↓ scripts/demo-seed/build.ts
data/demo-seed.db (emails + real parsed_results + >50 matches)
```

## Cache format

`scripts/demo-seed/.llm-cache/<sha256>.json`:

```json
{
  "corpusHash": "abc123...",
  "generatedAt": "2026-05-27T20:00:00.000Z",
  "classifications": [/* Classification[] from SessionData */],
  "parsedCargos":    [/* ParsedCargo[] from SessionData */],
  "parsedVessels":   [/* ParsedVessel[] from SessionData */],
  "parsedFixtureRecaps": [/* ParsedFixtureRecap[] from SessionData */]
}
```

Field shapes match SessionData exactly so analyze.ts/build.ts re-use existing types.

### Corpus hash

```ts
sha256(
  sortedFiles.map(f => readFileSync(f)).join('\n--FILE--\n')
)
```

Sorting filenames ensures determinism. Any change to any raw email → new hash → cache miss → re-run.

## Driver script (`parse-via-devserver.ts`)

Sequence:

1. **Hash check.** Compute corpus hash. If `.llm-cache/<hash>.json` exists, exit 0 with "cache hit, skipping LLM calls".
2. **Server probe.** `GET http://localhost:3000/` with 2s timeout. If non-200 → print "Start the dev-server in another terminal: `npm run dev`" and exit 2.
3. **Load corpus.** Read all 153 raw emails via `normalizeRawEmail()` (already exported from analyze.ts). Map to `Email[]` shape — populate `id` (from `messageId`), `threadId`, `from`/`fromName`/`fromEmail`, `subject`, `date`, `body`, `snippet`, `to=""`, `labelIds=[]`.
4. **Seed session.** Open `data/sessions.db` via the existing `SessionStore` (`getStore()`), call `createSession('demo-script-token')` → returns session id, then `updateSession(id, { emails })`. Do **not** set `isSampleData=true` — endpoints would early-return cached data.
5. **Drive endpoints (sequential, with retries on 5xx).** For each of `/api/ai/classify`, `/api/ai/parse-cargo`, `/api/ai/parse-vessel`, `/api/ai/parse-recap`:
   - `POST http://localhost:3000/<path>` with header `Cookie: session_id=<id>`.
   - In dev `validateCsrf` returns `true` unconditionally → no CSRF header needed.
   - Body: empty JSON `{}` (endpoints read session, not body).
   - Timeout: 300s per call (parse endpoints have `maxDuration` 55-120s and process in batches).
   - Retry once on 5xx / network error.
6. **Read result.** After all 4 succeed, read session row directly from sessions.db, deserialize the `data` JSON blob, extract the 4 arrays.
7. **Write cache.** `mkdir -p .llm-cache`, write `<hash>.json` with the 4 arrays.
8. **Cleanup.** Best-effort `DELETE FROM sessions WHERE id = ?` so we don't pollute dev sessions.db.

**Auth model summary:** Session is real (lives in sessions.db). CSRF is bypassed by NODE_ENV=development. No prod code changes; the driver is just an HTTP client that authenticates the same way the browser does.

## analyze.ts integration

Add `loadLlmCacheIfAny(rawDir): LlmCache | null` helper. In `analyze()`:

```ts
const llmCache = loadLlmCacheIfAny(opts.rawDir);
// inside loop over corpus:
const facts = llmCache
  ? extractFactsFromCache(email, llmCache)
  : extractFacts(email);  // existing regex path
```

`extractFactsFromCache` produces the same `ParsedFacts` shape but populates:
- `category` from `classifications.find(c => c.emailId === email.id).category` mapped to `'cargo'|'vessel'|'recap'|'other'`.
- `laycanStart/End` from `parsedCargos.find(p => p.emailId === email.id).laycan`.
- `openDate` from `parsedVessels.find(p => p.emailId === email.id).openDate`.
- `vesselNames` from `parsedVessels[].vesselName` (real names → richer anonymization map).
- `charterers` from `parsedCargos[].charterer` (previously empty in regex path).
- `brokers`, `senderEmails` from email header (unchanged).

**Backward compatibility:** When no cache present (CI, fresh worktree), regex path runs identically to today → existing tests stay green.

## build.ts integration

Currently `build()` calls `extractFacts(email)` and inserts only sparse `parsed_results` rows. Change:

```ts
const llmCache = loadLlmCacheIfAny(opts.rawDir);
// per email:
if (llmCache) {
  // Real classify row
  const cls = llmCache.classifications.find(c => c.emailId === email.messageId);
  if (cls) insertParsed.run('demo', email.messageId, 'classify', PARSER_VERSION,
    JSON.stringify(cls), manifest.generated_at);

  // Real cargo rows (may be >1 per email — multi-cargo)
  for (const c of llmCache.parsedCargos.filter(c => c.emailId === email.messageId)) {
    // shift c.laycan dates by offset before persisting
    insertParsed.run('demo', email.messageId, 'cargo', PARSER_VERSION,
      JSON.stringify(shiftCargoDates(c, offset)), manifest.generated_at);
  }

  // Real vessel rows
  for (const v of llmCache.parsedVessels.filter(v => v.emailId === email.messageId)) {
    insertParsed.run('demo', email.messageId, 'vessel', PARSER_VERSION,
      JSON.stringify(shiftVesselDates(v, offset)), manifest.generated_at);
  }

  // Real recap rows
  // ... similar
} else {
  // existing regex extractFacts path
}
```

The match-compute step at end of `build()` already reads `parse_type='cargo'` and `parse_type='vessel'` rows and pairs by laycan/open_date. With real data → >50 matches naturally.

## Edge cases

| Case | Behaviour |
|---|---|
| Cache file exists for a different corpus hash (stale cache) | Treat as cache miss — analyze/build see no matching cache. parse-via-devserver script reruns (new hash, new file). Stale files never auto-pruned — operator deletes `.llm-cache/` manually if needed. |
| Dev-server not running | parse-via-devserver exits 2 with explicit message; never tries to start the server itself. |
| LLM call returns non-200 | One retry on 5xx, then fail with stderr dump of response body. No partial cache writes. |
| `parsed_results` already populated with regex data | build.ts always recreates `data/demo-seed.db` from scratch (existing behaviour: `unlinkSync` then re-migrate). Cache integration is just a different code path for the same step. |
| Cache present but raw email IDs don't match anymore | `extractFactsFromCache` falls back to `other` category if no classification row found → analyze.ts treats as fallback offset. |
| Anonymization leak: real vessel/charterer name in body that wasn't in cache | build.ts's existing `forbiddenSubstrings` validator throws — operator regenerates manifest with updated anonymization map. |

## Testing

| Layer | What |
|---|---|
| `scripts/demo-seed/__tests__/llm-cache.test.ts` (unit) | `corpusHash()` is deterministic + changes when any file changes; `readCache/writeCache` round-trip preserves shape; `loadLlmCacheIfAny` returns null when no cache file or hash mismatch. |
| `scripts/demo-seed/__tests__/analyze.test.ts` (extend) | When cache fixture present, `analyze()` uses `category`/`laycan` from cache, not regex; when absent, falls back to regex (existing tests stay green). |
| `scripts/demo-seed/__tests__/build.test.ts` (extend) | With cache fixture providing 2 cargo + 2 vessel rows → `matches` table contains >0 rows. |
| Integration | One real run of `parse-via-devserver.ts` against the local dev-server — proof that the script works end-to-end. Output cache file checked in NOT committed (gitignored). |

Existing 26 tests must stay green (PI3: no test-expectation rewrites).

## Acceptance

- `scripts/demo-seed/parse-via-devserver.ts` exists and dry-runs cleanly (`--dry-run` flag prints what it would do).
- After one real run, `.llm-cache/<hash>.json` exists with non-zero classifications + parsedCargos + parsedVessels.
- After `npm run demo-seed:analyze` + `npm run demo-seed:build`, `sqlite3 data/demo-seed.db "SELECT COUNT(*) FROM matches"` returns **>50**.
- `manifest.json` `anonymization` map contains real-looking vessel + charterer aliases (e.g. `M/V DEMO 1`, `CHARTERER 1`).
- `npm test` — all existing tests green.
- `./scripts/pre-merge-check.sh` (or repo equivalent) passes.

## Out-of-scope follow-ups

- Reactivate DEMO_MODE cache-only guards on parse-* endpoints (separate PR).
- Production deploy DEMO_MODE=true on outreach-vps (manual step after PR merges).
