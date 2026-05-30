# L2 Economics Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `Match.economics` (TCE $/day + JWC war-risk) in the matching pipeline by wiring the already-working TCE engine + war-risk into `analyzePairs`.

**Architecture:** A new pure helper `buildMatchEconomics()` in `lib/matching/tce-calculator.ts` reuses the existing `estimateFreightRate` + `computeEstimatedTce` (so the per-day TCE is byte-identical to the value `compute-matches.ts` already persists to the `tce_usd_per_day` DB column) and adds `calculateWarRiskPremium` for the JWC line item, returning an `EconomicsResult`. `analyzePairs` calls it for each main (good/possible) match after the realism partition, attaching the result to `match.economics`. Scoring, ranking, bucketing untouched — economics is display-only.

**Tech Stack:** TypeScript, Jest, better-sqlite3 (test infra only — helper is DB-free).

---

## Scope

- **IN (#5):** wire `match.economics` (TCE $/day) for good/possible matches in `analyzePairs`.
- **IN (#6):** JWC war-risk premium surfaced inside that `EconomicsResult` (`breakdown.warRiskPremium / warRiskZones / warRiskBreakdown`).
- **OUT (#7):** freight-rate source — reuse `estimateFreightRate` as-is.
- **OUT (#8):** score / ranking / bucket partition — NOT touched. Economics computed AFTER partition; never read by sort/filter.
- **OUT:** UI (wave B), DB schema (no economics column — out of scope), `lib/types.ts` non-additive edits.

## Key design decisions (assumptions documented — founder not at terminal)

1. **Per-day consistency:** `buildMatchEconomics` computes distance the same way `compute-matches.ts` does — `getPortDistance(loadPort, dischargePort)` (the laden/revenue voyage), NOT `readiness.distanceNm` (the ballast leg). Same inputs + same `computeEstimatedTce` ⇒ `economics.tceUsdPerDay === tce_usd_per_day` DB column. This is the "reuse, don't duplicate" the brief mandates.
2. **War-risk is a separate line item, not folded into per-day.** `computeEstimatedTce` blanks the route ports, so its internal war-risk is already 0 and the persisted per-day excludes war-risk. We keep `tceUsdPerDay` identical to the DB column and surface the real-port JWC premium separately in `breakdown` (matches how the live economics breakdown treats war risk). Vessel value for the premium = `DEFAULT_VESSEL_VALUE_USD` (22M), same valuation `computeEstimatedTce` uses.
3. **Insufficient data ⇒ `economics` stays `undefined`.** No distance (ports unresolved) ⇒ `buildMatchEconomics` returns `null` ⇒ field left unset. Never throws, never fabricates.
4. **`tceUsdPerDay` is an additive optional field** on `EconomicsResult` (`lib/types.ts`). `EconomicsResult` had no per-day field; additive-only per parallel-wave constraint.
5. **Only main (good/possible) matches** get economics. `lowConfidenceMatches` / `insufficientData` buckets are left as-is.

## File Structure

- `lib/types.ts` — Modify: add additive `tceUsdPerDay?: number` to `EconomicsResult`.
- `lib/matching/tce-calculator.ts` — Modify: additive `breakdown` on `TceEstimate`; add `buildMatchEconomics()`.
- `lib/matching/pair-analyzer.ts` — Modify: import helper + `getPortDistance`; attach economics to main matches after partition.
- `lib/matching/__tests__/tce-calculator.test.ts` — Modify: unit tests for `buildMatchEconomics`.
- `lib/__tests__/matching/economics-wiring.test.ts` — Create: integration test on `analyzePairs`.

---

### Task 1: Additive `tceUsdPerDay` on `EconomicsResult`

**Files:**
- Modify: `lib/types.ts:62-70`

- [ ] **Step 1: Add field**

```typescript
export interface EconomicsResult {
  breakdown: EconomicsBreakdown;
  totalUsd: number;                    // sum of all costs in USD-equivalent
  calculatedAt: string;                // ISO 8601
  dataFreshness: {
    bunker: string;                    // ISO 8601 of bunker price scrape
    eua: string;                       // ISO 8601 of EUA price scrape
  };
  /** Headline Time-Charter-Equivalent ($/day). Additive (spec L2 #5) — present
   *  when economics is computed in the matching pipeline; absent for the legacy
   *  /api/economics shape. */
  tceUsdPerDay?: number;
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → no new errors (additive optional).

---

### Task 2: `buildMatchEconomics` helper (unit-tested)

**Files:**
- Modify: `lib/matching/tce-calculator.ts`
- Test: `lib/matching/__tests__/tce-calculator.test.ts`

- [ ] **Step 1: Write failing unit tests** (append to tce-calculator.test.ts)

```typescript
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

describe('buildMatchEconomics', () => {
  const CALC_AT = '2026-05-30T00:00:00.000Z';
  const base = {
    cargoType: 'GRAIN', distanceNm: 3000, vesselDwt: 50000, quantityMt: 45000,
    speedKts: 12, consumptionMt: 25, loadPort: 'Rotterdam', dischargePort: 'Hamburg',
    calculatedAt: CALC_AT,
  };

  it('returns null when distance is not positive', () => {
    expect(buildMatchEconomics({ ...base, distanceNm: 0 })).toBeNull();
  });

  it('populates a finite tceUsdPerDay equal to computeEstimatedTce', () => {
    const econ = buildMatchEconomics(base)!;
    expect(econ).not.toBeNull();
    expect(Number.isFinite(econ.tceUsdPerDay!)).toBe(true);
    const freight = estimateFreightRate(base.cargoType, base.distanceNm, base.vesselDwt);
    const tce = computeEstimatedTce(freight, base.distanceNm, base.vesselDwt, base.quantityMt, base.speedKts, base.consumptionMt);
    expect(econ.tceUsdPerDay).toBe(tce.tce_usd_per_day);
    expect(econ.calculatedAt).toBe(CALC_AT);
  });

  it('no war-risk for a non-HRA route → empty zones, zero premium', () => {
    const econ = buildMatchEconomics(base)!;
    expect(econ.breakdown.warRiskZones).toEqual([]);
    expect(econ.breakdown.warRiskPremium).toBe(0);
  });

  it('surfaces JWC war-risk when load port is in a high-risk area', () => {
    const econ = buildMatchEconomics({ ...base, loadPort: 'Lagos', dischargePort: 'Hamburg' })!;
    expect(econ.breakdown.warRiskZones.length).toBeGreaterThan(0);
    expect(econ.breakdown.warRiskPremium).toBeGreaterThan(0);
    expect(econ.breakdown.warRiskBreakdown!.totalPremiumUsd).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx jest lib/matching/__tests__/tce-calculator.test.ts -t buildMatchEconomics` → FAIL ("buildMatchEconomics is not a function").

- [ ] **Step 3: Implement** — in `lib/matching/tce-calculator.ts`:

```typescript
// top imports
import { calculateTCE, type TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import type { EconomicsResult } from '@/lib/types';

// extend TceEstimate additively
export interface TceEstimate {
  tce_usd_per_day: number;
  freight_rate_usd_per_mt: number;
  freight_rate_source: 'estimated' | 'manual';
  /** Full deterministic breakdown from the voyage calculator (additive, spec L2 #5). */
  breakdown: TCEBreakdown;
}

// in computeEstimatedTce return, add:
//   breakdown: result.breakdown,

export interface MatchEconomicsInput {
  cargoType: string | null;
  distanceNm: number;
  vesselDwt: number;
  quantityMt: number;
  speedKts: number;
  consumptionMt: number;
  loadPort: string | null;
  dischargePort: string | null;
  /** ISO 8601 timestamp; passed in so the result is deterministic/testable. */
  calculatedAt: string;
  /** Vessel value for the war-risk hull premium. Defaults to DEFAULT_VESSEL_VALUE_USD. */
  vesselValueUsd?: number;
}

/**
 * Build the EconomicsResult attached to a Match (spec L2 #5 + #6).
 *
 * Reuses estimateFreightRate + computeEstimatedTce so tceUsdPerDay is identical
 * to the tce_usd_per_day value compute-matches.ts persists to the DB. JWC war-risk
 * (#6) is computed separately with the REAL load/discharge ports and surfaced as a
 * breakdown line item (the per-day figure excludes it, mirroring the DB column).
 *
 * Returns null when distance is unavailable → caller leaves match.economics undefined.
 */
export function buildMatchEconomics(input: MatchEconomicsInput): EconomicsResult | null {
  if (!(input.distanceNm > 0)) return null;

  const freight = estimateFreightRate(input.cargoType, input.distanceNm, input.vesselDwt);
  const tce = computeEstimatedTce(
    freight, input.distanceNm, input.vesselDwt, input.quantityMt, input.speedKts, input.consumptionMt,
  );

  const war = calculateWarRiskPremium({
    route: { fromPort: input.loadPort ?? '', toPort: input.dischargePort ?? '' },
    vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
  });

  return {
    breakdown: {
      bunkerCost: tce.breakdown.bunker_usd,
      bunkerPort: input.loadPort ?? '',
      euEtsAmount: tce.breakdown.ets_eur,
      euEtsApplicable: tce.breakdown.applicable.ets,
      warRiskPremium: war.premiumUsd,
      warRiskZones: war.zones,
      warRiskTotal: war.breakdown?.totalPremiumUsd,
      warRiskBreakdown: war.breakdown,
    },
    totalUsd: tce.breakdown.total_costs_usd + war.premiumUsd,
    calculatedAt: input.calculatedAt,
    dataFreshness: { bunker: 'estimated', eua: 'estimated' },
    tceUsdPerDay: tce.tce_usd_per_day,
  };
}
```

- [ ] **Step 4: Run, verify pass** — `npx jest lib/matching/__tests__/tce-calculator.test.ts` → PASS (all, incl. pre-existing).

- [ ] **Step 5: Commit** — `feat(economics): buildMatchEconomics helper — TCE + JWC war-risk → EconomicsResult`

---

### Task 3: Wire into `analyzePairs`

**Files:**
- Modify: `lib/matching/pair-analyzer.ts`
- Test: `lib/__tests__/matching/economics-wiring.test.ts` (create)

- [ ] **Step 1: Write failing integration test** (`lib/__tests__/matching/economics-wiring.test.ts`)

Mirrors the mock setup in `lib/__tests__/matching/pair-analyzer.test.ts` (readiness `ideal`, hard filters pass, scoring identity) and additionally mocks `getPortDistance`. Asserts a good/possible main match has `economics.tceUsdPerDay` as a finite number, and that with no resolvable distance the field is `undefined`.

```typescript
// (full test body written during execution — mirrors pair-analyzer.test.ts mocks,
//  adds jest.mock('@/lib/sailing/port-distances', () => ({ getPortDistance: jest.fn() }))
//  case A: getPortDistance → { nm: 3000 } ⇒ result.matches[0].economics.tceUsdPerDay finite
//  case B: getPortDistance → null         ⇒ result.matches[0].economics undefined )
```

- [ ] **Step 2: Run, verify fail** — economics is undefined before wiring.

- [ ] **Step 3: Implement** — in `pair-analyzer.ts`:
  - Add imports: `getPortDistance` from `@/lib/sailing/port-distances`; `buildMatchEconomics`, `parseLeadingNumber` from `@/lib/matching/tce-calculator`.
  - After the realism partition builds `mainMatches`, before `return`, attach economics:

```typescript
  // ── Economics enrichment (spec L2 #5 + #6) ─────────────────────────────────
  // Display-only: computed AFTER the partition so it can never affect score,
  // ranking, or bucketing. Mirrors compute-matches.ts distance logic so the
  // per-day TCE equals the persisted tce_usd_per_day column.
  const economicsCalcAt = new Date().toISOString();
  for (const m of mainMatches) {
    const cargo = cargos.find((c) => c.emailId === m.cargoEmailId && c.itemIndex === m.cargoItemIndex);
    const vessel = vessels.find((v) => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex);
    if (!cargo || !vessel) continue;

    const loadPort = cfValue(cargo.originPort);
    const dischargePort = cfValue(cargo.destinationPort);
    const distanceResult = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
    if (!distanceResult || !(distanceResult.nm > 0)) continue;

    const cargoType =
      typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
        ? (cargo.cargoType as unknown as { value: string }).value
        : (cargo.cargoType as string | null);

    const econ = buildMatchEconomics({
      cargoType,
      distanceNm: distanceResult.nm,
      vesselDwt: cfValue(vessel.dwtSummer) ?? 0,
      quantityMt: cfValue(cargo.weightMt) ?? 0,
      speedKts: parseLeadingNumber(vessel.speedLaden),
      consumptionMt: parseLeadingNumber(vessel.consumption),
      loadPort,
      dischargePort,
      calculatedAt: economicsCalcAt,
    });
    if (econ) m.economics = econ;
  }

  return { matches: mainMatches, lowConfidenceMatches, insufficientData, blockedMatches };
```

- [ ] **Step 4: Run, verify pass** — new integration test PASS; existing `pair-analyzer.test.ts` still PASS (null ports ⇒ distance null ⇒ economics undefined, no assertions broken).

- [ ] **Step 5: Commit** — `feat(matching): attach match.economics (TCE + war-risk) to main matches`

---

### Task 4: Regression + acceptance verification

- [ ] `npx jest lib/matching lib/__tests__/matching tests/economics` → green.
- [ ] `npx tsx scripts/research/match-realism-funnel.ts` → output unchanged vs `main` (funnel reimplements filters/readiness, never calls analyzePairs — structurally unaffected; confirm anyway).
- [ ] `NODE_OPTIONS='--max-old-space-size=8192' npx jest` full suite (single run). Known foreign flake `scripts/progonq/score-classify` is not our regression.
- [ ] requesting-code-review → verification-before-completion → finishing-a-development-branch (draft PR to main, do NOT merge).

## Self-Review

- **Spec coverage:** #5 → Task 2+3. #6 → Task 2 (war-risk in breakdown) + integration. #7/#8 untouched (helper reuses estimateFreightRate; economics attached post-partition). ✅
- **Placeholders:** Task 3 test body is described not pasted — written in full at execution (mock-heavy, mirrors existing file). All production code shown in full. ✅
- **Type consistency:** `buildMatchEconomics` / `MatchEconomicsInput` / `EconomicsResult.tceUsdPerDay` / `TceEstimate.breakdown` consistent across tasks. ✅
