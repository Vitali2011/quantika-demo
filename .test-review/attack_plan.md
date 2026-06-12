# Attack Plan: claude/compassionate-jennings-cb6e62

Branch: claude/compassionate-jennings-cb6e62
HEAD: dded0315
**Generated:** 2026-06-12
**Diff base:** 004edba2..HEAD (≡ main..HEAD; 10 commits, 14 files)

## Changed Files — classification

- `lib/matching/matches-repository.ts` (`refreshComputedColumns`, `refreshComputed` flag): **data-contract (dynamic UPDATE builder) + merger (refresh-vs-keep precedence) + cross-path-consistency trigger** (writes tce/fit/score/worksheet) → severity HIGH
- `lib/matching/persist-session-matches.ts` (first-wins dedup + `refreshComputed: true`): **merger (precedence invariant "first = best") + cross-path-consistency** → HIGH
- `lib/matching/compute-matches.ts` (full field set): **cross-path-consistency (parity invariant) + data-contract** → HIGH
- `lib/matching/session-buckets.ts` (engine-first economics): **cross-path-consistency + displayed-value-provenance (TCE + freight badge on bucket cards) + conditional-ui-liveness (freightBadge tone keyed on freight_rate_source)** → HIGH trigger, impact assessed MEDIUM
- `scripts/demo-seed/seed-all.ts` + `package.json` (regen chain): **data-contract (seed pipeline, spawnSync arg contract, no --dry)** → HIGH (statically verifiable)
- `scripts/demo-seed/real-matches.ts` (reasonStructured: null): **data-contract + displayed-value-provenance (NaN% bars claim)** → MEDIUM (legacy standalone script)
- `scripts/demo-seed/build.ts`: comment-only → skipped
- New test files: test-infra → reviewed as evidence, weak spots noted (source-regex tests for B.1/B.4; null-parity not value-parity for B.2)

## Ordered Attack Sequence (by severity)

1. **HIGH — ATTACK-1 (cross-path-consistency / B.6)**: `refreshComputed` clobbers `worksheet_json` (and bucketReason inside it) when the refresh source lacks a worksheet. Reachable chain verified by reading out-of-diff files: demo session hydrates matches WITH worksheets (`lib/demo-mode/hydrate-demo-session.ts:192`) → rows persisted with worksheet_json → user visits `/processing` (pipeline auto-runs on mount, `app/processing/page.tsx:178`) → `POST /api/ai/match` replaces `session.matches` with engine output (`app/api/ai/match/route.ts:163`) — engine NEVER attaches `m.worksheet` (zero occurrences in pair-analyzer.ts; admitted by in-diff NOTE in compute-matches.ts) → next `/matches`/`/dashboard` render → `persistSessionMatches` with `refreshComputed: true` → `UPDATE ... SET worksheet_json = NULL`. Consumers: `/match/[id]` comparison table (`app/match/[id]/page.tsx:82`), laycan_display (`app/matches/page.tsx:63`), bucket-reason card (`MatchesClient.tsx:835`). Pre-B.6 the INSERT OR IGNORE preserved the hydrated row. **Technique:** failing Jest test `tests/regression/persist-refresh-worksheet-clobber.test.ts` — persist hydrated-style match, then engine-style match for same pair; assert worksheet_json survives (campaign goal: "renders identically regardless of which path last touched it").
2. **HIGH — ATTACK-3 (cross-path value parity / B.2)**: campaign's own parity test checks only NULL-parity for most columns + 3 headline values. Harden to value-equality for ALL deterministic columns across both write paths (`tests/regression/write-path-value-parity.test.ts`). A value divergence (e.g. score rounding, reason text) violates the stated goal.
3. **MEDIUM — ATTACK-2 (merger precedence / c2e2c1a2)**: first-wins dedup trusts "engine sorted by fitPercent DESC" (verified: pair-analyzer.ts:775). Residual: undefined-fit / equal-fit duplicate ties keep array order, not best-score — verify this equals legacy INSERT OR IGNORE semantics (pre-existing tie choice, not introduced) with a documenting test in `tests/regression/persist-dedup-tie-semantics.test.ts`.
4. **MEDIUM — ATTACK-4 (provenance / B.3 half-landing)**: hydrate's `rowsToMatches` builds `economics` with ONLY `tceUsdPerDay` (no freight fields; its SQL doesn't even SELECT freight columns) → post-B.3 hydrated bucket rows = canonical TCE + NULL freight rate/source while distance is resolvable; `freightBadge(null)` renders "≈ Estimate" + dimmed on a canonical value. Pre-B.3 the row carried the estimate triple consistently. Technique: behavioral test `tests/regression/bucket-hydrate-freight-provenance.test.ts` + impact read of bucket card bindings (only `freight_rate_source` is rendered → badge tone unchanged; freight VALUE not rendered on cards).
5. **MEDIUM (static) — ATTACK-6 (data-contract / B.4)**: seed-all↔regen arg contract (`--db` parsed at regenerate-matches.ts:516/529 ✓), no LLM in regen (line 581 `async () => []` ✓), validators only assert LOW_MATCH_COUNT ✓, failure throws ✓. Runtime `--dry` replay: `data/demo-seed.db` in this worktree is a 0-byte placeholder → SKIP with note (plan Task 4 Step 7 anticipated absence).
6. **LOW (static) — ATTACK-7 (B.1)**: `reasonStructured: string | null` widened ✓ (real-matches.ts:190), single writer `null` ✓ (line 382), binding at 463 ✓; MatchesClient guard `match.reason_structured &&` verified (line 876) and `comp.points / comp.max` NaN mechanism confirmed (lines 893-898) — fix is real.
7. **LOW — refresh column/arg coupling audit**: manual count of sets[] vs args[] (18+conditionals, WHERE 4 params) — verified aligned by reading; campaign tests cover NULL-boundary both directions.

## Project Rules Applied

- `.claude/rules/ai-provider.md` → diff does not touch `lib/ai-provider.ts`; the new parity test mocks `callAiJson` (allowed; test-side only). No attack items.
- `.claude/rules/admin-api.md` → intersects nothing in this diff.
- `.claude/rules/retriever.md` → intersects nothing in this diff.

## Skipped (why)

- `docs/superpowers/plans/2026-06-12-write-path-convergence.md`: docs (it is the spec)
- `scripts/demo-seed/build.ts`: comment-only change (verified in diff)
- `package.json`: single script line; covered under ATTACK-6 contract check
- env-parity class: no env vars/flags added or renamed in this diff (`refreshComputed` is a code flag, not env)
- auth/html-sanitizer/llm-caller/prompt-builder/db-migration classes: no signals in diff (no new routes, no sanitizer, no prompt changes, no migrations)

## Coverage Notes

- Concurrency: refresh adds UPDATE-after-failed-INSERT; better-sqlite3 is synchronous in-process; existing `__tests__/matches-persist-race.test.ts` green on HEAD. No new async window introduced → no dedicated race test.
- Browser E2E: no component/route markup changed in this diff; all UI impact assessed via binding reads (provenance technique per skill principle #8). No running app required; no freshness check needed since no browser attack is executed.
- Legacy `createMatch` branches (pre-fit schemas) silently ignore `refreshComputed` — real DBs (prod/demo) have all migrations; noted, not attacked.
- fast-check not in repo → property-based attacks expressed as example-based Jest tests with adversarial fixtures.
