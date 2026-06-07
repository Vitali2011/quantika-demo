# Ranking → fitPercent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `fitPercent` the ranking + bucketing engine (currently display-only), folding true-voyage TCE into it as a graded ~18-point two-way component, so match ordering reflects economics + vetting, not just physical compatibility.

**Architecture:** (1) Add a graded `economics` factor to `computeFitBreakdown` fed by real true-voyage TCE. (2) Compute that TCE *before* fit (today it is computed after the sort) — the central refactor. (3) Sort + derive `matchLevel` + partition buckets by `fitPercent` instead of `score`. (4) Keep the hard below-breakeven floor as a safety net. (5) Align the 3 downstream sort sites still keyed on `score`. Prod re-gen is a separate founder-gated step, NOT in this PR.

**Tech Stack:** TypeScript, Next.js, better-sqlite3, Jest. Canonical match path = `analyzePairs` (`lib/matching/pair-analyzer.ts`) → `buildMatchEconomics`.

**Spec:** `docs/superpowers/specs/2026-06-07-ranking-fitpercent-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/sailing/fit-breakdown.ts` | per-match fit factors + weights | add `economics` factor (~18), rebalance 9→sum 82; add `scoreEconomics()`; drop binary `TCE<0→ceiling 40` cap (subsumed by gradient) |
| `lib/matching/pair-analyzer.ts` | orchestrates scoring/fit/economics/sort/buckets | extract `computeMatchEconomicsFor()`; compute true-voyage TCE in pre-fit loop; feed real TCE to fit; sort by fit; matchLevel+partition by fit; keep floor |
| `lib/sailing/match-scoring.ts` | `deriveMatchLevel` | add fit-based `deriveMatchLevelFromFit(fit)`; keep score version for compat |
| `lib/matching/matches-repository.ts` | DB queries | `ORDER BY score` → `ORDER BY fit_percent` (default), keep score as selectable |
| `app/api/extension/context/route.ts` | Chrome top-3 | sort `b.fit_percent - a.fit_percent` |
| `app/matches/MatchesClient.tsx` | client list sort | owner default `'tce'` → `'fit'` |
| `scripts/demo-seed/preview-ranking-shift.ts` | **new** before/after preview | read-only: old-top vs new-top + bucket counts on real demo data |
| tests (various) | TDD guards | per task below |

---

## Task 1: Graded economics factor in `computeFitBreakdown`

**Files:**
- Modify: `lib/sailing/fit-breakdown.ts` (weight table ~50-60; cap block ~565)
- Test: `lib/sailing/__tests__/fit-breakdown-economics.test.ts` (create)

Current weights (must sum 100): util 23 / timing 18 / ballast 18 / classFit 11 / cargoType 7 / cranes 7 / volume 4 / draft 3 / vetting 9.
New: carve out **18** for `economics`, shrink the other 9 proportionally (×82/100, rounded so total = 100). Proposed rounded set (verify sum=100 in test): util 19 / timing 15 / ballast 15 / classFit 9 / cargoType 6 / cranes 6 / volume 3 / draft 2 / vetting 7 / **economics 18** = 100.

`scoreEconomics` mapping (two-way, class-normalized, monotonic):
```ts
// 0..1 normalized economics quality. Neutral (0.5) at class breakeven.
// Profit above breakeven → toward 1; loss below → toward 0.
function economicsNorm(tceUsdPerDay: number | null | undefined, vesselDwt: number): number {
  if (tceUsdPerDay == null || !(vesselDwt > 0)) return 0.5; // unknown → neutral, no reward/penalty
  const breakeven = vesselDwt <= 15_000 ? 1_500
    : vesselDwt <= 40_000 ? 3_000
    : vesselDwt <= 65_000 ? 5_500
    : 7_500; // same class breakevens as the bucket floor (pair-analyzer.ts:835-838)
  const scale = Math.max(breakeven, 1); // 1× breakeven above → tanh(1)≈0.76 → norm≈0.88
  return clamp01(0.5 + 0.5 * Math.tanh((tceUsdPerDay - breakeven) / scale));
}
```
The economics factor points = `Math.round(18 * economicsNorm(tce, dwt))`. `computeFitBreakdown` already receives `tceUsdPerDay` (param exists). It also needs `vesselDwt` — derive from the `vessel` arg already passed (`cfValue(vessel.dwtSummer)`).

**Remove** the binary `tceUsdPerDay < 0 → ceiling 40` cap (`fit-breakdown.ts:~565`): the gradient now represents low TCE, and the hard below-breakeven *bucket* floor (`pair-analyzer.ts:819-848`) keeps money-losers out of main. Keep all OTHER caps (late→38, util<0.40→54, dist>2×radius→54, age≥25+EU→55, sanctions MEDIUM→−8).

- [ ] **Step 1: Write failing tests**
```ts
// lib/sailing/__tests__/fit-breakdown-economics.test.ts
import { computeFitBreakdown } from '@/lib/sailing/fit-breakdown';
// minimal cargo+vessel fixtures: a clearly-compatible pair (reuse an existing
// fixture pattern from lib/sailing/__tests__/fit-breakdown*.test.ts if present).
describe('fit economics factor', () => {
  it('weights sum to 100', () => {
    // import the weight table or assert via a known all-perfect input → 100 ceiling
  });
  it('is monotonic in TCE: higher TCE → higher fit, all else equal', () => {
    const base = { /*cargo*/, /*vessel*/, readiness, sanctions, hardFilters, refYear };
    const low  = computeFitBreakdown({ ...base, tceUsdPerDay: -2000 }).fitPercent;
    const even = computeFitBreakdown({ ...base, tceUsdPerDay:  3000 }).fitPercent; // ~breakeven for mid DWT
    const high = computeFitBreakdown({ ...base, tceUsdPerDay: 15000 }).fitPercent;
    expect(high).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(low);
  });
  it('unknown TCE is neutral (no reward, no penalty)', () => {
    const known = computeFitBreakdown({ ...base, tceUsdPerDay: 3000 }).fitPercent; // breakeven≈neutral
    const unknown = computeFitBreakdown({ ...base, tceUsdPerDay: null }).fitPercent;
    expect(Math.abs(known - unknown)).toBeLessThanOrEqual(1);
  });
  it('negative TCE no longer hard-caps fit at 40 (gradient, not cliff)', () => {
    const fit = computeFitBreakdown({ ...base, tceUsdPerDay: -500 }).fitPercent;
    // a highly compatible pair with small loss should land above 40 now
    expect(fit).toBeGreaterThan(40);
  });
});
```
- [ ] **Step 2: Run, verify fail** — `npx jest fit-breakdown-economics -v` → FAIL (economics factor absent / cap still present).
- [ ] **Step 3: Implement** — add `economics` weight + `economicsNorm` + fold into the sum; rebalance the 9; delete the `tce<0→40` cap. Read `fit-breakdown.ts` first; match its existing factor-scoring style (each factor returns 0..weight).
- [ ] **Step 4: Run, verify pass** — `npx jest fit-breakdown-economics -v` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(fit): graded economics factor (~18pt) into fitPercent"`

---

## Task 2: Compute true-voyage TCE before fit (architectural node)

**Files:**
- Modify: `lib/matching/pair-analyzer.ts` (extract economics builder; pre-fit loop ~654-709; old enrichment loop ~749-808; crude preFitTce ~684-691)
- Test: `lib/matching/__tests__/pair-analyzer-tce-into-fit.test.ts` (create)

Today: `fitPercent` computed at ~693-703 with **crude** `preFitTce` (legacy 6-arg `computeEstimatedTce`, no ballast/canal, ~688-691). Real true-voyage TCE (`buildMatchEconomics`, ballast+Suez) computed AFTER sort at ~749-808, mainMatches only.

Refactor:
1. Extract the economics-building body (749-808) into `function computeMatchEconomicsFor(m, cargos, vessels, db, calcAt): MatchEconomics | undefined` (pure, no side effects beyond returning econ). Keep the exact freight/ballast/distance resolution logic — move it verbatim.
2. In the pre-fit loop (before `computeFitBreakdown`), call `computeMatchEconomicsFor(...)`, set `m.economics = econ`, and pass `econ?.tceUsdPerDay ?? null` as `tceUsdPerDay` to `computeFitBreakdown` (replacing `preFitTce`).
3. Delete the crude `preFitTce` block (684-691) and the now-redundant post-sort enrichment loop (749-808) — economics is already on `m`.

- [ ] **Step 1: Write failing test**
```ts
// pair-analyzer-tce-into-fit.test.ts — drive analyzePairs on a fixture pair whose
// true-voyage TCE differs sharply from the laden-only crude TCE (long ballast leg).
it('fitPercent reflects true-voyage TCE (ballast-aware), not crude laden TCE', async () => {
  const res = await analyzePairs([cargo], [vessel], opts); // opts.db provided
  const m = res.matches.find(/* the pair */);
  expect(m.economics?.tceUsdPerDay).toBeDefined();
  // crude TCE would be positive (laden only); true-voyage with long ballast is lower →
  // assert fit tracks the true value (e.g., below a threshold a crude-fed fit would exceed)
});
it('m.economics is set for every scored pair, not just mainMatches', async () => {
  const res = await analyzePairs([cargo], [vessel], opts);
  expect(res.matches.every(m => m.economics !== undefined || /* genuinely no distance */ true)).toBe(true);
});
```
- [ ] **Step 2: Run, verify fail** — `npx jest pair-analyzer-tce-into-fit -v` → FAIL.
- [ ] **Step 3: Implement** — extract `computeMatchEconomicsFor`, call in pre-fit loop, wire TCE into fit, delete crude block + post-sort loop. Preserve floor block (810-848) reading `m.economics?.tceUsdPerDay`.
- [ ] **Step 4: Run, verify pass** — `npx jest pair-analyzer-tce-into-fit -v` → PASS.
- [ ] **Step 5: Regression** — `npx jest pair-analyzer match-realism-stability matches-buckets -v` → PASS (fix fallout).
- [ ] **Step 6: Commit** — `git commit -am "refactor(match): compute true-voyage TCE before fit; feed real TCE into fitPercent"`

---

## Task 3: Rank + matchLevel + bucket by fitPercent

**Files:**
- Modify: `lib/sailing/match-scoring.ts` (add `deriveMatchLevelFromFit`, ~157-161)
- Modify: `lib/matching/pair-analyzer.ts` (matchLevel assignment in pre-fit loop; sort ~711; partition ~724-739)
- Test: `lib/matching/__tests__/pair-analyzer-rank-by-fit.test.ts` (create)

`deriveMatchLevelFromFit(fit)`: `fit >= 70 → 'good'`, `fit >= 60 → 'possible'`, else `'weak'` (spec §3.4; matches main floor fit≥60).

In `analyzePairs`: after `m.fitPercent` is set in the pre-fit loop, set `m.matchLevel = deriveMatchLevelFromFit(m.fitPercent)`. Existing safety demotions still apply and run after (overload guard, ballast cap, floor) — they only ever lower the level, which is fine. Change sort `matches.sort((a,b) => b.score - a.score)` (711) → `(b.fitPercent ?? 0) - (a.fitPercent ?? 0)`. Partition (724-739) already keys on `matchLevel` + `verdict`, so it follows fit automatically once matchLevel is fit-based.

- [ ] **Step 1: Write failing tests**
```ts
// pair-analyzer-rank-by-fit.test.ts
it('ranks by fitPercent: higher-fit pair precedes lower-fit pair', async () => {
  const res = await analyzePairs(cargos, vessels, opts);
  for (let i = 1; i < res.matches.length; i++)
    expect(res.matches[i-1].fitPercent ?? 0).toBeGreaterThanOrEqual(res.matches[i].fitPercent ?? 0);
});
it('matchLevel derives from fit, not score (fit<60 → weak even if score high)', async () => {
  // fixture: high score, low fit pair
  const m = (await analyzePairs([c],[v],opts)).matches.find(/*pair*/);
  expect(m.matchLevel).toBe('weak');
});
// match-scoring deriveMatchLevelFromFit unit:
it('deriveMatchLevelFromFit thresholds', () => {
  expect(deriveMatchLevelFromFit(75)).toBe('good');
  expect(deriveMatchLevelFromFit(65)).toBe('possible');
  expect(deriveMatchLevelFromFit(55)).toBe('weak');
});
```
- [ ] **Step 2: Run, verify fail** — `npx jest pair-analyzer-rank-by-fit match-scoring -v` → FAIL.
- [ ] **Step 3: Implement** — add `deriveMatchLevelFromFit`; set `m.matchLevel` from fit in pre-fit loop; change sort to fit.
- [ ] **Step 4: Run, verify pass** — `npx jest pair-analyzer-rank-by-fit match-scoring -v` → PASS.
- [ ] **Step 5: Regression** — `npm run golden` → 15/15 PASS (bucket membership must hold). `npx jest pair-analyzer match-realism-stability matches-buckets -v` → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(match): rank + matchLevel + bucket by fitPercent (was score)"`

---

## Task 4: Verify floor still demotes money-losers

**Files:** Test only — `lib/matching/__tests__/pair-analyzer-floor-intact.test.ts` (create)

Floor (`pair-analyzer.ts:819-848`) demotes `TCE < class-breakeven → review`. After Tasks 1-3 it reads `m.economics?.tceUsdPerDay` (now set pre-fit). Confirm a high-fit but below-breakeven pair still lands in lowConfidence, not main.

- [ ] **Step 1: Write test** — fixture: compatible pair, TCE below class breakeven → assert match is in `lowConfidenceMatches`, not `mainMatches`, with the `Below-breakeven economics` issue.
- [ ] **Step 2: Run** — `npx jest pair-analyzer-floor-intact -v` → PASS (expected pass; if FAIL, floor regressed in Task 2 — fix).
- [ ] **Step 3: Commit** — `git commit -am "test(match): floor still demotes below-breakeven money-losers"`

---

## Task 5: Align downstream sort sites + owner default

**Files:**
- Modify: `lib/matching/matches-repository.ts` (~485, ~508-515)
- Modify: `app/api/extension/context/route.ts:34`
- Modify: `app/matches/MatchesClient.tsx:124`
- Test: `__tests__/matches-sort.test.tsx` (update regex), add `lib/matching/__tests__/matches-repository-order.test.ts`

Default DB sort: `ORDER BY score DESC, id DESC` → `ORDER BY fit_percent DESC, id DESC`. Keep `score` as an allowed `sortBy` value (the allowlist already validates `sortBy`). Extension top-3: `b.fit_percent - a.fit_percent`. Owner default: `isOwner ? 'tce' : 'fit'` → `'fit'` for both (one literal). Update `matches-sort.test.tsx:62-64` regex to assert the fit default if it pins the default; do NOT remove the `'score'` mode (still selectable).

- [ ] **Step 1: Write/adjust tests**
```ts
// matches-repository-order.test.ts: insert 3 matches with score asc but fit desc,
// listMatches(db,{user_id}) default → first row has highest fit_percent.
it('default order is fit_percent desc', () => {
  /* insert rows: (score 90,fit 50),(score 50,fit 90),(score 70,fit 70) */
  const rows = listMatches(db, { user_id: 'u' });
  expect(rows[0].fit_percent).toBe(90);
});
```
- [ ] **Step 2: Run, verify fail** — `npx jest matches-repository-order -v` → FAIL.
- [ ] **Step 3: Implement** — change ORDER BY default, extension sort, owner default; adjust matches-sort regex.
- [ ] **Step 4: Run, verify pass** — `npx jest matches-repository-order matches-sort -v` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(match): align downstream sort (DB/extension/owner-default) to fitPercent"`

---

## Task 6: Before/after preview script (read-only)

**Files:** Create `scripts/demo-seed/preview-ranking-shift.ts`

Read-only diagnostic for founder eyes. Loads the demo matches and prints: (a) old top-15 by `score` vs new top-15 by `fit_percent` side by side (cargo→vessel, score, fit, tce); (b) bucket counts old (score-matchLevel) vs new (fit-matchLevel). Source = re-run `analyzePairs` on the demo cargo/vessel JSON (`demo-parsed-{cargoes,vessels}.json`) so it reflects the NEW engine, OR read `demo-seed.db` for the OLD snapshot. Must NOT write anything.

- [ ] **Step 1: Implement script** — reuse the regen's cargo/vessel hydration (see `scripts/demo-seed/regenerate-matches.ts` for how it loads inputs + builds `analyzePairs` opts incl. db handle). Output a markdown table to stdout.
- [ ] **Step 2: Run** — `npx tsx scripts/demo-seed/preview-ranking-shift.ts` → prints tables, exits 0, writes nothing (verify `git status` clean after).
- [ ] **Step 3: Commit** — `git commit -am "chore(demo): before/after ranking preview script (read-only)"`

---

## Task 7: Full targeted gate run + tsc

- [ ] **Step 1** — `npm run golden` → 15/15.
- [ ] **Step 2** — `npx jest --testPathPattern 'lib/matching|lib/sailing|__tests__/api/matches|__tests__/api/compute-matches|__tests__/research/match-realism|__tests__/matches-buckets|__tests__/matches-sort'` → all PASS.
- [ ] **Step 3** — `npx tsc --noEmit` → clean.
- [ ] **Step 4** — `git status` clean; push branch; open PR with before/after table from Task 6 pasted in the body.

---

## Out of scope (separate roadmap tails)
Physical removal of `computeScoreBreakdown` / dead `getVesselPassport`; PSC→vetting; port-DA→TCE; CII-in-seed; carbon/war→TCE; quarantine `real-matches.ts`/`build.ts`; golden-band narrowing.

## After merge (founder-gated, orchestrator does — NOT in PR)
Prod re-gen via `regenerate-matches.ts` on outreach-vps (Rule#22: backup → /tmp preview → founder «применяй» → checkpoint → restart → verify). Gate5 visual + VALUE_CHECK (source=golden): main all-positive-or-floored TCE, sane bucket counts.

---

## Self-Review

**Spec coverage:** §3.1 economics gradient → Task 1. §3.2 rank/matchLevel/bucket by fit → Task 3. §3.3 floor kept → Task 4. §3.4 thresholds → Task 3 (`deriveMatchLevelFromFit`). §3.5 downstream + reg-gen → Task 5 (downstream) + post-merge (re-gen). §4 architectural node → Task 2. §6 validation → Tasks 6-7. All covered.

**Placeholder scan:** TCE→points formula is concrete (`economicsNorm`); thresholds concrete; weights concrete (sum=100). Test fixtures say "reuse existing pattern" — acceptable (implementer reads neighboring tests); no TBD logic.

**Type consistency:** `deriveMatchLevelFromFit` used in Task 3 (defined Task 3). `computeMatchEconomicsFor` defined+used Task 2. `economicsNorm` Task 1. `fit_percent` column name consistent (DB) vs `fitPercent` (in-memory Match) — preserved per existing repository mapping. matchLevel values `good|possible|weak` (lib/types.ts:137) — no `strong`. Consistent.
