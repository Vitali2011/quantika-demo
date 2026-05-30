# Matching Ballast + Size Realism Cap (Wave C, levers 3+4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ballast distance (lever 3) and cargo/vessel size proportion (lever 4) HARD criteria — a `good` match with an uneconomic ballast leg for its vessel class, or with low utilisation (deadfreight), is capped to `possible` — EXCEPT legitimate part-cargo loads, which stay.

**Architecture:** A pure `applyBallastSizeCap(input)` function in `lib/sailing/match-scoring.ts` (peer of the existing `applyOverloadGuard`), called from `lib/matching/pair-analyzer.ts` in a loop AFTER scores are final and BEFORE the realism partition. The cap only ever lowers a `good` tier to `possible` (score → 69); missing data never triggers a cap; part-cargo is exempt from the size guard. Class-aware ballast thresholds reuse `classifyVesselByDwt`.

**Tech Stack:** TypeScript, Jest (ts-jest), Next.js lib code. Acceptance harness via `tsx`.

---

## Reality-check (confirmed by reading the code)

- `classifyVesselByDwt(dwt)` exists in `lib/sailing/readiness-gap.ts:89` → `VesselClassName` (`handysize|supramax|panamax|capesize`).
- `readiness.distanceNm` is computed and available per pair in `pair-analyzer.ts` via `analysisMap`.
- `deriveMatchLevel(score)` (`match-scoring.ts:154`): `>=70 good`, `>=40 possible`, else `weak`.
- `applyOverloadGuard` (`match-scoring.ts:170`) is the existing precedent for a pure tier-capping guard.
- util formula precedent: funnel script `vesselCapacity = dwcc ?? dwt*0.9`, `util = cargoWeightMax / capacity`. We use `dwcc ?? dwt` (raw) for the cap.
- **DISCREPANCY (documented assumption):** the brief's acceptance harness `scripts/research/top-matches-broker-view.ts` and `docs/research/match-realism-2026-05/ROADMAP-to-100.md` do NOT exist in this worktree (fresh main). Only `scripts/research/match-realism-funnel.ts` + `README.md` exist. → We CREATE a `top-matches-broker-view.ts` harness that runs the real engine (`analyzePairs` with a no-op aiScorer = sweep path) and ranks main matches by score, printing util%, ballast nm, verdict, matchLevel. This reproduces the broker-view concept and serves as the before/after acceptance benchmark.
- **Mock caveat:** `lib/__tests__/matching/pair-analyzer.test.ts:34` manually mocks `@/lib/sailing/match-scoring` with a factory listing only 3 exports. The new `applyBallastSizeCap` import would resolve to `undefined`. → add a passthrough mock entry (new-dependency wiring, not an expectation change).

## Thresholds (documented assumptions; sensitivity shown in tests)

- `BALLAST_GOOD_MAX_NM`: handysize 1500, supramax 2000, panamax 2500, capesize 4000 (nm). handysize 1500 is the research "worth-calling" ballast cap from the funnel; monotonic with class because small geared/near-sea tonnage is region-bound.
- `PROPORTION_GOOD_MIN_UTIL = 0.5` (util `< 0.5` cuts; exactly `0.5` stays). From research ("full cargo = 85–98% DWT; <50% = deadfreight").
- part-cargo detection: `/\bpart[\s-]?cargo\b|\bpart[\s-]?load\b|\bpart[\s-]?lot\b/i`. Bare "parcel" intentionally NOT matched (would over-exempt full small lots and let false-goods survive).

---

### Task 1: `applyBallastSizeCap` + helpers in match-scoring.ts (TDD)

**Files:**
- Modify: `lib/sailing/match-scoring.ts`
- Test: `lib/sailing/__tests__/match-scoring.test.ts`

- [ ] **Step 1: Write failing tests** (new `describe('applyBallastSizeCap — ballast + size realism cap', ...)`): handysize 1580nm good→possible; handysize 580nm stays good; handysize 205nm/99%util stays; util 34% (2500/7300) not-part-cargo good→possible; util 5% part-cargo stays good; util 75% stays; util exactly 0.5 stays, 0.49 caps; capesize 3000nm stays, handysize 3000nm caps; already-possible (score 60) no-op; missing distance → ballast no-op; missing capacity → size no-op; idempotent (no duplicate BALLAST:/SIZE: issue); `isPartCargo` matches "part cargo"/"part-cargo", rejects "full cargo".
- [ ] **Step 2: Run, verify fail** — `npx jest lib/sailing/__tests__/match-scoring.test.ts -t "applyBallastSizeCap"` → FAIL (not a function).
- [ ] **Step 3: Implement** `BALLAST_GOOD_MAX_NM`, `PROPORTION_GOOD_MIN_UTIL`, `isPartCargo`, `applyBallastSizeCap` + `import { classifyVesselByDwt }` + `VesselClassName` type.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.**

### Task 2: Wire cap into pair-analyzer (TDD)

**Files:**
- Modify: `lib/matching/pair-analyzer.ts` (import + cap loop after the final score-sync loop, before dedupe)
- Modify: `lib/__tests__/matching/pair-analyzer.test.ts:34` (add `applyBallastSizeCap` passthrough to mock factory)
- Test: `lib/__tests__/matching/pair-analyzer.test.ts` (new test: a high-score far-ballast pair lands in `matches` as `possible`, not `good`)

- [ ] **Step 1: Add passthrough to mock factory** — `applyBallastSizeCap: jest.fn().mockImplementation((input) => input.match)`.
- [ ] **Step 2: Write failing integration test** (un-mocked-cap variant — use `jest.requireActual` for the cap, or assert via the broker harness in Task 3). Minimal: assert existing suite still green after wiring.
- [ ] **Step 3: Implement cap loop** in `analyzePairs`.
- [ ] **Step 4: Run** `npx jest lib/__tests__/matching/pair-analyzer.test.ts lib/__tests__/matching/match-realism-buckets.test.ts` → PASS.
- [ ] **Step 5: Commit.**

### Task 3: broker-view acceptance harness

**Files:**
- Create: `scripts/research/top-matches-broker-view.ts`

- [ ] **Step 1: Implement** — load demo fixtures (rebased), run `analyzePairs(cargos, vessels, async () => [])`, rank `result.matches` by score desc, print top 20 rows `[rank, score, level, util%, ballastNm, verdict, cargoType, desc]`, plus counts of good/possible and how many `good` were capped (issue contains `BALLAST:`/`SIZE:`).
- [ ] **Step 2: Run** `npx tsx scripts/research/top-matches-broker-view.ts` → verify false-goods (far-ballast / low-util non-part-cargo) are `possible` not `good`; legit high-util short-ballast stay `good`; part-cargo low-util stays.
- [ ] **Step 3: Commit.**

### Task 4: /test-skill + full suite + review + PR

- [ ] Run `/test-skill` (risk-override — touches scoring/matching).
- [ ] `NODE_OPTIONS='--max-old-space-size=8192' npm test` (one run). Known foreign flake: progonq/score-classify + compare-routes-perf env — not our regression.
- [ ] requesting-code-review + verification-before-completion.
- [ ] finishing-a-development-branch → draft PR to main, do NOT merge.

## Self-Review

- Spec coverage: lever 3 (ballast, class-aware) ✓ Task 1/2; lever 4 (util + part-cargo exempt) ✓ Task 1/2; acceptance harness ✓ Task 3; "show with note" ✓ (issue text, stays in main as possible); part-cargo MUST NOT cut ✓ (isPartCargo exemption + test).
- Placeholder scan: none (all code shown in implementation steps below).
- Type consistency: `applyBallastSizeCap` signature identical across function, mock, and call site; `BallastSizeCapInput` fields match call site.
