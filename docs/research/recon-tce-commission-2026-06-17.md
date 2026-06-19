# RECON: TCE Commission Gap — 2026-06-17

**Task:** #1053 (КОМИССИЯ В TCE campaign, Task 7)
**Status:** RECON COMPLETE
**Branch:** claude/1781841777-recon-tce-comm
**Author:** orchestrator subagent

---

## Summary

TCE is currently computed as `(grossFreight - costs) / days` where `grossFreight = quantity × freightRate`. No commission deduction exists anywhere in the computation chain. Commission data IS parsed from cargo emails and stored in `ParsedCargo.commissionPercent`, but it is never wired into `TceInputs` or the `computeTce()` function. The reported TCE is therefore **gross-of-commission**, which overstates owner net earnings by 2.5–3.75% of freight.

---

## Q1 — WHERE is TCE computed; exact formula and slots

### Primary entry-point: `lib/economics/compute-tce.ts:134` — `computeTce(TceInputs)`

```
grossFreight = Math.round(quantity * rate)            // line 248
totalCosts   = bunker + canal + da + warRisk + ets + fueleu  // line 249
netVoyage    = grossFreight - totalCosts              // line 250
dailyTce     = dailyNetVoyage / duration              // line 257
```

`dailyNetVoyage` differs from `netVoyage` only for war-risk exclusion:

```ts
const dailyNetVoyage = inputs.excludeWarRiskFromDailyTce
  ? grossFreight - (bunkerUsd + canalUsd + daUsd + etsUsd + fueleuUsd)
  : netVoyage;
```

### Commission slot needed

The correct insertion point is at `grossFreight`:

```ts
// NEW: net_freight = grossFreight × (1 - commPct/100)
const netFreight = commPct > 0 ? Math.round(grossFreight * (1 - commPct / 100)) : grossFreight;
```

Then replace `grossFreight` with `netFreight` in both `totalCosts` aggregation (for `netVoyage`) and in the `dailyNetVoyage` expression (for list/detail parity — see Q5).

### Call chain

```
computeTce()           ← canonical entry-point
  ← voyage-calculator.ts:calculateTCE()     (detail page via /api/voyage/tce)
  ← tce-calculator.ts:buildMatchEconomics() (stored list path)
  ← stored-match-economics.ts               (PATCH / recompute stored match)
```

---

## Q2 — Industry standard; existing commission fields

### Industry norm

- **Address commission:** 1.25–2.5% paid to charterer's broker
- **Brokerage:** 1.0–1.25% paid to shipbroker
- **TTL (Total):** typically 3.75% (most common), sometimes 5% on some routes
- Standard fixture recap language: `"3.75% TTL BENDS"`, `"3.75% ttl add/brokerage"`

### Fields already in the data model

| Location | Field | Notes |
|---|---|---|
| `lib/types.ts:226` | `ParsedCargo.commissionPercent: number \| null` | Parsed from cargo email |
| `lib/types.ts:227` | `ParsedCargo.commissionTerms: string \| null` | e.g. `"TTL"`, `"ADDCOMPUS"` |
| `lib/schemas/parse-cargo.ts:59` | `commission_percent` in AI schema | LLM extraction target |
| `lib/sample-data/synthetic-economics.ts:38` | `commissionPercent: 3.75, commissionTerms: 'TTL'` | Demo fixture uses 3.75% |
| `lib/types.ts:356-364` | `ParsedFixtureRecap.commissionPercent/AddressPct/BrokerPct` | Recap-level breakdown |

### What does NOT exist

- `TceInputs` (compute-tce.ts:36) has **no `commissionPct` field**
- `MatchEconomicsInput` (tce-calculator.ts:256) has **no commission field**
- The matches DB table has **no `commission_percent` column** (checked all 053 migrations)
- `app/api/voyage/tce/route.ts` VoyageInputSchema has **no commission field**
- `buildMatchEconomics()` call (tce-calculator.ts:354) passes **no commission**

### lib/commission.ts — wrong scope

`lib/commission.ts` exists but handles **fixture-recap commissions only** (backward-looking brokerage invoicing). It is called from `app/api/ai/parse-recap/route.ts` for the `/commission` summary page. It has no connection to the TCE computation pipeline.

---

## Q3 — Impact: how much does TCE fall, which matches cross breakeven

### Formula

```
TCE_impact = (grossFreight × commPct%) / durationDays
```

### Worked examples

| Route | Rate $/mt | Qty mt | Gross$ | Comm% | Comm$ | Days | TCE drop $/day |
|---|---|---|---|---|---|---|---|
| CNSHA→NLRTM (Supramax) | 35 | 50,000 | 1,750,000 | 3.75 | 65,625 | 50 | **-1,313** |
| Black Sea→Turkey (Handymax) | 20 | 30,000 | 600,000 | 3.75 | 22,500 | 15 | **-1,500** |
| USGC→Europe (Panamax) | 38 | 65,000 | 2,470,000 | 3.75 | 92,625 | 25 | **-3,705** |
| Short haul (intra-Med) | 18 | 20,000 | 360,000 | 2.5 | 9,000 | 8 | **-1,125** |

### Breakeven thresholds (`lib/economics/breakeven-thresholds.ts`)

```
DWT ≤ 15,000 → $1,500/day
DWT ≤ 40,000 → $3,000/day
DWT ≤ 65,000 → $5,500/day  ← supramax demo vessel lands here
DWT > 65,000  → $7,500/day
```

**Demotion risk:** A match currently showing TCE $7,000/day (above $5,500 breakeven) becomes $5,500–$6,000/day after 3.75% commission → **may still be above breakeven** for supramax. However, for routes where commission is large relative to freight (short high-rate routes), the delta can be $1,500–$3,700/day. Matches near the breakeven line WILL be demoted to `review` or `borderline`.

**Typical real-world matches where commission pushes below breakeven:**
- High-commission (3.75%) + short voyage (low total freight) + mid-range TCE → drop crosses $3,000 for handymax
- Panamax route with large quantity: commission cost alone exceeds the buffer by $3,705/day

### Magnitude conclusion

**$1,000–$3,700/day overstatement** depending on route. This is material — the same order of magnitude as bunker cost impact.

---

## Q4 — TCE consumers that must be synchronized

| Consumer | File | Note |
|---|---|---|
| **Match list TCE** | `app/matches/MatchesClient.tsx:1168` | reads `match.tce_usd_per_day` from DB |
| **Match detail (stored)** | `app/match/[id]/page.tsx:206` | `storedMatch.tce_usd_per_day` |
| **Match detail (live recalc)** | `components/match/EconomicsTab.tsx:392` | POSTs to `/api/voyage/tce` |
| **DD panel breakeven check** | `app/match/[id]/page.tsx:207` | `breakevenTce` from DB |
| **Worked-calc waterfall** | `components/match/EconomicsTab.tsx:729` | renders `voyageBreakdown` |
| **Breakeven recompute** | `lib/matching/stored-match-economics.ts` | persists `tce_usd_per_day` |
| **Commission display** | `components/match/EconomicsTab.tsx:495-500` | already shows `commissionPercent` as label — NOT deducted |

**The commission label in `EconomicsTab` (line 495) is DECORATIVE only.** It shows the % but does not affect the TCE figure displayed below it.

---

## Q5 — Parity: list == detail; symmetric with excludeWarRiskFromDailyTce

### Current parity convention

`excludeWarRiskFromDailyTce: true` is the existing mechanism for list=detail parity. The stored-match path (list) and the detail `/api/voyage/tce` path both set this flag so war-risk is excluded from the `dailyNetVoyage` numerator but shown as a separate cost line.

### How commission parity MUST work

Commission is NOT like war-risk. It is a direct deduction from freight — it should reduce `netFreight` before any other calculation. Therefore:

1. **`computeTce()`** needs a new `commissionPct?: number` field in `TceInputs`
2. `grossFreight` stays `quantity × rate` (the actual freight contracted)
3. NEW: `commissionUsd = Math.round(grossFreight × commPct / 100)`
4. `netFreight = grossFreight - commissionUsd`
5. Replace uses of `grossFreight` in the aggregation lines with `netFreight`:
   - `totalCosts` aggregation → keeps same structure (commission is shown as a separate line)
   - OR commission is deducted from `grossFreight` before `netVoyage`; both are acceptable
6. `breakdown` gets a new `commission_usd` line item for the waterfall UI
7. **Both paths** (stored-match and detail API) must receive `commissionPct`:
   - `buildMatchEconomics()` → from `cargo.commissionPercent`
   - `/api/voyage/tce` → from new optional schema field `commissionPct`
   - `EconomicsTab` → pass `commissionPercent` into the voyage POST body

### Symmetric approach (mirrors war-risk exclusion pattern)

```ts
// In computeTce():
const commissionUsd = commPct > 0 ? Math.round(grossFreight * commPct / 100) : 0;
const netFreight = grossFreight - commissionUsd;
// Replace grossFreight → netFreight in netVoyage line
const totalCosts = bunkerUsd + canalUsd + daUsd + warRiskUsd + etsUsd + fueleuUsd;
const netVoyage = netFreight - totalCosts;   // was: grossFreight - totalCosts
// dailyNetVoyage:
const dailyNetVoyage = inputs.excludeWarRiskFromDailyTce
  ? netFreight - (bunkerUsd + canalUsd + daUsd + etsUsd + fueleuUsd)
  : netVoyage;
```

No second flag needed for commission parity — it goes into `netFreight` uniformly on BOTH paths.

---

## Q6 — Root cause, not symptom

**Root cause:** `TceInputs` has no `commissionPct` field. The field was never added when the commission parsing was built (PR #231 added breakdown fields to `ParsedFixtureRecap`). The commission data flows through cargo parse → `ParsedCargo.commissionPercent` → displayed in `EconomicsTab` as a decorative label, but was never wired into the economics engine.

**Not a display bug.** The stored `tce_usd_per_day` DB column is also wrong (gross-of-commission). Any match regeneration that includes commission will lower the persisted TCE and may trigger fit-score recomputation.

---

## Q7 — Decision fork for founder

Before implementation, confirm:

1. **Should commission always be deducted?** Or only when `commissionPercent` is explicitly set in the cargo email?
   - Recommendation: deduct only when `commissionPercent != null` (don't apply a default). This preserves existing TCE for matches where commission is absent/unknown.
   - Alternative: apply a default (e.g. 3.75%) when absent. This would uniformly lower all TCEs but loses the null-means-unknown signal.

2. **Which commission rate to use when `commissionTerms` splits address/brokerage?**
   - Recommendation: use the total `commissionPercent` (which already represents TTL per parsing rules).

3. **Retroactive regen + prod deploy?**
   - Needs a backfill script for existing match rows (similar to #1044 backfill for CBM/DWT).
   - All 22 demo vessels' matches would get lower TCE values. Some matches near breakeven will be demoted.
   - Recommend: implement, test, regenerate demo corpus, deploy to prod.

---

## Implementation plan (if founder approves)

### Files to change

1. **`lib/economics/compute-tce.ts`** — add `commissionPct?: number` to `TceInputs`; insert commission deduction; add `commission_usd` to `TCEBreakdown`
2. **`lib/economics/voyage-calculator.ts`** — pass `commissionPct` from `VoyageInput` → `TceInputs`
3. **`lib/matching/tce-calculator.ts`** — add `commissionPct?: number` to `MatchEconomicsInput`; pass through to `computeTce()`
4. **`lib/matching/stored-match-economics.ts`** — read `cargo.commissionPercent` and pass as `commissionPct`
5. **`app/api/voyage/tce/route.ts`** — add `commissionPct: z.number().optional()` to schema; pass to `calculateTCE()`
6. **`components/match/EconomicsTab.tsx`** — include `commissionPct` in voyage POST body; update waterfall display to show `commission_usd`
7. **`lib/economics/__tests__/compute-tce.test.ts`** — add commission deduction test
8. **Backfill script** — recompute `tce_usd_per_day` for existing matches that have `commission_percent` in parsed cargo

### NOT in scope (this PR)

- `lib/commission.ts` (recap-level brokerage invoicing) — separate concern, no change needed
- Default commission when not parsed — requires separate founder decision
- `commissionTerms` parsing changes — already correct per #231

---

## RECON_DONE

Path: `docs/research/recon-tce-commission-2026-06-17.md`
