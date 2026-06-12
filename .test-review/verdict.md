VERDICT: BLOCK
Branch: claude/compassionate-jennings-cb6e62
HEAD: dded0315

# Test Review Verdict: write-path convergence campaign (audit пункт Б, B.1–B.6)

**Date:** 2026-06-12
**Reviewer:** test-skill (cold-start, no feature-session context)
**Diff reviewed:** 004edba2..HEAD (campaign cumulative, ≡ main..HEAD; 10 commits, 14 files)

## Summary

- Tests added: 8 (0 property — fast-check absent from repo; 8 example-based adversarial/pinning tests in 4 files under `tests/regression/`)
- Bugs found: 4 (0 CRITICAL, 1 HIGH, 1 MEDIUM, 2 LOW)
- Pre-existing bugs noted: 1 (dedup tie semantics — does not block)
- Attack plan: fully executed (7 items; 1 runtime sub-step skipped with note — regen `--dry` against a 0-byte placeholder db, anticipated by the plan itself)

## Findings

### CRITICAL (blocks merge)

- (none)

### HIGH (blocks merge if new)

- **FINDING-001: `refreshComputed` clobbers `worksheet_json` when the refresh source carries no worksheet — demo board loses comparison tables / bucket-reason / laycan rebase after one `/processing` visit**
  - File: `lib/matching/matches-repository.ts:454` (unconditional `worksheet_json = ?` with `input.worksheet_json ?? null`) × `lib/matching/persist-session-matches.ts:197` (`refreshComputed: true`)
  - Repro test: `tests/regression/persist-refresh-worksheet-clobber.test.ts` (FAILS on HEAD; control test in the same file proves the refresh of engine-supplied fields works — this finding is data loss, not anti-refresh)
  - Failing input: persist hydrated-style match (with worksheet) → persist engine-style match (same email pair, no worksheet — exactly what `POST /api/ai/match` puts into `session.matches`; `pair-analyzer.ts` has zero worksheet producers)
  - Expected: `worksheet_json` survives (campaign goal: "a match renders identically regardless of which path … last touched it")
  - Actual: `UPDATE … SET worksheet_json = NULL` — `/match/[id]` comparison table blank, laycan_display degrades, bucket-reason card gone, for every hydrated match in the session
  - Reachability: demo login → hydrated rows persisted with worksheets → user opens `/processing` (pipeline auto-runs on mount, `app/processing/page.tsx:178`) → `session.matches` replaced by engine output → next `/matches`//`dashboard` render refreshes rows. The route's own `isSampleData` guard shows demo sessions are expected to run it.
  - Fix hint: null-preserving write for refresh-path columns whose live producer can be absent — `worksheet_json = COALESCE(?, worksheet_json)` or skip the SET when input is null; or attach worksheets to engine output (the in-diff NOTE in `compute-matches.ts:111-113` already admits the asymmetry).
  - Pre-existing on main? **No — introduced by this PR.** On `004edba2` the second persist is a pure INSERT OR IGNORE no-op; the UPDATE path is added by this diff. Half-landed-change carve-out + blast-radius rule (`phases/4-verdict.md`) both apply.

### MEDIUM (follow-up OK)

- **FINDING-002: B.3 economics-first read × hydrate's partial economics → hydrated demo bucket rows carry canonical TCE with NULL freight rate/source** — `lib/matching/session-buckets.ts:62-64` × `lib/demo-mode/hydrate-demo-session.ts:163-179` (producer supplies only `tceUsdPerDay`; SQL doesn't SELECT freight cols). `freightBadge(null)` → "≈ Estimate" + dimmed over a canonical TCE; badge tone unchanged vs pre-B.3, freight value not rendered on bucket cards today, TCE consistency improves — hence MEDIUM, not HIGH. Introduced (half-landed producer). Pinned in `tests/regression/bucket-hydrate-freight-provenance.test.ts`. Follow-up: carry `freightRateUsdPerMt`/`freightRateSource` through `rowsToMatches` (and its SELECT), or fall back to the estimate triple when economics is partial.

### LOW / Test-bugs

- **FINDING-004: `refreshComputed` silently ignored in legacy (pre-fit) schema branches of `createMatch`** (`lib/matching/matches-repository.ts:240+`) — all real DBs have migration 042+; doc comment states the restriction. Note only.
- No test-bugs: all 4 new suites verified against spec invariants; 7 of 8 tests pass on HEAD, the 1 failure is FINDING-001 (a PR bug, not a test bug).

## Pre-existing Issues (informational, not gate-relevant)

- **FINDING-003: first-wins dedup tie cases are array-order, not score-aware** (`lib/matching/persist-session-matches.ts:64-70`) — equal/undefined-fit duplicates keep the array-first row even if a later one has higher score; regen's sibling dedup breaks ties by fit-then-score. Legacy INSERT OR IGNORE made the identical choice → pre-existing semantics, not introduced. Pinned in `tests/regression/persist-dedup-tie-semantics.test.ts`.

## What held up under attack (verified, no bug)

- **Value-level write-path parity (B.2)** — hardened beyond the campaign's null-parity: both write paths produce IDENTICAL VALUES across all 24 deterministic columns (`tests/regression/write-path-value-parity.test.ts`, passes).
- **B.6 mechanics** — refresh column/arg coupling (18+conditionals audited), user_id NULL-boundary both directions, status/created_at/id preservation (campaign's own 4 tests, green).
- **B.4 contract** — seed-all→regen `--db` arg parsed; regen is LLM-free (`async () => []`); failure propagates; validators compatible.
- **B.1** — type widened to `string | null`, single null writer, UI guard `match.reason_structured &&` + NaN mechanism (`comp.points / comp.max`) verified real; fix is the correct minimal one.
- **B.3 read parity** — toBucketRows reads the same economics triple as regen writeBucket.
- **Fit badge provenance** — binds `fit_percent`, never `score`.
- **tsc** — 0 errors. Baseline 549 targeted tests green pre-attack.

## Coverage Gaps (what we couldn't test)

- Full `npm test` — forbidden in this environment (machine-killer); targeted suites (549 tests) + 8 regression tests instead.
- Browser E2E — no markup changed; UI impact verified at binding level (skill principle #8). No Step 1.5 freshness record needed (no browser attack executed).
- `seed:all` end-to-end — needs LLM cache + raw corpus; statically verified. Regen `--dry` replay — `data/demo-seed.db` is a 0-byte placeholder in this worktree; skipped with note (plan anticipated).
- Concurrency — no new async window introduced; existing race suite green; no new race test.

## Deploy Gate (NOT covered by this review — verify before declaring "prod works")

This review covered the pre-merge DIFF only. It did NOT verify the deployed artifact. Before treating prod as working:

- [ ] Fresh build on the target machine from the merged commit (`NEXT_PUBLIC_*` baked at build; this diff adds no env vars, but the staged-build + atomic-swap deploy path per #940 still applies)
- [ ] Process restarted so env is re-read (`systemctl restart quantika-demo` — prod is systemd, not pm2)
- [ ] Data artifacts: this diff changes future seed builds (`seed:all` now chains regen) — if a seed re-apply is planned, run `regenerate-matches.ts --db <prod seed> --dry` FIRST against the real corpus (the skipped runtime check from this review), per the prod-write protocol (separate session, explicit permission formula)
- [ ] No DB migrations in this diff — nothing to apply
- [ ] Post-deploy smoke on the routes this diff touches: `/matches` (board + bucket tabs), `/match/[id]` (worksheet table present), `/dashboard`, and the demo flow login → `/processing` → back to `/matches` (the FINDING-001 path) — qa-walker

## Verdict

🚫 **BLOCK MERGE** — fix FINDING-001 (HIGH, introduced) before merge: make `refreshComputedColumns` null-preserving for `worksheet_json` (or attach worksheets to engine output), then re-run `tests/regression/persist-refresh-worksheet-clobber.test.ts` (must go green) plus the campaign suites. FINDING-002 may ride along or become a follow-up issue; FINDING-003/004 are informational.
