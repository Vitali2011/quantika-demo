VERDICT: APPROVE
Branch: claude/compassionate-jennings-cb6e62
HEAD: 3fd430ec

# Test Review Verdict: write-path convergence campaign (audit пункт Б, B.1–B.6)

**Date:** 2026-06-12 (re-validation; original BLOCK issued same day at HEAD dded0315)
**Reviewer:** test-skill (cold-start re-validation, regression-only mode, no feature-session context)
**Diff reviewed:** 004edba2..HEAD (campaign cumulative + fix commit `3fd430ec`)

## Re-validation (post-fix loop)

Fix commit `3fd430ec` ("fix(matches): null-preserving worksheet refresh + hydrate carries freight columns") touches exactly 3 files: `lib/matching/matches-repository.ts`, `lib/demo-mode/hydrate-demo-session.ts`, `tests/regression/bucket-hydrate-freight-provenance.test.ts`.

- **Judge integrity:** the repro test `tests/regression/persist-refresh-worksheet-clobber.test.ts` (and `write-path-value-parity` / `persist-dedup-tie-semantics`) were created by review commit `8c6dd016` and NOT modified by the fix — the failing judge that issued the BLOCK is the same one that now passes.
- **Pin-test rewrite (allowed, judged legitimate):** `bucket-hydrate-freight-provenance.test.ts` was rewritten from pinning the broken behavior to guarding the fixed behavior. It drives a real in-memory seed DB (matches table with `__demo_review__` sentinel row, migration-036 column shape) through the real `buildDemoSessionBlob` → real `toBucketRows` — the same chain `/matches` bucket tabs use (`app/matches/page.tsx → toBucketRows(session.lowConfidenceMatches, …)`). Not a synthetic shortcut. 4 tests: blob-level triple, end-to-end bucket row, residual NULL-freight honesty (no fabricated provenance), estimate-fallback control.

### Re-run results (raw numbers)

- 4 regression judge suites: **4/4 suites, 9/9 tests passed** (clobber 2, value-parity 1, dedup-tie 2, freight-provenance 4) — including the previously-failing FINDING-001 repro.
- `rtk jest lib/matching __tests__/lib/matching __tests__/matches-persist-race.test.ts`: **PASS 390, FAIL 0**.
- `rtk jest lib/demo-mode` (extra — fix touched hydrate): **PASS 10, FAIL 0**.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`: **EXIT=0**.

### Adversarial spot-check of the fix itself (no NEW breakage found)

- **Does COALESCE break a legitimate worksheet-clearing path?** No such path exists. Writers of `worksheet_json`: INSERT paths (`matches-repository.ts:230`, `regenerate-matches.ts:695`, `real-matches.ts:96` — fresh rows, unaffected); the only other UPDATE writer (`regenerate-matches.ts:301`) selects `WHERE worksheet_json IS NOT NULL` and writes merged JSON — never null. Clearing semantics in this codebase = row deletion (`deleteOrphanSessionMatches`, regen delete+reinsert), never UPDATE-to-NULL. `refreshComputed: true` has exactly one production caller (`persist-session-matches.ts:197`). When a refresh source HAS a worksheet (incl. the stale-laycan rebuilt one), COALESCE takes the new non-null value — the laycan-rebase path still updates. SET/arg coupling preserved (1 placeholder ↔ 1 arg).
- **Does the hydrate freight enrichment leak into persistSessionMatches' freight columns?** No — persist computes freight via `computeStoredMatchEconomics({ cargo, vessel, db, bunkerPriceUsdPerMt })` (`persist-session-matches.ts:90-95`) and never reads `m.economics`. Only production reader of `Match.economics.freightRate*` is `toBucketRows` (`session-buckets.ts:62-64`) — the intended FINDING-002 surface; `pair-analyzer.ts:823` reads only `tceUsdPerDay` (carried pre-fix). `EconomicsResult.freightRateSource` is plain `string?` — no union-type hazard. Schema-guard fallback (`NULL as freight_rate_…`) follows the existing optional-column pattern for old DBs.

### Non-gating notes from re-validation

- Residual data gap (now explicitly pinned by the rewritten test): a seed row with canonical TCE but genuinely NULL freight columns still renders "≈ Estimate" over a canonical TCE. This is a seed-DATA gap (regen rate backfill), not a code defect; honest direction.
- Doc nit: the comment at `hydrate-demo-session.ts:166-167` ("so persistSessionMatches can prefer it over a live recompute") is stale — persist never reads `m.economics`. Pre-fix campaign text, no behavior.

## Summary

- Tests added: 9 across 4 files under `tests/regression/` (8 at review time; freight-provenance grew to 4 in the fix)
- Bugs found: 4 (0 CRITICAL, 1 HIGH, 1 MEDIUM, 2 LOW)
- Pre-existing bugs noted: 1 (dedup tie semantics — does not block)
- Attack plan: fully executed (7 items; 1 runtime sub-step skipped with note — regen `--dry` against a 0-byte placeholder db, anticipated by the plan itself)

## Findings

### CRITICAL (blocks merge)

- (none)

### HIGH

- **FINDING-001 — ✅ FIXED in `3fd430ec`: `refreshComputed` clobbered `worksheet_json` when the refresh source carries no worksheet**
  - Original: `lib/matching/matches-repository.ts:454` unconditional `worksheet_json = ?` × `persist-session-matches.ts:197` `refreshComputed: true` → demo board lost comparison tables / bucket-reason / laycan rebase after one `/processing` visit.
  - Fix applied: `worksheet_json = COALESCE(?, worksheet_json)` — matches the verdict's fix hint exactly (null-preserving; "a null here means 'this writer has no worksheet', never 'clear the worksheet'").
  - Verified: unmodified repro test green (worksheet survives hydrated→engine re-persist; control proves engine-supplied fields still refresh — reason + fit_percent take the engine values).

### MEDIUM

- **FINDING-002 — ✅ FIXED in `3fd430ec`: hydrate's partial economics → hydrated bucket rows carried canonical TCE with NULL freight rate/source**
  - Original: `session-buckets.ts:62-64` economics-first read × `hydrate-demo-session.ts` producer supplying only `tceUsdPerDay` (SQL didn't SELECT freight cols) → "≈ Estimate" dimmed badge over a canonical TCE, seed-resolved rate dropped.
  - Fix applied: `MatchRow` + `selectCols` now include `freight_rate_usd_per_mt` / `freight_rate_source` (schema-guarded), `rowsToMatches` carries them into `economics` — the verdict's named follow-up, implemented at the producer.
  - Verified: rewritten pin test exercises the real chain (seed db → `buildDemoSessionBlob` → `toBucketRows`); the seed freight pair survives end-to-end; genuinely-missing seed rates stay NULL (no fabricated provenance).

### LOW / Test-bugs

- **FINDING-004 [OPEN — informational, does not gate]: `refreshComputed` silently ignored in legacy (pre-fit) schema branches of `createMatch`** (`lib/matching/matches-repository.ts:240+`) — all real DBs have migration 042+; doc comment states the restriction. Note only.
- No test-bugs: all 4 regression suites verified against spec invariants; all green on HEAD `3fd430ec`.

## Pre-existing Issues (informational, not gate-relevant)

- **FINDING-003 [OPEN — pre-existing semantics, pinned]: first-wins dedup tie cases are array-order, not score-aware** (`lib/matching/persist-session-matches.ts:64-70`) — equal/undefined-fit duplicates keep the array-first row even if a later one has higher score; regen's sibling dedup breaks ties by fit-then-score. Legacy INSERT OR IGNORE made the identical choice → pre-existing semantics, not introduced. Pinned in `tests/regression/persist-dedup-tie-semantics.test.ts`.

## What held up under attack (verified, no bug)

- **Value-level write-path parity (B.2)** — hardened beyond the campaign's null-parity: both write paths produce IDENTICAL VALUES across all 24 deterministic columns (`tests/regression/write-path-value-parity.test.ts`, passes).
- **B.6 mechanics** — refresh column/arg coupling (18+conditionals audited; re-audited post-fix: COALESCE keeps 1↔1), user_id NULL-boundary both directions, status/created_at/id preservation (campaign's own 4 tests, green).
- **B.4 contract** — seed-all→regen `--db` arg parsed; regen is LLM-free (`async () => []`); failure propagates; validators compatible.
- **B.1** — type widened to `string | null`, single null writer, UI guard `match.reason_structured &&` + NaN mechanism (`comp.points / comp.max`) verified real; fix is the correct minimal one.
- **B.3 read parity** — toBucketRows reads the same economics triple as regen writeBucket; post-fix the hydrate producer supplies the full triple.
- **Fit badge provenance** — binds `fit_percent`, never `score`.
- **tsc** — 0 errors on HEAD `3fd430ec`. 390 matching + 10 demo-mode + 9 regression tests green post-fix.

## Coverage Gaps (what we couldn't test)

- Full `npm test` — forbidden in this environment (machine-killer); targeted suites + regression tests instead.
- Browser E2E — no markup changed; UI impact verified at binding level (skill principle #8). No Step 1.5 freshness record needed (no browser attack executed).
- `seed:all` end-to-end — needs LLM cache + raw corpus; statically verified. Regen `--dry` replay — `data/demo-seed.db` is a 0-byte placeholder in this worktree; skipped with note (plan anticipated).
- Concurrency — no new async window introduced; existing race suite green (included in the 390); no new race test.

## Deploy Gate (NOT covered by this review — verify before declaring "prod works")

This review covered the pre-merge DIFF only. It did NOT verify the deployed artifact. Before treating prod as working:

- [ ] Fresh build on the target machine from the merged commit (`NEXT_PUBLIC_*` baked at build; this diff adds no env vars, but the staged-build + atomic-swap deploy path per #940 still applies)
- [ ] Process restarted so env is re-read (`systemctl restart quantika-demo` — prod is systemd, not pm2)
- [ ] Data artifacts: this diff changes future seed builds (`seed:all` now chains regen) — if a seed re-apply is planned, run `regenerate-matches.ts --db <prod seed> --dry` FIRST against the real corpus (the skipped runtime check from this review), per the prod-write protocol (separate session, explicit permission formula)
- [ ] No DB migrations in this diff — nothing to apply
- [ ] Post-deploy smoke on the routes this diff touches: `/matches` (board + bucket tabs — freight badge on hydrated bucket rows should now show the seed source, not "≈ Estimate", where the seed has a rate), `/match/[id]` (worksheet table present), `/dashboard`, and the demo flow login → `/processing` → back to `/matches` (the FINDING-001 path: comparison table must survive) — qa-walker

## Verdict

✅ **APPROVE** — BLOCK lifted. FINDING-001 (HIGH) and FINDING-002 (MEDIUM) are fixed in `3fd430ec`, verified by the unmodified repro judge plus a legitimately-rewritten pin test that exercises the real production chain; adversarial spot-check of the fix found no new breakage (no legitimate worksheet-clearing path is harmed by COALESCE; persist's freight computation is independent of the hydrate enrichment). FINDING-003/004 remain informational (pre-existing / legacy-schema note). Deploy Gate above still applies post-merge.
