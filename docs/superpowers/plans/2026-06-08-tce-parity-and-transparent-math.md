# TCE Parity + Transparent Math Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stored match TCE (shown in the /matches list) identical to the live-computed TCE (shown on the /match/[id] detail page), and add a "Показать расчёт" expandable waterfall that traces every number from gross freight down to daily TCE with its formula + source.

**Architecture:** Today three write-paths compute the stored `tce_usd_per_day`: `pair-analyzer.ts` (correct, includes port-DA since #849) and `compute-matches.ts` + `persist-session-matches.ts` (buggy, call the simpler `computeEstimatedTce` without DA). We extract the pair-analyzer economics block into ONE shared helper (`computeStoredMatchEconomics`) and route all three through it — a single source of truth so the next economics factor can never again be added to only one path. Then we extend the live `calculateTCE` breakdown to expose gross freight + per-line derivation inputs, and render them in a new collapsed `CalculationWaterfall` component on the detail page. Finally a prod demo-seed regen reconciles the existing stored values.

**Tech Stack:** TypeScript, Next.js (app router), better-sqlite3, Jest + React Testing Library.

**Verdict source:** `/tmp/recon-tce-math.md` (read-only recon 2026-06-08).

---

## Background — the two-and-a-half bugs

1. **CODE** — `lib/matching/compute-matches.ts:95-98` and `lib/matching/persist-session-matches.ts:56-58` call `computeEstimatedTce(...)` with no `da_usd`. #849 only fixed `pair-analyzer.ts`. → live matches store TCE without ~$66k port DA.
2. **DATA** — `data/demo-seed.db` on prod was regenerated before #849 → seed rows store pre-DA TCE. Needs a regen.
3. **½ — war-risk convention** — detail path sets `excludeWarRiskFromDailyTce: true` (`app/api/voyage/tce/route.ts:373`); the stored path (via `buildMatchEconomics`) must use the SAME convention or war-zone routes still diverge.

## Reference code (the correct path to mirror)

`lib/matching/pair-analyzer.ts:286-344` — computes `ballastDistanceNm` (openPosition→loadPort), `daUsd = sumMatchPortDaUsd([loadPort, dischargePort], ecoDwt, cargoType, db)`, `liveEuaRow = getLatestEuaPrice(db, 'spot')`, then `buildMatchEconomics({... ballastDistanceNm, daUsd, bunkerPriceUsdPerMt, euaPriceEur})`. `buildMatchEconomics` returns `EconomicsResult` with `.tceUsdPerDay` (`tce-calculator.ts:407`).

---

## WORKSTREAM A — TCE parity (single source of truth)

### Task A1: Extract shared `computeStoredMatchEconomics` helper

**Files:**
- Create: `lib/matching/stored-match-economics.ts`
- Test: `lib/matching/__tests__/stored-match-economics.test.ts`

The helper holds the pair-analyzer.ts:286-344 economics logic once. It takes already-parsed cargo/vessel + db, returns the stored fields.

- [ ] **Step 1: Write the failing test**

```ts
import Database from 'better-sqlite3';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { seedReferenceTables } from '@/scripts/demo-seed/seed-reference-tables'; // or inline a port_da_estimates fixture

describe('computeStoredMatchEconomics — single source of truth', () => {
  it('includes port-DA in the stored tce_usd_per_day (parity with pair-analyzer)', () => {
    const db = new Database(':memory:');
    // minimal port_da_estimates fixture: a known load+discharge port pair with non-zero dues
    db.exec(`CREATE TABLE port_da_estimates (port_code TEXT, vessel_dwt_min INTEGER, vessel_dwt_max INTEGER, port_dues_usd REAL, pilotage_usd REAL, tugs_usd REAL);`);
    db.prepare(`INSERT INTO port_da_estimates VALUES ('NLRTM',0,200000,20000,8000,5000),('SGSIN',0,200000,18000,7000,5000)`).run();

    const result = computeStoredMatchEconomics({
      cargo: { originPort: 'Rotterdam', destinationPort: 'Singapore', cargoType: 'GRAIN', freightRateUsd: 28, weightMt: 55000 } as any,
      vessel: { dwtSummer: 55000, speedLaden: '14', consumption: '28', openPosition: 'Rotterdam' } as any,
      db,
    });

    expect(result).not.toBeNull();
    // tce must reflect DA subtraction; the breakdown da_usd must be > 0
    expect(result!.economics!.breakdown.da_usd).toBeGreaterThan(0);
    expect(result!.tce_usd_per_day).toBeLessThan(
      // a recomputation WITHOUT da would be strictly higher — sanity floor
      result!.tce_usd_per_day + result!.economics!.breakdown.da_usd, // trivially true; replace with golden value once observed
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx jest lib/matching/__tests__/stored-match-economics.test.ts` → FAIL ("computeStoredMatchEconomics is not a function").

- [ ] **Step 3: Implement the helper by moving the pair-analyzer.ts:286-344 block verbatim**

Create `lib/matching/stored-match-economics.ts` exporting:

```ts
export interface StoredMatchEconomicsInput {
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  db?: Database.Database;
  calculatedAt?: Date;
  bunkerPriceUsdPerMt?: number;
}
export interface StoredMatchEconomicsResult {
  tce_usd_per_day: number | null;
  freight_rate_usd_per_mt: number | null;
  freight_rate_source: string | null;
  distance_nm: number | null;
  economics: EconomicsResult | null;
}
export function computeStoredMatchEconomics(input: StoredMatchEconomicsInput): StoredMatchEconomicsResult { /* moved logic */ }
```

Move the EXACT logic from `pair-analyzer.ts:286-344` (cfValue/resolveCargoWeight/parseLeadingNumber/parseConsumption + getPortDistance for distance & ballast + sumMatchPortDaUsd + getLatestEuaPrice try/catch + resolveFreightRate + buildMatchEconomics). Return `economics.tceUsdPerDay` as `tce_usd_per_day`. **Set the war-risk convention to match the detail page** — pass `excludeWarRiskFromDailyTce: true` through `buildMatchEconomics`/`computeEstimatedTce` (verify the param name in `tce-calculator.ts`; if `buildMatchEconomics` does not yet thread it, add the param defaulting to `true` for stored path).

- [ ] **Step 4: Run test to verify it passes.** Replace the placeholder assertion with the observed golden value once green.

- [ ] **Step 5: Commit** — `feat(matching): extract computeStoredMatchEconomics single-source helper`

### Task A2: Route pair-analyzer through the helper (behavior-preserving)

**Files:** Modify `lib/matching/pair-analyzer.ts:286-344` · Existing tests guard: `lib/matching/__tests__/*pair-analyzer*`, `__tests__/.../*tce*`.

- [ ] **Step 1:** Run the existing pair-analyzer/economics suite, record GREEN baseline. `npx jest pair-analyzer tce` → note pass count.
- [ ] **Step 2:** Replace the inline 286-344 block with a call to `computeStoredMatchEconomics({cargo, vessel, db, calculatedAt: calcAt, bunkerPriceUsdPerMt})` and return its `.economics`.
- [ ] **Step 3:** Re-run the same suite → identical pass count, zero diffs in stored values (this is a refactor, not a behavior change).
- [ ] **Step 4: Commit** — `refactor(matching): pair-analyzer uses shared stored-economics helper`

### Task A3: Fix compute-matches.ts (the auto-precompute path)

**Files:** Modify `lib/matching/compute-matches.ts:81-124` · Test: `lib/matching/__tests__/compute-matches.test.ts`

- [ ] **Step 1: Write failing test** — `computeAndPersistMatches` over an in-memory db with a `port_da_estimates` fixture stores a `tce_usd_per_day` whose value equals `computeStoredMatchEconomics(...)` for the same pair (DA included).
- [ ] **Step 2: Run → FAIL** (current stored value excludes DA → higher than helper).
- [ ] **Step 3:** Replace the `resolveFreightRate(...)` + `computeEstimatedTce(...)` block (lines 85-102) with:
```ts
const eco = computeStoredMatchEconomics({ cargo, vessel, db });
tce_usd_per_day = eco.tce_usd_per_day;
freight_rate_usd_per_mt = eco.freight_rate_usd_per_mt;
freight_rate_source = eco.freight_rate_source;
```
Keep the `if (distanceResult && distanceResult.nm > 0)` guard — the helper already returns nulls when distance is unavailable, so the guard can be dropped if the helper is null-safe (verify). Persist `worksheet_json` economics if `createMatch` supports it (check the column; out of scope if not present here).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `fix(matching): compute-matches includes port-DA via shared helper (#849 gap)`

### Task A4: Fix persist-session-matches.ts (re-persist path)

**Files:** Modify `lib/matching/persist-session-matches.ts:42-63` · Test: `lib/matching/__tests__/persist-session-matches.test.ts`

- [ ] **Step 1: Write failing test** — same parity assertion as A3 for the session-persist path.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** Replace lines 46-63 with the same `computeStoredMatchEconomics` call as A3. Leave the laycan worksheet-rebuild block (65+) untouched.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `fix(matching): persist-session-matches includes port-DA via shared helper`

### Task A5: Cross-path parity test (list == detail)

**Files:** Test: `tests/regression/test_tce_list_detail_parity.test.ts`

- [ ] **Step 1:** Write a test that, for a fixed cargo/vessel/db, asserts the stored `tce_usd_per_day` from `computeStoredMatchEconomics` equals the `daily_tce_usd` returned by `calculateTCE` with the detail-page inputs (`app/api/voyage/tce/route.ts` convention: `excludeWarRiskFromDailyTce:true`, same daUsd/canal/duration). Allow ±$1 rounding tolerance.
- [ ] **Step 2: Run → must PASS** (proves single source of truth). If it fails, the two paths still differ — reconcile before proceeding.
- [ ] **Step 3: Commit** — `test(matching): list↔detail TCE parity regression`

---

## WORKSTREAM B — Transparent "Показать расчёт" waterfall

### Task B1: Expose gross freight + derivation inputs in the breakdown

**Files:** Modify `lib/economics/voyage-calculator.ts` (`TCEBreakdown` type + `calculateTCE` return ~200-241) · Test: `lib/economics/__tests__/voyage-calculator.test.ts`

`calculateTCE` already computes `grossFreight` (line 202) internally but does not return it. Add to `TCEBreakdown`:
```ts
gross_freight_usd: number;
freight_rate_usd_per_mt: number;
quantity_mt: number;
duration_days: number;
bunker_consumption_mt_per_day: number;
bunker_price_usd_per_mt: number;
// optional per-port DA detail if cheaply available; else omit
```

- [ ] **Step 1: Write failing test** — `calculateTCE(input).gross_freight_usd === quantityMt * freightRateUsdPerMt` and `net_voyage_usd === gross_freight_usd - total_costs_usd`.
- [ ] **Step 2: Run → FAIL** (field undefined).
- [ ] **Step 3:** Add the fields to the returned object (values already in local scope at 202-211). Do NOT change any existing field's value — additive only.
- [ ] **Step 4: Run → PASS** + run full economics suite to confirm no regressions.
- [ ] **Step 5: Commit** — `feat(economics): expose gross-freight + derivation inputs in TCEBreakdown`

### Task B2: `CalculationWaterfall` presentational component

**Files:** Create `components/economics/CalculationWaterfall.tsx` · Test: `components/economics/__tests__/CalculationWaterfall.test.tsx`

Pure presentational; renders the chain from the extended `TCEBreakdown`. Russian labels (founder-facing). Each cost row shows label, amount (negative `-$X`), and a one-line formula+source caption.

- [ ] **Step 1: Write failing test** — render with a fixture breakdown; assert it shows: "Выручка" with `gross_freight_usd`, a row per cost line with its `-$` value, "Чистыми за рейс" = `net_voyage_usd`, "÷ N дней", and "Заработок в день" = `daily_tce_usd`. Assert the bunker caption contains the formula `расход × дни × цена`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the component. Layout per the approved mockup (revenue → minus each line w/ formula+source → net → ÷days → daily TCE). Reuse `fmtUsd` convention (`-$X`). Mark war risk caption "показано, но не влияет на $/день" (mirrors `excludeWarRiskFromDailyTce`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(economics): CalculationWaterfall transparent math component`

### Task B3: "Показать расчёт" toggle in EconomicsTab

**Files:** Modify `components/match/EconomicsTab.tsx` (near the `VoyageBreakdownChart` usage ~666-689) · Test: `components/match/__tests__/EconomicsTab.test.tsx` (or extend existing)

- [ ] **Step 1: Write failing test** — by default `CalculationWaterfall` is NOT in the DOM; after clicking the button `data-testid="show-calc-toggle"` (label "Показать расчёт"), it appears; clicking again hides it.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3:** Add a `useState(false)` toggle + button below `VoyageBreakdownChart`; when open, render `<CalculationWaterfall breakdown={breakdown} />` using the same `breakdown` already fetched from `/api/voyage/tce`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(match): "Показать расчёт" expandable math waterfall`

### Task B4: Browser verification (preview)

- [ ] Start preview, open a /match/[id], click "Показать расчёт", confirm the chain renders with revenue + per-line formulas; screenshot for the founder. (Uses preview_* tools; not a code step.)

---

## WORKSTREAM C — Reconcile prod (regen) + VALUE_CHECK

> Rule#22: prod-regen requires explicit founder "go". Changes user-visible numbers.

### Task C1: Regenerate demo-seed + verify parity on prod

- [ ] **Step 1:** After A+B merged to main and deployed, run `scripts/demo-seed/regenerate-matches.ts` to rebuild stored TCEs with DA (now via the shared helper). `--dry` first (seed prod-apply discipline), inspect diff, then apply.
- [ ] **Step 2: VALUE_CHECK** — for a sample of N matches, assert stored `tce_usd_per_day` (list) == live `/api/voyage/tce` `daily_tce_usd` (detail) within ±$1. Emit via `value-check-emit.sh <pr> tce-parity <match|mismatch>`.
- [ ] **Step 3:** Spot-check on demo.quantika.org: open a match seen in the list, confirm list TCE == detail Daily TCE.

---

## Self-Review

**Spec coverage:** Bug 1 → A3/A4. Bug 2 → C1. Bug ½ (war risk) → A1 step 3 + A5. Transparency feature (revenue line + per-line formula+source + duration, behind "Показать расчёт" toggle) → B1/B2/B3. ✓
**Placeholder scan:** A1 test golden value is explicitly flagged to replace-once-observed (not a silent TODO). Per-port DA detail in B1 marked optional. ✓
**Type consistency:** `computeStoredMatchEconomics` / `StoredMatchEconomicsResult.economics: EconomicsResult` / `TCEBreakdown` additive fields used consistently in B2/B3. Verify `buildMatchEconomics` exposes `.breakdown` on its `EconomicsResult` (tce-calculator.ts:385-407) — if the breakdown is nested differently, adjust A1 assertions to the real shape.

**Open verification for the executor (do FIRST, before A1):** confirm in `tce-calculator.ts` (a) `computeEstimatedTce` / `buildMatchEconomics` signatures, (b) whether `excludeWarRiskFromDailyTce` is already threaded through `buildMatchEconomics` or must be added, (c) the exact shape of `EconomicsResult.breakdown`. These determine A1's exact code.
