# Findings: claude/compassionate-jennings-cb6e62

Branch: claude/compassionate-jennings-cb6e62
HEAD: dded0315
**Phase 3 completed:** 2026-06-12
**Attack plan executed:** 7 items (3 HIGH, 2 MEDIUM, 2 LOW/static) — all executed or statically closed; 1 runtime sub-step skipped with note (regen `--dry`, db placeholder)
**Sub-agents dispatched:** 0 (single-agent run; attacks executed sequentially by severity)
**Baseline:** 549 tests green on HEAD before attacks (lib/matching + scripts/demo-seed + compute-matches/persist/race suites). Full `npm test` not run (environment constraint — targeted suites only).
**Browser freshness (Step 1.5):** N/A — no browser/E2E attacks executed; all UI impact verified at the binding level (skill principle #8), no running app consulted.

## Tests Added

- `tests/regression/persist-refresh-worksheet-clobber.test.ts` — 2 tests (cross-path-consistency, B.6) — **1 FAILS on HEAD (FINDING-001), control passes**
- `tests/regression/write-path-value-parity.test.ts` — 1 test (value-level parity hardening, B.2) — passes
- `tests/regression/persist-dedup-tie-semantics.test.ts` — 2 tests (merger tie semantics, c2e2c1a2) — pass (pin legacy contract)
- `tests/regression/bucket-hydrate-freight-provenance.test.ts` — 3 tests (provenance, B.3 half-landing) — pass (pin introduced shape + control)

## Failures Found

### FINDING-001 [HIGH]
**Title**: `refreshComputed` clobbers `worksheet_json` (and the bucketReason inside it) when the refresh source carries no worksheet — demo board loses comparison tables after one `/processing` visit
**File**: `lib/matching/matches-repository.ts:454` (`worksheet_json = ?` SET with `input.worksheet_json ?? null`) × `lib/matching/persist-session-matches.ts:197` (`refreshComputed: true`)
**Repro**: `tests/regression/persist-refresh-worksheet-clobber.test.ts` — "worksheet_json survives a re-persist from engine output"
**Failure**:
```
persistSessionMatches(hydrated match WITH worksheet)  -> worksheet_json = '{...}'   OK
persistSessionMatches(engine match, NO worksheet)     -> worksheet_json = NULL      FAIL
Expected: non-null (campaign goal: "renders identically regardless of which path last touched it")
Actual:   null — refreshComputedColumns ran SET worksheet_json = NULL
```
**Production chain (every link verified on disk, all out-of-diff)**:
1. Demo login → `lib/demo-mode/hydrate-demo-session.ts:192` attaches `m.worksheet` from seed `worksheet_json`.
2. First `/matches` or `/dashboard` render → session rows persisted WITH worksheets.
3. User opens `/processing` → pipeline auto-runs on mount (`app/processing/page.tsx:178`, no condition) → `POST /api/ai/match` → `updateSession({ matches: engineOutput })` (`app/api/ai/match/route.ts:163`); `lib/matching/pair-analyzer.ts` contains zero `worksheet` producers (admitted by the in-diff NOTE in `compute-matches.ts:111-113`).
4. Next render → `persistSessionMatches` + `refreshComputed: true` → `UPDATE … SET worksheet_json = NULL` on every hydrated session row.
**Consumers losing data**: `/match/[id]` cargo↔vessel comparison table (`app/match/[id]/page.tsx:82` — "without it the detail table is blank", per the plan's own ground truth), laycan_display rebase (`app/matches/page.tsx:63`), bucket-reason card (`app/matches/MatchesClient.tsx:835`).
**Severity**: HIGH — regression in the campaign's spec-documented goal; user-visible data loss on the primary demo surface; persists for the session lifetime (per-session copy; next login re-hydrates).
**Pre-existing on main**: **No — introduced by this PR.** On `004edba2` the second persist is a pure `INSERT OR IGNORE` no-op (the UPDATE path `refreshComputedColumns` is added by this diff), so the hydrated row's worksheet survived. The campaign created the demotion path by half-landing the refresh: it refreshes from a source (engine output) that cannot supply everything the row already has. Carve-out + blast-radius doctrine both apply (the PR changes how matches rows are written; every feeder of that path is in-scope).
**Fix hint**: in `refreshComputedColumns`, make null-preserving writes for columns whose only live producer on the refresh path can be absent — e.g. `worksheet_json = COALESCE(?, worksheet_json)` (or skip the SET when `input.worksheet_json == null`). Engine always supplies score/fit/reason/scoreBreakdown, so those stay unconditional. Alternatively: attach worksheets to engine output (closes the gap at the producer; the in-diff NOTE already flags the asymmetry).

### FINDING-002 [MEDIUM]
**Title**: B.3 economics-first read × hydrate's partial economics object → hydrated demo bucket rows carry canonical TCE with NULL freight rate/source; "≈ Estimate" (dimmed) badge renders over a canonical value and the regen-resolved rate is dropped
**File**: `lib/matching/session-buckets.ts:62-64` (economics-first read) × `lib/demo-mode/hydrate-demo-session.ts:163-179` (producer builds `economics` with ONLY `tceUsdPerDay`; its `selectCols` at :114-129 doesn't even SELECT the freight columns regen wrote)
**Repro (pinning)**: `tests/regression/bucket-hydrate-freight-provenance.test.ts`
**Behavior delta**: pre-B.3 these rows carried the self-consistent estimate triple (`tce≈est`, `rate=est`, `source='estimated'`); post-B.3 they carry `tce=canonical`, `rate=NULL`, `source=NULL`. `freightBadge(null)` falls back to "≈ Estimate / rate not confirmed" + dims the TCE (`lib/matching/freight-badge.ts:40-47`) — same badge tone as before, now over a canonical number; the freight value itself is not rendered on bucket cards today (`MatchesClient.tsx:738-742` renders only TCE + badge).
**Severity**: MEDIUM — provenance mislabel in the honest direction (under-claims confidence) on a demo-only surface; no rendered number contradicts its label more than before; TCE numeric consistency actually improves (bucket tab now agrees with regen/seed).
**Pre-existing on main**: No — the inconsistency is created by this PR's read-path change against an unchanged producer (half-landed). Counted as MEDIUM, follow-up: teach `rowsToMatches` to carry `freightRateUsdPerMt`/`freightRateSource` (and SELECT them), or fall back to the estimate triple when economics is partial.

## LOW / informational

### FINDING-003 [LOW — pre-existing semantics, pinned]
**Title**: first-wins dedup tie cases are array-order, not score-aware
**File**: `lib/matching/persist-session-matches.ts:64-70`
**Notes**: equal-`fitPercent` (or both-undefined) duplicates keep the array-first match even when the later one has a higher score; regen's sibling dedup (`regenerate-matches.ts` step 3) breaks ties by fit THEN score. Legacy `INSERT OR IGNORE` made exactly the same array-first choice, so this is **pre-existing semantics**, not introduced — does not gate. Pinned in `tests/regression/persist-dedup-tie-semantics.test.ts` so the contract is explicit for future callers.

### FINDING-004 [LOW — noted]
**Title**: `refreshComputed` silently ignored in legacy (pre-fit) schema branches of `createMatch`
**File**: `lib/matching/matches-repository.ts:240+` (hasVesselNameColumns/hasFreightRateColumns/hasM3/base branches)
**Notes**: only the `hasFitColumns` branch honors the flag; any DB without migration 042 silently keeps fossilized rows. All real DBs (prod, demo-seed, session stores) have the full chain; the helper's doc comment states the restriction. No action required; surfacing for completeness.

## Items That Passed (attack succeeded, no bug found)

- **Value-level write-path parity (B.2, hardened)** — `tests/regression/write-path-value-parity.test.ts`: precompute and session-persist write IDENTICAL VALUES for all 24 deterministic columns (stronger than the campaign's null-parity + 3-value check). Includes score clamping/rounding, reason text, laycan epoch, breakeven, item indexes, status.
- **refresh column/arg coupling audit** — manual count: 18 base SET entries ↔ 18 base args; conditional pushes in identical order (idx 2, worksheet 1, consEst 1, ballast 1, breakeven 1); WHERE appends 4 args matching 4 placeholders. Campaign's own tests cover the NULL-user boundary in both directions.
- **B.6 user_id boundary + status/created_at preservation** — covered by the campaign's `matches-repository-refresh.test.ts` (4 tests, green; `tick()` makes the created_at assertion load-bearing).
- **B.4 seed-all↔regen contract (static)** — `regenerate-matches.ts:516/529` parses `--db` (seed-all passes it); regen scorer is `async () => []` (line 581 — no LLM despite `AI_PROVIDER=claude-cli` env passthrough); failure → non-zero status → seed-all throws; `validateDb` after regen asserts only LOW_MATCH_COUNT (regen verify logs its own row/fit counts). Step renumbering 1/6..6/6 consistent in the diff.
- **B.1 reason_structured fix (static + binding)** — `reasonStructured: string | null` widened (`real-matches.ts:190`); single writer now `null` (line 382); bound at :463 (better-sqlite3 accepts null). UI claim verified: `MatchesClient.tsx:876` guards on `match.reason_structured &&`; the NaN mechanism (`comp.points / comp.max` at :893-898 over FitBreakdown components that lack points/max) is real, so nulling is the correct minimal fix. Regen (the canonical seeder) writes the legacy-shaped `scoreBreakdown` — shape contract preserved.
- **toBucketRows ↔ regen writeBucket read parity (B.3)** — `regenerate-matches.ts:727-735` reads the same `m.economics?.{tceUsdPerDay,freightRateUsdPerMt,freightRateSource}` triple.
- **Fit badge provenance** — board binds `match.fit_percent` (`MatchesClient.tsx:749-751,994-996`), never raw `score`; B.2 giving the precompute path `fit_percent` makes the badge light for precompute-only rows (was the "—" fallback).
- **tsc surface** — `npx tsc --noEmit`: 0 errors on HEAD.
- **Project rules pack** — ai-provider/admin-api/retriever rule scopes intersect nothing in this diff; the new parity tests mock `callAiJson` test-side only (no provider-chain changes).

## Blocked Items

- **Regen `--dry` replay against the committed seed** (plan Task 4 Step 7 / Task 6 Step 3): `data/demo-seed.db` in this worktree is a **0-byte placeholder** — the dry-run cannot exercise the real corpus here. The plan itself anticipated absence ("skip with a note"). Wiring is covered by unit tests + static checks above; the real replay belongs to the deploy/seed-apply session (see Deploy Gate).

## Classification Concerns

- (none — Phase 2 classifications held up in execution)

## Coverage Gaps

- Full `npm test` not run (forbidden in this environment — kills the worker); 549-test targeted baseline + 8 new regression tests instead.
- No browser E2E: no markup changed in this diff; all UI claims verified by reading bindings. A post-merge qa-walker pass should eyeball the demo board worksheet/bucket tabs once FINDING-001 is fixed.
- seed:all not executed end-to-end (needs LLM cache + raw corpus); contract verified statically.
- Concurrency: no new async window (better-sqlite3 synchronous, refresh runs in the same call frame as the failed INSERT); existing `__tests__/matches-persist-race.test.ts` green — no new race test written.

## Upstream meta-note (for the implementation chain)

The campaign's own parity test runs both write paths over the SAME engine output — it structurally cannot catch FINDING-001, which needs SEQUENTIAL persists with DIFFERENT-shaped sources (hydrated → engine). When testing an in-place refresh, always include a "refresh from a poorer source" case: the refresh contract is not only "new values land" but "absent values don't erase".

## max_examples Reductions

- N/A (fast-check not in repo; example-based adversarial fixtures used).
