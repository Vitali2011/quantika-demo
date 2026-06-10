# TCE / Economics Unification — Implementation Plan

> **Wave 2 — H1 / H3 / M2 / M6**
> Author: orchestrator + plan-tce-econ subagent
> Date: 2026-06-10
> Status: PROPOSED — staged execution, code not yet touched
> Sources: `recon-tce-paths.md`, `recon-tce-diverge.md`, `recon-tce-design.md`

---

## 1. Problem Statement

Post-Wave-1 (C1 `cb66a329` fixed PATCH bunker price; H4/H5 added DB WAL + getDb singleton), four structural issues remain in the TCE / economics pipeline. They are all confirmed by recon:

| Tag | Issue | Surface impact |
|-----|-------|----------------|
| **H1** | Vessel value computed two ways: stored path hardcodes `DEFAULT_VESSEL_VALUE_USD=22M`, detail path uses `estimateVesselValueUsd(dwt)`. | War-risk premium + `totalUsd` diverge by $4k–$10k for HRA routes (Aden→Mundra). Broker sees two different P&L for same voyage. |
| **H3** | `analyzePairs()` called without `bunkerPriceUsdPerMt` at `compute-matches.ts:55` and `app/api/ai/match/route.ts:110` → board-demote floor uses `DEFAULT_BUNKER=600` while live VLSFO is ~$791. | Pairs passing breakeven floor at $600 may fail at live $791. False "worth calling" on board. |
| **M2** | `computeEconomics` (`lib/economics/index.ts`) has 0 live callers — pure dead code with `estimatedDays=20` hardcode + duplicate `EUR_TO_USD=1.08`. | Maintenance trap + drift source. |
| **M6** | Three independent copies of class breakeven thresholds (1.5k / 3k / 5.5k / 7.5k by DWT) at `fit-breakdown.ts:458-461`, `fit-breakdown.ts:480-483`, `pair-analyzer.ts:829-832`. Stale cross-ref comment already drifted. | Future formula change must be applied in three places; one will be missed. |

The deeper structural root-cause behind H1/H3 is that **TCE/economics is computed in 5 competing entry-points** with overlapping responsibilities and partial-default semantics. Until a single canonical owner exists with explicit-input contract, divergences will recur every time someone adds a new caller.

---

## 2. Goal

Unify all TCE/economics computation onto a single canonical owner with an explicit-input API (no positional defaults that callers silently inherit) and remove confirmed structural drift sources, **without changing any HIGH-risk pinned numeric assertion** unless the change is deliberate and noted.

### Non-goals (out of scope)
- New economics rules (canal logic, ETS coverage, war-risk zone list) — only refactor existing logic.
- D1 (`session-buckets.ts` no-canal/no-DA/no-EUA) — tracked separately, distinct semantic decision.
- D5 (detail bunker port ≠ stored bunker port) — UX problem, not structural.
- The dead `/api/economics` route (already removed in W9 / `ec32176d`).
- `lib/economics/voyage-calculator.ts:31` `EUR_TO_USD=1.08` duplicate — flagged but not part of this PR (separate constants-consolidation pass).
- Renaming `calculateTCE` / `computeEstimatedTce` symbols globally (downstream churn) — keep names, change internals.

---

## 3. Canonical Owner — Proposed API

Single canonical function lives in **`lib/economics/compute-tce.ts`** (new file).

```typescript
// lib/economics/compute-tce.ts

export interface TceInputs {
  // Vessel
  dwt: number;
  valueUsd: number;                 // vessel hull value — war-risk premium base
  speedKts: number;
  consumptionMtPerDay: number;

  // Cargo & route
  freightRateUsdPerMt: number;
  quantityMt: number;
  distanceNm: number;
  ballastDistanceNm?: number;

  // Prices — all explicit, NO hidden defaults
  bunkerPriceUsdPerMt: number;      // VLSFO — required, no fallback
  euaPriceEur: number;              // 0 if no EU routing

  // Pre-resolved costs (canal / DA modules run upstream)
  canalUsd: number;
  daUsd: number;

  // EU ETS
  euLegPercent?: number;
  originEu?: boolean;
  destEu?: boolean;

  // War risk
  daysInHra?: number;
  excludeWarRiskFromDailyTce?: boolean;

  // Optional metadata
  ecaZones?: EcaZone[];
}

export interface TceResult {
  tceUsdPerDay: number;
  durationDays: number;
  breakdown: TCEBreakdown;          // existing type from voyage-calculator.ts
}

/**
 * Single canonical TCE / economics computation.
 * Pure, synchronous, deterministic. All inputs explicit.
 *
 * Replaces internals of: calculateTCE, computeEstimatedTce,
 *                       buildMatchEconomics (inner core).
 */
export function computeTce(inputs: TceInputs): TceResult;
```

### Key invariants
1. **No silent defaults for prices.** Missing bunker / vessel-value at a call site becomes a TypeScript compile error, not a runtime fallback to 600 / 22M.
2. **Pure & sync.** No DB, no network. Callers resolve canal / DA / EUA / bunker upstream (existing pattern in `stored-match-economics.ts`).
3. **`excludeWarRiskFromDailyTce` survives.** Behaviour must match the live default (`true` on stored path, plumbed through to detail-path via `/api/voyage/tce`).
4. **Vessel value is always caller-provided** — the canonical owner has no internal fallback. Callers that don't have a real value pick a policy: stored path uses `estimateVesselValueUsd(dwt)` (post-fix), seed/test fixtures pass a literal.

### Call-site adapters (existing functions kept as thin shims for migration)

| Existing symbol | Post-unification role |
|-----------------|----------------------|
| `calculateTCE(VoyageInput)` in `voyage-calculator.ts` | Adapter — maps `VoyageInput` → `TceInputs`, delegates to `computeTce`. Public API surface unchanged. |
| `computeEstimatedTce(...)` in `tce-calculator.ts` | Adapter — maps positional args → `TceInputs`, delegates to `computeTce`. **Throws** if `bunkerPriceUsdPerMt` is `undefined` (replaces the silent 600 default). |
| `buildMatchEconomics(MatchEconomicsInput)` | Stays as canal-resolution + war-risk wrapper; inner numerics go via `computeTce`. |
| `computeStoredMatchEconomics(...)` | Stays as DB-write layer; resolves vessel value via `estimateVesselValueUsd(dwt)` before delegating. |

---

## 4. Call-Site Inventory (to migrate)

Pulled from recon paths/design files. Each entry = one site touched by the unification work.

### H1 fix — vessel value plumbing

| File:line | Today | Post-unify |
|-----------|-------|------------|
| `lib/matching/tce-calculator.ts:39` | `const DEFAULT_VESSEL_VALUE_USD = 22_000_000;` | Removed. (Or kept only as legacy compat for seed fixtures with deprecation comment.) |
| `lib/matching/tce-calculator.ts:347,355` | `vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD` | `vesselValueUsd: input.vesselValueUsd` — required field. |
| `lib/matching/stored-match-economics.ts:149-170` | `buildMatchEconomics({ ... })` — no `vesselValueUsd` key. | Add `vesselValueUsd: estimateVesselValueUsd(dwt)`. |
| `components/match/EconomicsTab.tsx:271,335` | Already passes `estimateVesselValueUsd(dwt)`. | Unchanged (already correct). |
| `lib/matching/persist-session-matches.ts:38` | Calls `computeStoredMatchEconomics` w/ no vessel value. | Inherits fix from stored-match-economics. |
| `lib/matching/compute-matches.ts:21` | Same — inherits. | Same. |
| `app/api/matches/[id]/route.ts:~192` | Same — inherits. | Same. |

### H3 fix — bunker price into analyzePairs

| File:line | Today | Post-unify |
|-----------|-------|------------|
| `lib/matching/compute-matches.ts:55` | `await analyzePairs(cargos, vessels, aiScorer, { db })` — no bunker. | `await analyzePairs(cargos, vessels, aiScorer, { db, bunkerPriceUsdPerMt })`. Bunker is already fetched at lines 62–67 — **hoist that fetch above line 55**. |
| `app/api/ai/match/route.ts:110` | `await analyzePairs(..., { refYear, today, db })` — no bunker. | `await analyzePairs(..., { refYear, today, db, bunkerPriceUsdPerMt: getLatestBunkerPrice(db,'NLRTM','VLSFO')?.price_usd_per_mt })`. Floor check uses live price; `null` only if DB row truly missing → fall back to telemetry warn + use 600 explicitly (no silent default). |
| `lib/matching/pair-analyzer.ts:306` | `const bunkerPriceUsdPerMt = options?.bunkerPriceUsdPerMt;` → undefined. | Same line — but downstream `computeMatchEconomicsFor` will now receive a real number (or emit a `warn` if still undefined after the call-site fixes). |
| `lib/matching/pair-analyzer.ts:823-842` | Breakeven floor: `if (floorTce < breakeven) → demote`. | Logic unchanged; just receives correct `floorTce`. |

### M2 fix — dead code delete

| File | Action |
|------|--------|
| `lib/economics/index.ts` | **DELETE** (only `computeEconomics` — confirmed 0 live callers). |
| `lib/economics/__tests__/index.test.ts` | **DELETE** (tests the dead function). |
| `lib/economics/__tests__/compute-economics-real-math.test.ts` | **DELETE** (tests the dead function). |
| `.pipeline/phase_3_qi.md:103` | Update doc reference. |
| `docs/audits/2026-05-28-test-coverage-audit.md` | Note in audit appendix that `computeEconomics` was removed. |

### M6 fix — extract breakeven thresholds

| File:line | Action |
|-----------|--------|
| `lib/sailing/fit-breakdown.ts:458-461` (`economicsNorm`) | Replace inline ladder with `breakevenTceByDwt(dwt)` import. |
| `lib/sailing/fit-breakdown.ts:480-483` (`scoreEconomics`) | Same. |
| `lib/sailing/fit-breakdown.ts:446` | Remove stale cross-ref comment "match pair-analyzer.ts:835-838" (already drifted). |
| `lib/matching/pair-analyzer.ts:829-832` | Replace inline ladder with `breakevenTceByDwt(dwt)` import. |
| **NEW** `lib/economics/breakeven-thresholds.ts` | Create exported `breakevenTceByDwt(dwt: number): number`. |

---

## 5. Staged Execution

Ordered **lowest-risk → highest-risk**. Each stage has a single verifiable goal. Each stage is its own PR.

### Stage 0 — This plan (PR #current)
**Goal:** plan reviewed, merged. No code changes.
**Verify:** PR opens, reviewer approves, merged to `main`.

### Stage 1 — M2 dead-code delete
**Scope:** `lib/economics/index.ts` + its 2 test files.
**Goal:** zero behaviour change; confirm with grep + typecheck + jest.
**Pre-removal grep (mandatory):**
```bash
grep -rn "from.*economics/index\|require.*economics/index" lib/ app/ scripts/ components/
grep -rn "computeEconomics\b" lib/ app/ scripts/ components/ __tests__/
```
Expected: only matches in the 2 deleted test files + 1 audit doc + 1 pipeline doc.
**Verify:** `npx tsc --noEmit`, `npm test`, full regression. **No HIGH-risk test touched.**
**Risk:** very low. Recon confirms 0 live callers.

### Stage 2 — M6 extract breakeven thresholds
**Scope:** new file `lib/economics/breakeven-thresholds.ts` (1 exported function), 3 call-sites updated, 1 stale comment removed.
**Goal:** single source of truth for `1.5k / 3k / 5.5k / 7.5k` ladder. No numeric change.
**Tests to keep green (HIGH risk):**
- `lib/sailing/__tests__/fit-breakdown-economics.test.ts:189,217,227,234` — pins all 4 class breakevens. **Must stay green unchanged.**
**Verify:** affected `findRelatedTests` + full `fit-breakdown-economics` + `pair-analyzer` suites.
**Risk:** low. Pure extraction; numbers identical; type system proves all 3 sites point to the same constant.

### Stage 3 — H3 fix bunker plumbing into `analyzePairs`
**Scope:** 2 call-sites (`compute-matches.ts:55`, `app/api/ai/match/route.ts:110`) + 1 telemetry warn inside `pair-analyzer.ts` when bunker still undefined.
**Goal:** board-demote floor check evaluates pairs at live bunker price.
**Behaviour change:** pairs near floor at $600 may now correctly demote at $791. **This is the intended fix.**
**Tests to keep green (HIGH risk):**
- `tests/regression/test_warrisk_ballast_adversarial.test.ts:55` — war-risk total — unchanged because H3 doesn't touch war-risk.
- `tests/regression/eu_ets_coverage_adversarial.test.ts` — ETS — unchanged.
- `__tests__/economics/list-detail-tce-parity.test.ts` — parity — unchanged because stored TCE was already correct.
- `lib/__tests__/matching/economics-wiring.test.ts:200` — `Number.isFinite(tceUsdPerDay)` — unchanged.
**Tests that may need INTENTIONAL update (with note in PR description):**
- Any `pair-analyzer` or `analyzePairs` test that asserts a specific demote outcome on a fixture that previously cleared $600 but fails $791. If such a test exists, the update is the *point* of the fix — adjust the fixture to either pass live bunker explicitly (preserving the old assertion) or accept the new demote outcome. **PI3 cap: ≤5 expectation changes — if more, STOP and re-plan.**
**Verify:** `pair-analyzer.test.ts`, `economics-wiring.test.ts`, golden-set runner, full jest.
**Risk:** medium. Could affect board-demote rates on the demo dataset.

### Stage 4 — H1 fix vessel-value plumbing into stored path
**Scope:** `lib/matching/stored-match-economics.ts` adds `vesselValueUsd: estimateVesselValueUsd(dwt)` to `buildMatchEconomics` call. `tce-calculator.ts:39,347,355` `DEFAULT_VESSEL_VALUE_USD` removed (or downgraded to test-fixture-only constant) — depending on whether seed scripts still need it.
**Goal:** list path and detail path produce identical `totalUsd` and `warRiskTotalCombined` for the same vessel/route.
**Behaviour change:** list `totalUsd` for HRA routes shifts to match detail. For Aden→Mundra 30k handysize, list overcharge drops by $10,200. **This is the intended fix.**
**Tests to keep green (HIGH risk):**
- `__tests__/economics/list-detail-tce-parity.test.ts:66,87,95,121,141` — multiple `toBeCloseTo` — **should now MATCH on these assertions; if some were marked tolerance-skip for H1, those become strict-equal**. May need INTENTIONAL update for tolerance values (down-tightening).
- `lib/demo-mode/__tests__/hydrate-demo-session.test.ts:148,150` — war-risk oracle `oracle.premiumUsd ≈ 667` (Lagos→Berbera). The oracle was calibrated with the *stored* 22M, so for vessels where DWT-class estimate ≠ 22M this number changes. **MAY NEED INTENTIONAL UPDATE** — re-derive oracle from `estimateVesselValueUsd(dwt)`.
- `tests/regression/test_warrisk_ballast_adversarial.test.ts:55` — `warRiskTotalCombined > warHullOnly` — qualitative, should stay green.
- `tests/regression/test_economics_edge_cases.test.ts:27` — H7 guard `amountEur >= 0` — unchanged.
- `lib/matching/__tests__/golden-set/runner.ts:127` — full economics regression — golden-set values for HRA routes will shift. **MAY NEED INTENTIONAL GOLDEN UPDATE** — re-baseline only the affected routes, document delta in PR.
- `components/economics/__tests__/CalculationWaterfall.test.tsx:104` — display value `55,817` — unchanged (fixture-driven, no real war-risk).
- `lib/sailing/__tests__/fit-breakdown-economics.test.ts:90` — `FIT_WEIGHTS.economics === 18` — unchanged.
**PI3 cap reminder:** if intentional updates exceed 5 distinct test expectations, STOP and re-plan (split Stage 4 into 4a = oracle re-derivation, 4b = code fix).
**Verify:** all HIGH-risk regression tests + full jest.
**Risk:** high. Multiple oracles re-baseline simultaneously.

### Stage 5 — Canonical owner introduction (additive, no migration yet)
**Scope:** new file `lib/economics/compute-tce.ts` with `computeTce(TceInputs): TceResult`. Body initially delegates to existing `calculateTCE` (1:1 mapping). Add unit tests pinning equivalence to existing `calculateTCE` outputs across the golden-set inputs.
**Goal:** canonical owner exists and is provably equivalent to `calculateTCE` on the golden set.
**Verify:** new test suite `lib/economics/__tests__/compute-tce.test.ts` proves equivalence on ≥20 golden-set fixtures.
**Risk:** very low. Additive only.

### Stage 6 — Migrate `calculateTCE` internals to `computeTce`
**Scope:** `calculateTCE` body replaced with `computeTce` call after `VoyageInput → TceInputs` map. Export signature unchanged.
**Verify:** all ~40 callers of `calculateTCE` (recon-tce-design.md §Architecture) — golden-set runner + full jest.
**Risk:** medium. ~40 call sites; signature unchanged.

### Stage 7 — Migrate `computeEstimatedTce` internals to `computeTce`
**Scope:** `computeEstimatedTce` body replaced with `computeTce` call after positional→struct map. The `bunkerPriceUsdPerMt=DEFAULT_BUNKER_USD_PER_MT` default at line 107 stays for one release (deprecation window), but adds `console.warn` when fallback fires. After one green CI run, default is removed → callers must supply explicit bunker.
**Verify:** all ~37 callers — golden-set runner + full jest.
**Risk:** medium-high. 15 positional args; partial caller migration risk.

### Stage 8 — Migrate `buildMatchEconomics` + `computeStoredMatchEconomics` internals
**Scope:** internal computation switches to `computeTce`; wrapper shape (canal resolution, DB write) unchanged.
**Verify:** `list-detail-tce-parity.test.ts`, golden-set runner, full jest.
**Risk:** medium. Internal-only; tests pin the cross-path parity.

### Stage 9 — Remove deprecation shim from `computeEstimatedTce`
**Scope:** delete `DEFAULT_BUNKER_USD_PER_MT` fallback from `computeEstimatedTce`; remove `DEFAULT_VESSEL_VALUE_USD` once seed scripts pass explicit values.
**Goal:** zero silent defaults in any TCE call path.
**Verify:** typecheck (all callers must pass explicit values), full jest.
**Risk:** low post-Stage-7; high if Stages 3/4 weren't fully landed first.

---

## 6. HIGH-Risk Regression Tests — Stay-Green List

Single consolidated table for every stage to check against (lifted from `recon-tce-design.md §Blast Radius`).

| Test | Pins | Stages it gates |
|------|------|-----------------|
| `__tests__/economics/list-detail-tce-parity.test.ts:66,87,95,121,141` | Cross-path TCE parity | 3, 4, 7, 8 |
| `lib/sailing/__tests__/fit-breakdown-economics.test.ts:90,189,217,227,234` | FIT_WEIGHTS + 4 class breakevens | 2, 3 |
| `tests/regression/eu_ets_coverage_adversarial.test.ts:261,295` | One-EU / both-EU ETS math | 6, 7, 8 |
| `tests/regression/test_warrisk_ballast_adversarial.test.ts:55` | `warRiskTotalCombined > warHullOnly` | 4, 8 |
| `tests/regression/test_economics_edge_cases.test.ts:27` | H7 guard `amountEur >= 0` | 6, 7, 8 |
| `lib/demo-mode/__tests__/hydrate-demo-session.test.ts:148,150` | War-risk oracle ≈ 667 + breakdown parity | 4 |
| `lib/matching/__tests__/golden-set/runner.ts:127` | Full match-economics regression | 4, 6, 7, 8 |
| `components/economics/__tests__/CalculationWaterfall.test.tsx:104` | Display value `55,817` | 6, 7, 8 |
| `lib/__tests__/matching/economics-wiring.test.ts:200` | `Number.isFinite(tceUsdPerDay)` | every stage |
| `components/match/__tests__/EconomicsTab.toggle.test.tsx:48` | Fixture `daily_tce_usd: 60_099` | 4, 8 |
| `components/match/__tests__/EconomicsTab.bunker-baseline.test.tsx:47` | Fixture `daily_tce_usd: 60_682` | 4, 8 |
| `scripts/demo-seed/__tests__/build.test.ts:192` | `typeof tce_usd_per_day === 'number'` | every stage |
| `scripts/demo-seed/__tests__/invalidate-live-sessions.test.ts:101` | `tceUsdPerDay > 0` | every stage |

**Reminder:** PI3 cap — across the whole unification, intentional updates of existing test expectations must stay ≤5 per PR. If a stage looks like it needs more, split it.

---

## 7. Test Expectations That May Need Intentional Updates

Listed once, ordered by stage. Each requires a PR-description note explaining why the number moved.

| Test | Stage | Reason for intentional update |
|------|-------|------------------------------|
| Any `pair-analyzer` fixture asserting "stays on board" at floor margin <$5,348/day | 3 (H3) | Live bunker now applied → pair correctly demotes. Update fixture to either pass explicit bunker preserving old outcome, or accept the new demote. |
| `lib/demo-mode/__tests__/hydrate-demo-session.test.ts:148,150` (war-risk oracle 667) | 4 (H1) | Oracle was derived with 22M hardcode; post-fix vessel value = `estimateVesselValueUsd(dwt)`. Re-derive `oracle.premiumUsd` from the same formula for the test vessel's DWT class. |
| `lib/matching/__tests__/golden-set/runner.ts` HRA-route entries (e.g. Aden→*, Suez→*) | 4 (H1) | War-risk hull premium shifts proportionally to `estimateVesselValueUsd(dwt) / 22M`. Re-baseline only the affected HRA routes; non-HRA routes unchanged. |
| `__tests__/economics/list-detail-tce-parity.test.ts` tolerances | 4 (H1) | Tolerances widened to accommodate H1 may now be tightened to strict-equal. Optional tightening — leave as-is if cautious. |

---

## 8. Risk Register

| Risk | Mitigation |
|------|-----------|
| Golden-set re-baseline hides a real regression | Recompute the war-risk delta for each affected fixture by hand using `estimateVesselValueUsd(dwt) × 0.00075 × hraTransits` and only accept the new number if it matches arithmetic. |
| Stage 7 default-removal breaks a forgotten seed script | One-release deprecation window with `console.warn` (and `ai_audit` row) when fallback fires. Grep CI logs before removing. |
| `analyzePairs` bunker plumb breaks `/api/ai/match` for sessions without bunker DB row | `getLatestBunkerPrice` returns `null` → log warn + use 600 explicitly so floor check still runs deterministically. Never silently swallow. |
| PI3 cap blown on Stage 4 oracle re-baseline | Pre-split: Stage 4a = oracle re-derivation tests, Stage 4b = production fix. |
| Cross-cutting grep misses a caller | Stage 1 + every subsequent deletion stage: `grep -rn` against `__tests__/`, `tests/`, `app/`, `lib/`, `components/`, `scripts/`. Quote literal output in PR. |

---

## 9. Sequencing Summary

```
Stage 0  (this PR — plan)
   ↓
Stage 1  (M2 delete)               ← safest, do first to clear noise
   ↓
Stage 2  (M6 extract)              ← pure refactor
   ↓
Stage 3  (H3 bunker plumb)         ← real bug fix #1
   ↓
Stage 4  (H1 vessel value)         ← real bug fix #2, oracle update
   ↓
Stage 5  (computeTce introduced)   ← additive
   ↓
Stage 6  (calculateTCE migrated)
   ↓
Stage 7  (computeEstimatedTce migrated, deprecation warn)
   ↓
Stage 8  (buildMatchEconomics + stored migrated)
   ↓
Stage 9  (deprecation shim removed — zero silent defaults)
```

H1 + H3 (Stages 3 + 4) deliver the user-visible fix first. Canonical owner (Stages 5–9) is a follow-up that locks the door behind the fix.

---

## 10. Acceptance — When Is This Plan Done?

Each stage is its own PR. Plan is fully delivered when:
- All 9 stages merged to `main`.
- Grep across `lib/`, `app/`, `scripts/`, `components/` finds **zero** occurrences of `DEFAULT_VESSEL_VALUE_USD` and `DEFAULT_BUNKER_USD_PER_MT` outside `lib/economics/compute-tce.ts` deprecation comment.
- Grep finds **single** copy of breakeven ladder constants (`1_500, 3_000, 5_500, 7_500`) — only in `lib/economics/breakeven-thresholds.ts`.
- `list-detail-tce-parity.test.ts` passes with tightened tolerances on HRA routes.
- `analyzePairs` callers all pass an explicit `bunkerPriceUsdPerMt` — typechecker enforces.

---

*End of plan.*
