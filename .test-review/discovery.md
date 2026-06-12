# Discovery: claude/compassionate-jennings-cb6e62

Branch: claude/compassionate-jennings-cb6e62
HEAD: dded0315
Date: 2026-06-12
Diff range: 004edba2..HEAD (campaign cumulative; 004edba2 = merge-base with main, so ≡ main..HEAD)
Commits: 10 — "fix(buckets): bucket rows read canonical engine economics instead of flat-bunker estimate (audit B.3)" ... "docs(plans): write-path convergence plan (audit пункт Б)"

## Changed Files

- `docs/superpowers/plans/2026-06-12-write-path-convergence.md` (added, +734) — the campaign plan (spec source)
- `lib/matching/compute-matches.ts` (modified, +32/-0)
  - Modified: `computeAndPersistMatches()` — adds `bucketReason`/`worksheetForPersist` derivation; extends `createMatch` call with `fit_percent`, `fit_breakdown`, `cargo_item_index`, `vessel_item_index`, `worksheet_json`, `breakeven_tce_usd_per_day`
- `lib/matching/matches-repository.ts` (modified, +54/-0)
  - Added: `refreshComputedColumns()` (private), `CreateMatchInput.refreshComputed?: boolean`
  - Modified: `createMatch()` — `result.changes === 0 && input.refreshComputed` → in-place UPDATE (only in `hasFitColumns` branch)
- `lib/matching/persist-session-matches.ts` (modified, +18/-1)
  - Modified: `persistSessionMatches()` — first-wins dedup by `cargoEmailId|vesselEmailId` before loop; passes `refreshComputed: true` to `createMatch`
- `lib/matching/session-buckets.ts` (modified, +18/-5)
  - Modified: `toBucketRows()` — reads `m.economics?.{tceUsdPerDay,freightRateUsdPerMt,freightRateSource}` first; legacy flat-bunker estimate only as fallback when `tce_usd_per_day == null`
- `package.json` (modified, +1) — new script `seed:regen: tsx scripts/demo-seed/regenerate-matches.ts`
- `scripts/demo-seed/build.ts` (modified, +5/-1) — comment-only banner (LEGACY BOOTSTRAP MATCHES)
- `scripts/demo-seed/real-matches.ts` (modified, +12/-3) — `reasonStructured: JSON.stringify(fb)` → `reasonStructured: null`; header deprecation banner
- `scripts/demo-seed/seed-all.ts` (modified, +18/-5) — chains `regenerate-matches.ts --db <outDb>` via spawnSync between build and validate; renumbers log lines 1/5..5/5 → 1/6..6/6
- New tests (campaign's own):
  - `lib/matching/__tests__/matches-repository-refresh.test.ts` (+196) — 4 refreshComputed tests + 1 first-wins dedup test
  - `lib/matching/__tests__/session-buckets-economics.test.ts` (+78) — 3 tests (engine-first, null fallback, estimate fallback)
  - `lib/matching/__tests__/write-path-field-parity.test.ts` (+193) — 1 parity test (21 columns, both write paths)
  - `scripts/demo-seed/__tests__/real-matches-item-index.test.ts` (+15) — source-level regex assertion (B.1)
  - `scripts/demo-seed/__tests__/seed-all-window.test.ts` (+20) — source-level assertions (B.4)

## Stated Scope

Source: `docs/superpowers/plans/2026-06-12-write-path-convergence.md`

In scope (verbatim goal): "Make every writer of `matches` rows produce the same shape and the same economics convention, so a match renders identically regardless of which path (live precompute, /matches render, bucket tabs, seed regen, legacy seeders) last touched it."

Out of scope (verbatim): W5 refactor (`reason_structured` → fitBreakdown end-to-end + UI panel consolidation); rewriting `build.ts`'s matches stage on the real engine; migration-044 one-match-per-email-pair product decision (audit A.1); prod deploy / seed re-apply.

Audit traceability: B.1 → Task 3 (real-matches reason_structured) · B.2 → Task 2 (precompute field parity) · B.3 → Task 1 (bucket economics) · B.4/B.5 → Task 4 (seed-all regen chain) · B.6 → Task 5 (refreshComputed).

Note: commit `c2e2c1a2` ("fix(persist): first-wins dedup per email pair so refreshComputed cannot demote to a worse duplicate") is an ADDITIONAL fix not in the plan tasks — discovered during implementation; plan's Task 5 did not anticipate the duplicate-email-pair × refreshComputed interaction.

## Specs Covered (invariants, verbatim where possible)

From `docs/superpowers/plans/2026-06-12-write-path-convergence.md`:

- T1/B.3: bucket rows use canonical engine economics (`m.economics`) when present; "falls back to null (not a fabricated number) when engine economics and ports are both absent"; legacy estimate only when economics absent AND distance resolvable.
- T2/B.2: "precompute and session-persist write the SAME columns for the same match" — PARITY_COLUMNS list incl. fit_percent, fit_breakdown, worksheet_json, breakeven_tce_usd_per_day; numeric agreement on fit_percent/tce/breakeven.
- T3/B.1: real-matches must NOT write FitBreakdown into reason_structured ("UI expects legacy {points,max}"; NaN% bars otherwise); `reasonStructured: null`.
- T4/B.4/B.5: seed-all chains regenerate-matches after build; `npm run seed:all` now produces the same matches as the manual regen; regen step failure throws.
- T5/B.6: `refreshComputed` "NEVER touches status (user action), created_at, or identity columns. Opt-in: only the per-session persist path passes it; seed/regen writers keep pure INSERT OR IGNORE semantics." Refresh respects user_id boundary (NULL seed row vs session copy).
- Post-plan invariant (commit c2e2c1a2): "Engine matches arrive sorted by fitPercent DESC; with refreshComputed a later duplicate (same email pair, different item index) would overwrite the better earlier row (last-wins). Keep the first (best) per unique key."
- Plan ground truth claim: `app/matches/MatchesClient.tsx:876-898` — UI expects legacy ScoreBreakdown (`comp.points / comp.max`); guards on `match.reason_structured &&` so null hides the panel gracefully.
- Plan ground truth claim: `regenerate-matches.ts:714` writes reason_structured from legacy `m.scoreBreakdown` (correct shape).
- compute-matches.ts NOTE (in-diff comment): "m.worksheet is currently absent on engine output (only demo hydrate/regen attach worksheets), so this block is forward-parity; the demo-hydrated gap on existing rows is closed by refreshComputed (B.6)."

## Project Rules (inventory for Phase 2)

- `.claude/rules/ai-provider.md` — scope `lib/ai-provider.ts`: NOT in diff (mocked in a new test only). No path intersection.
- `.claude/rules/retriever.md` — scope `lib/knowledge/embeddings/retriever*`: no intersection.
- `.claude/rules/admin-api.md` — scope `app/api/admin/**` + middleware.ts: no intersection.

## Existing Test Coverage (Baseline)

- `lib/matching/__tests__/` + `scripts/demo-seed/__tests__/`: 487 tests — BASELINE OK (rtk jest, 0 fail)
- `__tests__/api/compute-matches*.test.ts`, `__tests__/matches-persist-race.test.ts`, `__tests__/persist-session-matches-applied-cap.test.ts`, `__tests__/lib/matching/`: 62 tests — BASELINE OK
- Overall baseline: 549 passed, 0 failed (targeted suites; full `npm test` forbidden by environment).
- Relevant pre-existing suites: `matches-repository*.test.ts` (insert/list semantics), `persist-session-matches-*.test.ts` (fit/m3/DA parity/worksheet filters), `__tests__/matches-persist-race.test.ts` (concurrency), `__tests__/api/compute-matches.test.ts` (precompute endpoint path).

## Red Flags (raw observations, no classification)

- `refreshComputedColumns()` builds SQL from a `sets` array + positional args — column/arg count coupling is manual (18 base + up to 7 conditional); any drift = wrong-column writes. New symbol, has tests.
- `refreshComputedColumns` is only wired in the `hasFitColumns(db)` branch of `createMatch`; the two legacy branches (hasVesselNameColumns / else) silently ignore the flag.
- `persistSessionMatches` dedup key is `cargoEmailId|vesselEmailId` but cargo/vessel lookup key is `emailId|itemIndex` — dedup drops later item-index matches entirely.
- `toBucketRows` engine-first read keys off `tce_usd_per_day == null` only — if economics has tce but null freight fields, mixed-source row possible (freight stays null while estimate path skipped).
- seed-all regen spawnSync: `regenerate-matches.ts --db <outDb>` — flag contract with regenerate-matches.ts arg parser unverified in diff (source-level test only checks the string "regenerate-matches.ts" appears).
- `compute-matches.ts` worksheet block: in-diff NOTE admits `m.worksheet` is currently always absent on engine output → worksheet_json from precompute is always NULL today (forward-parity only). Parity test passes because BOTH paths write null worksheet.
- `write-path-field-parity.test.ts` asserts null-parity (aNull === bNull) for most columns; exact equality only for fit_percent/tce/breakeven — value drift in other columns (e.g. reason, score) would pass.
- No fast-check in repo (property-based testing not available without adding a dep).
- `real-matches.ts` is standalone-legacy (per plan: not referenced by package.json or seed-all) — changed line is in a `main()` that only runs when invoked directly.
- Campaign's seed tests for B.1/B.4 are source-regex assertions, not behavioral.
