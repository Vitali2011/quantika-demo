# null/unparseable DWT → Handysize Baltic-class bias — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:test-driven-development (Tier S). Steps use checkbox (`- [ ]`) syntax. **RED test first.** PI3: do NOT rewrite existing test expectations to fit the impl.

**Goal:** When a vessel's `dwtSummer` is missing/unparseable, stop the stored-match economics path from silently treating the vessel as Handysize (`dwt = 0` → `balticIndexCodeForDwt(0) = 'BHSI_TC'`). That false class anchor pollutes `tce_usd_per_day` and `freight_rate_usd_per_mt` for vessels that may be Supramax/Panamax, with a misleadingly market-precise `freight_rate_source='baltic'`.

---

## ⚠️ Root-cause correction (read before implementing)

The dispatch hypothesis named `persist-session-matches.ts:67` → `patchEconomicsComponent` (line 90) → `balticIndexCodeForDwt(0)=Handysize` as the bias locus. **Tracing shows that path is already safe** and the real bias lives elsewhere. The plan is written against the _actual_ root cause.

### Consumer trace of `dwtSummer ?? 0`

`grep -rn 'dwtSummer' lib/ app/ | grep '?? 0'` → five sites. Classified:

| Site                                       | What `dwt=0` feeds                                                                                                 | Biased?                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persist-session-matches.ts:67`            | `patchEconomicsComponent(bd, tce, 0)` → `scoreEconomics(tce, 0)` → `economicsNorm`                                 | **No** — `economicsNorm` returns neutral `0.5` when `!(dwt>0)` (fit-breakdown.ts:457); `scoreEconomics` rationale = "Vessel DWT not stated — neutral" (line 477). Fit% is correct. |
| `compute-matches.ts:82`                    | same `patchEconomicsComponent` pattern + `vessel_dwt` column (`\|\| null`)                                         | **No** — same neutral path.                                                                                                                                                        |
| `stored-match-economics.ts:101` (`ecoDwt`) | **`getBalticDayRate(db, ecoDwt)` (line 120)** + `resolveFreightRate` + `sumMatchPortDaUsd` + `buildMatchEconomics` | **YES** — this is the bias. See below.                                                                                                                                             |
| `session-buckets.ts:43`                    | a parallel (4th) write path **not** routed through `computeStoredMatchEconomics`; does not call `getBalticDayRate` | No Baltic bias (out of scope — see Out-of-scope).                                                                                                                                  |
| `pair-analyzer.ts:827` (`floorDwt`)        | floor-vessel comparison only                                                                                       | Not this bug.                                                                                                                                                                      |

### The double path, resolved

Both `persist-session-matches.ts` and `compute-matches.ts` compute their own `vesselDwt` (for the _fit_ component, which is neutral-safe) **and** separately call `computeStoredMatchEconomics({ cargo, vessel, db })`, which **re-derives `ecoDwt` itself** from `vessel.dwtSummer` (stored-match-economics.ts:101). So the TCE/freight numbers do **not** come from the caller's `vesselDwt` — they come from `ecoDwt`. The Baltic bias is therefore **centralized in one module**, fed by one independent parse.

### Why only one call site

`grep -rn 'getBalticDayRate' lib/ app/` → exactly **one** production caller: `stored-match-economics.ts:120`. (The pair-analyzer copy referenced in the 2026-06-07 port-DA plan was consolidated into this module — see its header comment "all three write-paths route through it".) **One line carries the bias.**

### Exact harm

`stored-match-economics.ts:120`:

```ts
balticDayRate: db ? getBalticDayRate(db, ecoDwt) : null,
```

With `ecoDwt = 0`: `getBalticDayRate(db, 0)` → `balticIndexCodeForDwt(0) = 'BHSI_TC'` (Handysize, since `0 < 45000`) → returns a **positive** Handysize day-rate. In `resolveFreightRate` (freight-resolver.ts:71-88) tier-2 fires (Baltic, `confidence 0.5`) and **wins over** tier-3 estimate (`confidence 0.3`). Result: a vessel of unknown class gets a freight `$/mt` derived from a _Handysize_ market day-rate spread across a possibly-Panamax cargo tonnage → biased `tce_usd_per_day`, and `freight_rate_source='baltic'` advertises false market precision.

**Precision note for QA:** the bias surfaces in `tce_usd_per_day`, `freight_rate_usd_per_mt`, `freight_rate_source`. It does **not** move fit% — the economics fit component is already neutral when DWT is unknown. The dispatch framing ("economics-fit scored against Handysize") is the part to correct; the value harm is in displayed/ranked TCE & freight.

### Already-safe siblings (no change needed)

- `economicsNorm` / `scoreEconomics`: neutral on `dwt<=0`. ✓
- `buildMatchEconomics` canal quotes: already guarded `input.vesselDwt > 0` (tce-calculator.ts:298,302,308,311) — skip canal cost when class unknown rather than fake it. ✓
- tier-3 `estimateFreightRate`: `dwtFactor(0) = 1.0` (tce-calculator.ts:77) — class-neutral, not Handysize-biased. ✓

---

## Why this approach (design decision)

**Chosen semantic: skip-Baltic-bench — gate the tier-2 Baltic lookup on a known positive DWT.** When DWT is unknown, do not consult the per-class Baltic day-rate at all; fall through to the class-neutral tier-3 estimate (`dwtFactor(0)=1.0`, `confidence 0.3`).

```ts
balticDayRate: db && ecoDwt > 0 ? getBalticDayRate(db, ecoDwt) : null,
```

**Why this over the alternatives:**

1. **vs. null-propagate-everything** (make `EconomicsResult` null / blank TCE when DWT unknown): rejected. It would erase `tce_usd_per_day` for _every_ unknown-DWT match (worse demo UX, lots of "—"), and regress the documented class-aware consumption fallback (`resolveConsMtPerDay`, fed by `parseConsumption(...,0)`) which legitimately runs with `dwt=0`. Over-correction far beyond the bias.
2. **vs. "default unknown DWT to a median class"** (e.g. Supramax): rejected — inventing a class is the same category of error as Handysize, just centred differently. Honest degradation (skip the market tier, drop to estimate, lower confidence) beats a fabricated anchor.
3. **Minimal blast radius:** one line, one module, one call site. tier-3 estimate is already the documented always-present floor; `confidence` correctly drops `0.5 → 0.3`, signalling "class unknown". scoreEconomics / canal / DA already self-guard on `dwt>0`, so no coordinated multi-file change.
4. **Consistency:** matches the existing convention in the same call chain (canal quotes already skip when `vesselDwt <= 0`). We extend the same "don't price class-dependent terms when class is unknown" rule to the Baltic freight tier.

**Leave `ecoDwt = 0` as-is for the other consumers in the function** (`resolveFreightRate.vesselDwt`, `sumMatchPortDaUsd`, `buildMatchEconomics.vesselDwt`): they already degrade correctly on `0` (`dwtFactor(0)=1.0`, canal guards, DA tier fallback). Only the Baltic call is anchored to a wrong _class_; only it needs the gate. Optionally extract `const dwtKnown = ecoDwt > 0;` for readability — but do **not** broaden the change.

---

## Tech Stack

TypeScript, better-sqlite3, Jest (`--maxWorkers=1 --forceExit --no-coverage`). Behavioral test calls `computeStoredMatchEconomics(...)` against an in-memory seeded `baltic_indices` table — not a string-match (PI2).

---

## File Structure

- **Modify** `lib/matching/stored-match-economics.ts` — line 120: gate `getBalticDayRate` on `ecoDwt > 0`. (~1 line; optional `dwtKnown` local.)
- **Create** `lib/matching/__tests__/stored-match-economics-null-dwt.test.ts` — behavioral RED test: unparseable/NULL `dwtSummer` + seeded `baltic_indices` + Panamax-sized cargo → assert tier-2 is **skipped** (`freight_rate_source !== 'baltic'`), and a parsable Panamax DWT control **still** resolves Baltic. (Reuse the in-memory DB seeding pattern from `__tests__/lib/matching/persist-session-matches-canonical-tce.test.ts` and `__tests__/lib/market/baltic-freight.test.ts`.)

No production behavior file other than the one module. No new exports, no env vars, no routes — **no pre-removal grep needed** (nothing removed).

---

## Task 1: RED test — unknown DWT must not anchor to Handysize Baltic

**Files:**

- Create: `lib/matching/__tests__/stored-match-economics-null-dwt.test.ts`

- [ ] **Step 1: Write the failing test (RED).** Seed an in-memory DB with a `baltic_indices` row for `BHSI_TC` (positive day-rate) so tier-2 _would_ fire. Build a `ParsedVessel` whose `dwtSummer` is unparseable (e.g. confidence-field value `'TBN'` / `null`) and a `ParsedCargo` with resolvable load/discharge ports (so distance > 0) and a Panamax-scale `quantityMt` (~65,000). Call `computeStoredMatchEconomics({ cargo, vessel, db })`.

```ts
// Behavioral assertion — exercises the real resolver, not a string match.
const res = computeStoredMatchEconomics({
  cargo: vesselUnknownDwtCargo,
  vessel: vesselUnknownDwt,
  db,
});
expect(res.freight_rate_source).not.toBe("baltic"); // tier-2 skipped when class unknown
expect(res.freight_rate_source).toBe("estimated"); // falls through to tier-3 floor
expect(res.tce_usd_per_day).not.toBeNull(); // still produces a number (not blanked)
```

- [ ] **Step 2: Control test (guards over-correction).** Same fixtures but `dwtSummer` parses to a real Panamax (e.g. `82000`). With a seeded `BPI_TC`/`BSI_TC` row, assert tier-2 **still** resolves: `expect(res.freight_rate_source).toBe('baltic')`. This proves the gate only affects the unknown-DWT case, not the happy path.

- [ ] **Step 3: Run RED.** `npx jest --findRelatedTests lib/matching/__tests__/stored-match-economics-null-dwt.test.ts --maxWorkers=1 --no-coverage` → Step-1 assertion **fails** today (current `freight_rate_source==='baltic'`), Step-2 passes. Confirm the failure reason is the Handysize anchor, not a fixture bug.

## Task 2: GREEN — gate the Baltic lookup

**Files:**

- Modify: `lib/matching/stored-match-economics.ts` (line 120)

- [ ] **Step 1:** Change

  ```ts
  balticDayRate: db ? getBalticDayRate(db, ecoDwt) : null,
  ```

  to

  ```ts
  balticDayRate: db && ecoDwt > 0 ? getBalticDayRate(db, ecoDwt) : null,
  ```

  (Optionally add `const dwtKnown = ecoDwt > 0;` near line 101 and use it, plus a one-line comment: "Unknown DWT → skip per-class Baltic tier; tier-3 estimate is class-neutral floor (#null-dwt-baltic).")

- [ ] **Step 2: Run GREEN.** Same `--findRelatedTests` command → both tests pass.

- [ ] **Step 3: Regression sweep.** Run the existing economics suites that exercise this module:
      `npx jest --findRelatedTests lib/matching/stored-match-economics.ts --maxWorkers=1 --no-coverage`
      plus `__tests__/economics/list-detail-tce-parity.test.ts` and `__tests__/lib/matching/persist-session-matches-canonical-tce.test.ts`. **PI3:** if any existing expectation changes, STOP — the gate must not move TCE for matches whose DWT is known/positive (the only legitimate change is unknown-DWT matches flipping `baltic → estimated`).

---

## VALUE_CHECK oracle (orchestrator runs the prod SELECT — NOT the implementer)

**Scale estimate — how many prod matches carry the bias.** `vessel_dwt` is persisted as `vesselDwt || null`, so `NULL` ≈ unparseable/absent DWT. The biased population = NULL-DWT matches that nonetheless got a Baltic-anchored freight:

```sql
-- Run against the prod matches DB (orchestrator).
SELECT
  COUNT(*)                                                          AS null_dwt_matches,
  SUM(CASE WHEN freight_rate_source = 'baltic' THEN 1 ELSE 0 END)   AS baltic_anchored_null_dwt,
  SUM(CASE WHEN tce_usd_per_day IS NOT NULL THEN 1 ELSE 0 END)      AS with_tce
FROM matches
WHERE vessel_dwt IS NULL;
```

`baltic_anchored_null_dwt` is the count of matches whose `tce_usd_per_day` / `freight_rate_usd_per_mt` change after this fix (flip to `estimated`). If `0`, the bias is latent (no prod impact yet); if `> 0`, that is the exact remediation count.

**Before/after oracle for one match.** Pick one row from `baltic_anchored_null_dwt` (`SELECT id, vessel_name, freight_rate_usd_per_mt, tce_usd_per_day, fit_percent FROM matches WHERE vessel_dwt IS NULL AND freight_rate_source='baltic' LIMIT 1;`). Re-run its session regen on the fix branch and compare:

- `freight_rate_source`: `baltic → estimated` (expected).
- `freight_rate_usd_per_mt`, `tce_usd_per_day`: change (expected — Handysize anchor removed).
- `fit_percent`: **unchanged** (economics component is neutral on unknown DWT — confirms the fix is scoped to TCE/freight, not fit).

If `fit_percent` moves, the root-cause analysis is wrong — STOP and re-investigate.

---

## Cold test-skill before merge

Run `/test-skill` (cold adversarial QA, zero context) on the branch. Diff includes a freight/TCE resolver branch → in-scope per its triggers (resolvers, economics). Expected severity: LOW (single guarded conditional). Emit verdict marker; `BLOCK → FAIL`, `APPROVE → PASS`.

---

## Out of scope

1. **`session-buckets.ts:43`** — a 4th write path not routed through `computeStoredMatchEconomics`; it does not call `getBalticDayRate`, so no Baltic bias. Consolidating it onto the shared helper is a separate consistency task.
2. **`pair-analyzer.ts:827` `floorDwt`** — floor-vessel comparison, unrelated to freight benchmarking.
3. **Blanking TCE / null-propagation through `buildMatchEconomics`** — explicitly rejected above; do not implement here.
4. **Improving DWT parsing** (so fewer vessels are unknown in the first place) — upstream parser concern, separate task.
