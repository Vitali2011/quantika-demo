# Plan — War-Risk Ballast Leg in Voyage P&L (SEAGULL-12 / Hodeidah HRA)

**Date:** 2026-06-04
**Branch:** `plan-warrisk-ballast`
**Founder decision:** **A1** — count the ballast-leg war-risk *and* surface it as a separate visible
line item in the Economics tab P&L (e.g. "War Risk — ballast (Red Sea reposition): ~$46k"),
included in the voyage cost total. Founder accepted that this lowers ranking of warzone-ballast
matches — that is the intended owner's-true-cost behaviour.

---

## Goal

`buildMatchEconomics` currently computes JWC war-risk on the **laden** leg only
(`{ fromPort: loadPort, toPort: dischargePort }`). The vessel open position (and therefore
any HRA transit on the **ballast** repositioning leg) is silently dropped from the
economics breakdown.

Add a second war-risk computation for the ballast leg
(`{ fromPort: vesselOpenPosition, toPort: loadPort }`), surface the laden and ballast
premiums as **two distinct labelled lines** in the Economics tab, and roll the sum into
`totalUsd` (voyage cost). Stored `tce_usd_per_day` stays unchanged (see §3) — display-only
addition; no regen, no migration.

---

## 1. Files involved (read-only review confirms recon)

### Compute path
- `lib/economics/war-risk.ts:195` — `calculateWarRiskPremium(input)` — pure function. No
  changes; we just call it twice (laden + ballast).
- `lib/matching/tce-calculator.ts:184-252` — `MatchEconomicsInput` + `buildMatchEconomics`.
  Currently constructs one `war = calculateWarRiskPremium({ route: { fromPort: loadPort,
  toPort: dischargePort }, ... })` at line 231. We add `vesselOpenPosition` field to the
  input, compute a second `warBallast` call, sum the totals, and emit a new breakdown shape.
- `lib/matching/pair-analyzer.ts:780-795` — economics enrichment loop. `cfValue(vessel.openPosition)`
  is already available in scope (line 141 of same file uses it for hard-filter gate). Pass
  it through into the `buildMatchEconomics` call.
- `lib/types.ts:54-60` — `EconomicsBreakdown` shape. Add new fields:
  `warRiskBreakdownLaden?`, `warRiskBreakdownBallast?`, `warRiskZonesBallast?`,
  `warRiskTotalCombined?`. Keep existing `warRiskPremium`, `warRiskZones`, `warRiskBreakdown`
  as **laden-only aliases** for backward compat with callers / tests.

### Display path
- `components/match/EconomicsTab.tsx:552-599` — JWC War Risk card. Currently renders one
  block from `warRiskBreakdown` (hull / crew / P&I / total). Extend props to accept
  `warRiskBreakdownBallast` + `warRiskZonesBallast`, render a **second labelled block**
  ("War Risk — ballast (zone)") when ballast premium is non-zero.
- `components/match/MatchTabs.tsx:73-87` — props pass-through (already maps `match.economics?.breakdown`
  to EconomicsTab props). Add the new sibling fields.
- `components/economics/VoyageBreakdownChart.tsx` — **out of scope** for this PR. It fetches
  a live `/api/voyage/tce` payload (line 328 of EconomicsTab) which computes war-risk
  internally from the form-bound origin/destination, *not* from `match.economics.breakdown`.
  Folding the ballast leg into that endpoint is a separate change because it requires the
  caller (the form) to pass the vessel open position to `/api/voyage/tce`. **Documented
  but deferred.**

### Tests
- New: `lib/matching/__tests__/tce-calculator-warrisk-ballast.test.ts` (TDD)
- Existing canonical case: `lib/sailing/__tests__/match-filters-war-position.test.ts:11`
  ("SEAGULL-12: Hodeidah (HRA) + 5328 DWT + Marmara→Veracruz → blocked") — uses the same
  ports we'll exercise, but checks the hard-filter gate, not war-risk premium. We reuse the
  port strings.

---

## 2. Steps

### Step 1 — Extend the input type
`lib/matching/tce-calculator.ts` (`MatchEconomicsInput`, around line 184):

```ts
export interface MatchEconomicsInput {
  // … existing fields …
  loadPort: string | null;
  dischargePort: string | null;
  /** Vessel open position — for ballast leg war-risk. Pass null when unknown (skips ballast premium). */
  vesselOpenPosition?: string | null;
  // … rest unchanged …
}
```

### Step 2 — Compute ballast premium inside `buildMatchEconomics`
`lib/matching/tce-calculator.ts`, replacing the single `war = ...` call near line 231:

```ts
const warLaden = calculateWarRiskPremium({
  route: { fromPort: input.loadPort ?? '', toPort: input.dischargePort ?? '' },
  vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
});

const openPos = input.vesselOpenPosition ?? '';
const warBallast = openPos && input.loadPort
  ? calculateWarRiskPremium({
      route: { fromPort: openPos, toPort: input.loadPort },
      vesselValueUsd: input.vesselValueUsd ?? DEFAULT_VESSEL_VALUE_USD,
    })
  : { applicable: false, premiumUsd: 0, zones: [], zoneIds: [] };

const warCombinedTotal =
  (warLaden.breakdown?.totalPremiumUsd ?? warLaden.premiumUsd) +
  (warBallast.breakdown?.totalPremiumUsd ?? warBallast.premiumUsd);
```

Update the returned breakdown to surface both:

```ts
return {
  breakdown: {
    bunkerCost: tce.breakdown.bunker_usd,
    bunkerPort: input.loadPort ?? '',
    euEtsAmount: tce.breakdown.ets_eur,
    euEtsApplicable: tce.breakdown.applicable.ets,
    // BC aliases — laden-only — UNCHANGED meaning for existing consumers
    warRiskPremium: warLaden.premiumUsd,
    warRiskZones: warLaden.zones,
    warRiskTotal: warLaden.breakdown?.totalPremiumUsd,
    warRiskBreakdown: warLaden.breakdown,
    // NEW — ballast siblings
    warRiskBreakdownLaden: warLaden.breakdown,
    warRiskBreakdownBallast: warBallast.breakdown,
    warRiskZonesBallast: warBallast.zones,
    warRiskTotalCombined: warCombinedTotal,
  },
  totalUsd: tce.breakdown.total_costs_usd + warCombinedTotal,  // ← was +war.premiumUsd
  // …
};
```

**Behaviour invariant:** when `vesselOpenPosition` is unset or not in any HRA zone,
`warBallast.premiumUsd === 0`, `warCombinedTotal === warLaden.premiumUsd` (the legacy
sum) — no behaviour drift for existing matches outside HRA.

### Step 3 — Wire the openPosition into the call site
`lib/matching/pair-analyzer.ts:780` — add one line inside the `buildMatchEconomics` call:

```ts
const econ = buildMatchEconomics({
  cargoType,
  distanceNm: distanceResult.nm,
  vesselDwt: ecoDwt,
  // …
  loadPort,
  dischargePort,
  vesselOpenPosition: cfValue(vessel.openPosition),   // ← new
  calculatedAt: economicsCalcAt,
  resolvedFreight: { /* … */ },
});
```

### Step 4 — Extend `EconomicsBreakdown` type
`lib/types.ts` (around line 54-60):

```ts
export interface EconomicsBreakdown {
  // … existing …
  warRiskPremium: number;               // laden-only hull premium, BC
  warRiskZones: string[];               // laden-only zones, BC
  warRiskTotal?: number;                // laden-only total, BC
  warRiskBreakdown?: WarRiskBreakdown;  // laden-only breakdown, BC (alias of warRiskBreakdownLaden)
  /** Laden voyage war-risk (load → discharge). Same as warRiskBreakdown — explicit name. */
  warRiskBreakdownLaden?: WarRiskBreakdown;
  /** Ballast leg war-risk (open position → load). Undefined when openPosition is non-HRA or absent. */
  warRiskBreakdownBallast?: WarRiskBreakdown;
  /** JWC zones touched by the ballast leg. */
  warRiskZonesBallast?: string[];
  /** Laden + ballast totalPremiumUsd. Reflected in EconomicsResult.totalUsd. */
  warRiskTotalCombined?: number;
}
```

### Step 5 — Surface ballast line in EconomicsTab
`components/match/EconomicsTab.tsx`:

- Add props: `warRiskBreakdownBallast?: WarRiskBreakdown | null`, `warRiskZonesBallast?: string[] | null`.
- Below the existing JWC card (around line 599), render a sibling card when
  `warRiskBreakdownBallast && warRiskBreakdownBallast.totalPremiumUsd > 0`:

```tsx
{warRiskBreakdownBallast && warRiskBreakdownBallast.totalPremiumUsd > 0 && (
  <div data-testid="warrisk-ballast-section" className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
    <h3 className="text-xs font-semibold text-amber-900">
      JWC War Risk — Ballast Reposition (per voyage)
    </h3>
    {warRiskZonesBallast && warRiskZonesBallast.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {warRiskZonesBallast.map((zone) => (
          <span key={zone} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">{zone}</span>
        ))}
      </div>
    )}
    <div className="space-y-1 text-xs">
      {/* hull, crew, P&I, total — same layout as laden card */}
    </div>
  </div>
)}
```

The existing laden card needs a heading tweak — change "JWC War Risk (per voyage)" →
"JWC War Risk — Laden Voyage (per voyage)" so the two labels are unambiguous. Existing
`data-testid="warrisk-section"` is preserved (tests still find it); new test id
`warrisk-ballast-section` is the new one.

### Step 6 — Pass props through MatchTabs
`components/match/MatchTabs.tsx:82-84` — extend the EconomicsTab call:

```tsx
<EconomicsTab
  // …
  warRiskPremium={match.economics?.breakdown?.warRiskPremium ?? null}
  warRiskZones={match.economics?.breakdown?.warRiskZones ?? null}
  warRiskBreakdown={match.economics?.breakdown?.warRiskBreakdown ?? null}
  warRiskBreakdownBallast={match.economics?.breakdown?.warRiskBreakdownBallast ?? null}  // ← new
  warRiskZonesBallast={match.economics?.breakdown?.warRiskZonesBallast ?? null}          // ← new
  storedTceUsdPerDay={storedTceUsdPerDay}
/>
```

---

## 3. Stored TCE / regen impact — the make-or-break scope question

**Answer: live-display-only. No regen. No Rule-22 prod-apply.**

Verification trail:

1. `lib/matching/tce-calculator.ts:208-213` comment is explicit:
   > "the per-day figure excludes [war-risk] (the TCE engine blanks the route ports),
   > mirroring the persisted column and the live economics breakdown, where war risk is
   > a separate cost line."

2. `tceUsdPerDay` (returned from `buildMatchEconomics`, line 250) is
   `tce.tce_usd_per_day` from `computeEstimatedTce(freight, distance, dwt, qty, speed,
   consumption)`. **`computeEstimatedTce` takes no war-risk input.** Adding ballast
   war-risk to `totalUsd` and the breakdown changes neither `computeEstimatedTce`'s
   inputs nor outputs.

3. `lib/matching/persist-session-matches.ts:67-70` is the canonical persistence path:
   ```ts
   const storedTce = m.economics?.tceUsdPerDay;
   if (storedTce != null && Number.isFinite(storedTce)) tce_usd_per_day = storedTce;
   ```
   The persisted DB column equals `m.economics.tceUsdPerDay` — i.e. the war-risk-free
   per-day from `computeEstimatedTce`. **Unchanged by this PR.**

4. `m.economics.breakdown.warRiskBreakdown*` is NOT persisted as a column. Only
   `tce_usd_per_day`, `distance_nm`, `freight_rate_usd_per_mt`, `freight_rate_source`,
   plus identifying/ranking scalars. The breakdown is recomputed every session by
   `analyzePairs` → `pair-analyzer.ts:780`.

5. `lib/matching/session-buckets.ts:63` and `scripts/demo-seed/regenerate-matches.ts:284`
   also persist `m.economics?.tceUsdPerDay` (same scalar) — no breakdown.

6. `score`, `fitPercent`, ranking are all determined before `buildMatchEconomics` runs
   (`pair-analyzer.ts:741-746` comment: "Display-only: computed AFTER the realism
   partition so it can never affect score, ranking, or bucketing").

**Therefore:** after deploy, a session's next `analyzePairs` pass picks up the new ballast
breakdown automatically. The seed snapshot DB (`__demo_review__`, `__demo_insufficient__`)
keeps the same `tce_usd_per_day` values; only the in-memory live breakdown gains the
ballast block.

**Caveat — `totalUsd` field.** `EconomicsResult.totalUsd = tce.breakdown.total_costs_usd
+ warCombinedTotal` grows by the ballast premium when it's non-zero. `totalUsd` is **not
persisted** (grep confirms no `total_usd` column in matches table) — display-only — so
no migration needed. If any consumer test asserts the old laden-only `totalUsd`, the
PR will update it (the value is correct per the new semantics; this is an expected,
non-test-rewrite change because the behaviour is the intentional one). PI3 budget should
not be touched here — `totalUsd` assertions live in `lib/matching/__tests__/tce-calculator.test.ts`;
if any of them assume HRA load/discharge ports they'll fail until updated. **Action
during impl:** grep test files for `totalUsd` and `warRiskPremium` in same expectation,
confirm only laden-port test cases — if a test happens to use an HRA open position it
is now off by the ballast premium; that's the new correct behaviour. Cap: ≤2 test
expectation updates expected. PI3 stays under budget.

---

## 4. TDD — test plan

**File:** `lib/matching/__tests__/tce-calculator-warrisk-ballast.test.ts` (new)

Three behavioural cases — written **before** any impl edit:

```ts
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

describe('buildMatchEconomics — ballast-leg war risk', () => {
  const baseInput = {
    cargoType: 'GRAIN',
    distanceNm: 5800,
    vesselDwt: 5328,
    quantityMt: 3000,
    speedKts: 11,
    consumptionMt: 14,
    loadPort: 'Marmara',
    dischargePort: 'Veracruz',
    calculatedAt: '2026-06-04T00:00:00.000Z',
    vesselValueUsd: 22_000_000,
  };

  it('SEAGULL-12 case: ballast through Red Sea HRA → non-zero ballast premium', () => {
    const econ = buildMatchEconomics({ ...baseInput, vesselOpenPosition: 'Hodeidah, Yemen' });
    expect(econ).not.toBeNull();
    // Laden leg (Marmara→Veracruz) hits no HRA
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeUndefined();
    // Ballast leg (Hodeidah→Marmara) crosses Red Sea HRA
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd).toBeGreaterThan(0);
    expect(econ!.breakdown.warRiskZonesBallast).toContain('Red Sea / Bab al-Mandeb HRA');
    // Combined total + totalUsd reflect the ballast premium
    expect(econ!.breakdown.warRiskTotalCombined).toBe(
      econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd,
    );
  });

  it('non-warzone open position → zero ballast premium, no change to laden', () => {
    const econ = buildMatchEconomics({ ...baseInput, vesselOpenPosition: 'Rotterdam' });
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeUndefined();
    // warRiskTotalCombined falls back to laden-only (which is also 0 here)
    expect(econ!.breakdown.warRiskTotalCombined).toBe(0);
  });

  it('omitted openPosition → identical to legacy laden-only result', () => {
    const econLegacy = buildMatchEconomics(baseInput);                       // no openPosition
    const econExplicit = buildMatchEconomics({ ...baseInput, vesselOpenPosition: null });
    expect(econLegacy!.totalUsd).toBe(econExplicit!.totalUsd);
    expect(econLegacy!.breakdown.warRiskBreakdownBallast).toBeUndefined();
  });

  it('laden voyage in HRA + ballast also in HRA → both premiums present and summed', () => {
    const econ = buildMatchEconomics({
      ...baseInput,
      loadPort: 'Odessa',                    // Black Sea HRA
      dischargePort: 'Constanta',            // also Black Sea HRA
      vesselOpenPosition: 'Hodeidah',        // Red Sea HRA
    });
    expect(econ!.breakdown.warRiskBreakdownLaden).toBeDefined();
    expect(econ!.breakdown.warRiskBreakdownBallast).toBeDefined();
    expect(econ!.breakdown.warRiskTotalCombined).toBe(
      econ!.breakdown.warRiskBreakdownLaden!.totalPremiumUsd +
      econ!.breakdown.warRiskBreakdownBallast!.totalPremiumUsd,
    );
  });
});
```

Cross-check existing tests:
- `lib/matching/__tests__/tce-calculator.test.ts` — review for any `totalUsd` /
  `warRiskPremium` assertions; expected to be unchanged because they use non-HRA
  load/discharge ports and (in the legacy code) no openPosition was ever passed.
  PI3 budget: ≤2 updates if a test happens to use HRA ports.
- `__tests__/lib/matching/persist-session-matches-canonical-tce.test.ts` — should not
  fire (we don't touch `tce_usd_per_day`).
- `lib/sailing/__tests__/match-filters-war-position.test.ts` — unaffected (different
  function — hard-filter gate, not premium).

UI test (smoke, no new render harness — extend existing if EconomicsTab tests exist;
otherwise defer to manual / Playwright):
- Search `__tests__/` for `warrisk-section` test-id; if a render test exists, add a
  case rendering with `warRiskBreakdownBallast` and assert `getByTestId('warrisk-ballast-section')`.
- If no render test exists, manual verify per Step 7 below.

---

## 5. Implementation order (subagent-driven-development)

1. **TDD red:** write `tce-calculator-warrisk-ballast.test.ts` (Step 4 of the plan, the
   test cases above) — confirm all 4 fail.
2. **Type extension:** edit `lib/types.ts` to add the four new fields on
   `EconomicsBreakdown` (Step 4 of design). TypeScript builds.
3. **Compute change:** edit `lib/matching/tce-calculator.ts` per Step 2 of design.
   Tests should now turn green.
4. **Wire openPosition:** edit `lib/matching/pair-analyzer.ts:780` per Step 3 of design.
5. **UI props:** edit `components/match/MatchTabs.tsx` + `components/match/EconomicsTab.tsx`
   per Steps 5–6 of design.
6. **Cross-cutting grep** before commit:
   ```bash
   grep -rn 'warRiskBreakdown\b' __tests__/ lib/ components/ app/  # ensure no broken consumer
   grep -rn 'warRiskPremium' __tests__/ lib/ components/ app/      # confirm BC field still works
   grep -rn 'totalUsd' lib/matching/__tests__/                     # PI3 budget check
   ```
7. **Manual verify** (post-impl):
   - Run a session with SEAGULL-12 / Hodeidah open + Marmara→Veracruz cargo.
   - Open `/match/<slug>`, click Economics tab.
   - Expect: laden "JWC War Risk — Laden Voyage" card absent or $0; ballast
     "JWC War Risk — Ballast Reposition" card present with ~$46k total
     (hull ~$16.5k + crew $10k + P&I $20k for a $22M vessel through Red Sea HRA at
     0.075% per transit).
   - Voyage P&L chart at the bottom (from `/api/voyage/tce`) is *unchanged* —
     deferred (see §1, out-of-scope note).

---

## 6. Acceptance criteria

- `npm test -- --findRelatedTests lib/matching/tce-calculator.ts` → all green, including
  4 new cases.
- `npx tsc --noEmit` clean.
- `npm test -- lib/matching/__tests__/persist-session-matches-canonical-tce.test.ts` →
  green (we did not touch `tce_usd_per_day`).
- Manual: `/match/<seagull-slug>` Economics tab shows two labelled war-risk cards (or
  one + "no laden zones") with the ballast premium ≈ $46k.
- DB inspection: `SELECT tce_usd_per_day FROM matches WHERE vessel_name LIKE '%SEAGULL%'`
  unchanged from baseline (confirms display-only).

---

## 7. Out of scope (explicit)

- **TCE-days off-ramp** — the existing voyage-day rounding / weight-conservative
  branches in `computeEstimatedTce` are not touched. Recon's per-day TCE bug discussion
  is unrelated.
- **`/api/voyage/tce` endpoint** (used by `VoyageBreakdownChart`) — accepts only the
  laden voyage (origin/destination) from the EconomicsTab form. Folding ballast war-risk
  into that path requires also passing `vesselOpenPosition` through the request body
  and updating `voyage-calculator.ts`. **Deferred** to a follow-up.
- **Weight / laycan polish waves** — orthogonal.
- **Demo-seed regeneration / Rule-22 prod-apply** — not required (see §3). The seed DB's
  persisted `tce_usd_per_day` values do not change.
- **`m.economics.totalUsd` consumers other than EconomicsTab** — grep step in §5 will
  flag any; expected to be display-only callers.

---

## 8. Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| A test elsewhere asserts the old `totalUsd` (laden-only) for an HRA case | Low | Grep in §5; expected ≤2 fixes; PI3 budget covered |
| Founder later flips A1 → laden-only (B-option) | Low | Behaviour is opt-in via `vesselOpenPosition`; passing `null` reverts to legacy total |
| `cfValue(vessel.openPosition)` is a `ConfidenceField` not a plain string for some parsed shapes | Low | `cfValue` unwraps both shapes; `string \| null` lands at the call site (matches signature of `vesselOpenPosition` field in pair-analyzer.ts:141 already in use) |
| Two HRA cards on the same screen look noisy when both are non-zero | Low | Founder explicitly requested both visible. Colour-code: orange = laden (existing), amber = ballast (new). |

---

## 9. Open questions

None blocking. The TCE-storage analysis (§3) confirms code-only scope, ~5 lines of core
compute + ~30 lines of UI + 1 type extension + 4 unit tests.
