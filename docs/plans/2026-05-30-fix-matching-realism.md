# Fix Matching Realism — Implementation Plan

**Date:** 2026-05-30
**Branch:** `fix/matching-realism`
**Brief:** [`docs/handovers/2026-05-30-fix-matching-realism.md`](../handovers/2026-05-30-fix-matching-realism.md)
**Research:** [`docs/research/match-realism-2026-05/README.md`](../research/match-realism-2026-05/README.md)

## Overview

The matcher surfaces ~450–1400 "matches" on the 79×51 demo set, but only dozens are
real "worth-calling" candidates. The bulk is sweep residue, un-cutoff `weak` pairs,
`idle` vessels (open year before laycan), and `unknown` (un-evaluable) pairs shown as
weak matches. This plan moves those into separate buckets so the main list shows only
good/possible candidates with meaningful timing — **without losing any data**.

Scope = research levers **1 + 2 + 5** only.

## Current State

Engine entry point: `lib/matching/pair-analyzer.ts` → `analyzePairs(cargos, vessels, aiScorer, opts)`
returns `{ matches, blockedMatches }`.

- `analyzePair` (pair-analyzer.ts:53–144) computes readiness + hard filters; sets
  `filterOut` for hard-filter fail / bad dates / `late` verdict / blocking sanctions.
  `late` is **already** a hard filter (line 124) → goes to `blockedMatches`.
- Sweep (pair-analyzer.ts:358–453): every filter-passing pair the LLM didn't return is
  re-added as a match with a deterministic score. **No score cutoff** anywhere (line 449
  derives level but nothing is dropped).
- Scoring (`lib/sailing/match-scoring.ts`): base physical 40–70; readiness adj
  `ideal +20 / tight +10 / idle −15 / late −30 / unknown 0`; `deriveMatchLevel`:
  ≥70 good, ≥40 possible, else weak.
- Readiness verdicts (`lib/sailing/readiness-gap.ts`): non-spot `idle` = gap > 5d;
  spot `idle` = gap > `SPOT_IDEAL_MAX_GAP_DAYS` (30); `unknown` = missing date/port/distance.
- Output flows to `session.matches` via `updateSession` from two callers:
  `app/api/ai/match/route.ts` (POST) and `lib/matching/compute-matches.ts`
  (auto-trigger in `app/api/ai/parse-vessel/route.ts`). UI reads `session.matches`
  through `app/api/state/route.ts` (`matchCount`).

**Measured baseline (offline scorer = deterministic sweep ≈ what the app shows):**

| today | `matches.length` | ideal | tight | unknown | idle |
|---|---|---|---|---|---|
| 2026-05-30 (app default) | 638 | 58 | 11 | 682* | rest |
| 2026-05-01 (best case)   | 1402 | 139 | 19 | 883 | 361 |

(*today's per-verdict print was display-truncated; totals are exact.)

## Desired End State

`analyzePairs` returns `{ matches, lowConfidenceMatches, insufficientData, blockedMatches }`:

- **`matches`** (main "worth calling"): good/possible, evaluable, timing OK.
- **`lowConfidenceMatches`** ("manual review"): `weak` score **or** `idle` with large gap.
- **`insufficientData`** ("not enough data"): `unknown` verdict.
- **`blockedMatches`**: unchanged (hard-filter / date / late / sanctions).

**Measured target after partition** (simulated on current output):

| today | main `matches` | lowConfidence | insufficientData |
|---|---|---|---|
| 2026-05-30 (app default) | **49** | … | … |
| 2026-05-01 (best case)   | 100 | 345 | 883 |

Every pair that previously appeared in `matches` lands in exactly one of the three new
buckets (no data lost). The main count drops from ~638 → ~49 at the app's default date.

## Key Discoveries

- `late` is already hard-filtered; the brief's "idle hard like late" = exclude large-gap
  idle from the main list the same way (but **preserve** it in a bucket, not `null`).
- `unknown` pairs score ≥40 (adjustment 0 → "possible"), so a pure score cutoff would NOT
  remove them → lever 5 must key on verdict, before the score cutoff.
- `idle` can score ≥40 when utilization is high (e.g. `idle` +util ⇒ "possible"), so a pure
  score cutoff would NOT remove idle either → lever 2 must key on verdict+gap, before cutoff.
- At the demo set, `idle gap>21 == idle gap>30 == 333` (no idle pairs land in 22–30d), so the
  exact idle threshold is outcome-neutral here; choose **21** per brief rationale ("owner
  won't wait 3+ weeks").
- The sweep test `app/api/ai/match/__tests__/deterministic-sweep.test.ts` is a **self-contained
  copy** of the sweep algorithm, NOT an import of the engine. It pins old "weak sweep is a
  match" behavior and must be re-pointed at the new contract.

## What We're NOT Doing

- Lever 3 (ballast cutoff), lever 4 (size/part-cargo), lever 6 (refresh demo data).
- No change to `runHardFilters`, `calculateReadinessGap` classification, or the scoring math.
- No UI redesign of the matches page (only surface the new buckets in the state payload).
- No new external integrations. No incidental refactors.

## Approach

Implement the three levers as a **single post-processing partition** at the end of
`analyzePairs`, operating on the already-built `matches` array. This is the most surgical
option: it touches neither the sweep internals, the LLM path, the scoring, nor readiness-gap
classification. It reuses existing fields (`readiness.verdict`, `readiness.gapDays`,
`matchLevel`).

Classification order (first match wins):
1. `verdict === 'unknown'` → `insufficientData` (lever 5; before cutoff since unknown scores ≥40)
2. `verdict === 'idle' && gapDays != null && gapDays > IDLE_HARD_MAX_GAP_DAYS` → `lowConfidenceMatches` (lever 2; before cutoff since high-util idle scores ≥40)
3. `matchLevel === 'weak'` → `lowConfidenceMatches` (lever 1)
4. else → `matches` (main)

`IDLE_HARD_MAX_GAP_DAYS = 21`. Documented relationship to `SPOT_IDEAL_MAX_GAP_DAYS` (30):
the spot constant governs the verdict *classification* boundary (when a spot vessel flips
ideal→idle); `IDLE_HARD` governs the *exclusion* boundary (when an idle pair is too idle to
show). 21 < 30 ⇒ any spot vessel already classified idle (gap>30) is also excluded; a
non-spot vessel idle 6–21d stays (penalized) while ≥3-week idle is bucketed.

## Stage 1: Partition logic in `analyzePairs` (engine) — TDD

### Goal
`analyzePairs` returns the three new buckets; main list excludes unknown / large-idle / weak;
no pair lost.

### Changes

#### `lib/matching/pair-analyzer.ts`
- Add `export const IDLE_HARD_MAX_GAP_DAYS = 21;` with the reconciliation comment importing
  `SPOT_IDEAL_MAX_GAP_DAYS` for reference.
- Extend the return type to `{ matches, lowConfidenceMatches, insufficientData, blockedMatches }`.
- After the existing `matches.sort(...)` (line ~552), partition `matches` into the three
  arrays per the classification above; return them (each kept sorted by score desc, which it
  already is since we filter a sorted array).
- Early-return empty case (line 173–175) returns all four arrays empty.

### Verification
- [ ] Automated: `NODE_OPTIONS='--max-old-space-size=8192' npx jest lib/__tests__/matching/pair-analyzer.test.ts app/api/ai/match/__tests__/deterministic-sweep.test.ts` — new partition tests green.
- [ ] Automated (demo realism): a new engine test over `demo-parsed-*.json` at `today=2026-05-01`
      asserts `matches.length < 200` (was 1402), `> 0`; no `unknown` and no `idle gap>21` in
      main; `insufficientData.length > 0`; `lowConfidenceMatches.length > 0`; and
      `main+lowConf+insufficient` == old non-blocked total.

## Stage 2: Thread buckets through callers + session

### Goal
Buckets reach the session and the state payload so the moved pairs are retrievable (not lost),
and the user-visible `matchCount` reflects only the main list.

### Changes

#### `lib/types.ts`
- `SessionData`: add `lowConfidenceMatches?: Match[]` and `insufficientData?: Match[]`.

#### `lib/matching/compute-matches.ts`
- `ComputeMatchesResult`: add the two bucket fields; destructure + return them.

#### `app/api/ai/match/route.ts`
- Capture the two new buckets; `updateSession(..., { matches, lowConfidenceMatches, insufficientData, blockedMatches })`;
  include their counts in the JSON response.

#### `app/api/ai/parse-vessel/route.ts`
- Capture + persist the two new buckets in the auto-trigger `updateSession` call.

#### `app/api/state/route.ts`
- Surface `lowConfidenceMatches`, `insufficientData`, and their counts in the state payload.

### Verification
- [ ] Automated: `NODE_OPTIONS='--max-old-space-size=8192' npx jest app/api/ai/match` — route tests green.
- [ ] `npx tsc --noEmit` clean (no type errors from the widened return type).

## Stage 3: Reconcile pinned-old-behavior tests (new contract)

### Goal
Tests that pinned "weak sweep pairs are matches" / ">400 matches" are rewritten to the new
contract, with documented rationale (not adjusted-to-pass).

### Changes
- `tests/integration/matching-pipeline.test.ts`: β-09 guarantees "≥1 match exists" — keep that
  intent but assert against the union (main ∪ lowConfidence ∪ insufficient) since the offline
  sweep fallback for a single compatible idle/tight pair may now land in a bucket. Document why.
- `app/api/ai/match/__tests__/deterministic-sweep.test.ts`: the copied sweep mirror pins old
  behavior; re-point its assertions to the new partition contract (weak/idle-large/unknown →
  buckets) **or** narrow it to still-valid sweep mechanics. Document the contract change in the
  file header.
- Any other red test from the full run: triage — fix product bug vs. update old-contract
  expectation (documented).

### Verification
- [ ] Automated: full suite `NODE_OPTIONS='--max-old-space-size=8192' npm test` green.

## Risks & Mitigations

- **Risk:** A consumer assumes `matches` still contains weak/idle/unknown. **Mitigation:** all
  three are preserved in session + state; grep confirms only `state`/UI read `session.matches`
  for count.
- **Risk:** β-09 "≥1 match" regression if the single demo pair now buckets. **Mitigation:**
  Stage-3 asserts on the bucket union; the data still exists.
- **Risk:** idle threshold disagreement. **Mitigation:** outcome-neutral on demo (21≡30 here);
  documented constant + comment; changeable in one place.

## Verification Strategy

1. Engine unit + realism test (Stage 1) proves the partition and the count drop on real demo data.
2. `tsc --noEmit` + route/integration tests (Stage 2–3) prove the wiring.
3. Final full `npm test` green.
4. Re-run `scripts/research/match-realism-funnel.ts` as the orientation cross-check (unchanged
   research tool; baseline still 1402 — confirms we didn't move the engine math, only the
   bucketing).
