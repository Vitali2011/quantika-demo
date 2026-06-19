# RECON: Vessel Vetting Honesty — 0.6 Default Bias

**Task 6 · Campaign: ЧЕСТНОСТЬ ВЕТИНГА**
**Date:** 2026-06-19
**Status:** RECON DONE — no code changes; read-only investigation

---

## Q1 — WHERE does 0.6 appear?

### Root constant

**`lib/sailing/vessel-vetting.ts:37–42`**

```ts
export const VETTING_VERDICT_SHARE: Record<VettingVerdict, number> = {
  ok: 1.0,
  caution: 0.65,
  warn: 0.2,
  unknown: 0.6,   // ← THE bias
};
```

Comment in the file (line 6): _"unknown per-factor → neutral (0.6 share) — missing data ≠ penalty"_

### Factor functions that return `verdict: 'unknown'`

| Factor | Function | Triggers unknown |
|--------|----------|-----------------|
| **flag** | `scoreFlag` (line 46) | `flag === null` OR flag not in Paris MoU table |
| **class** | `scoreClass` (line 63) | `classSociety === null` |
| **age** | `scoreAge` (line 73) | `built === null` OR `built > refYear` |
| **pandi** | `scorePandi` (line 90) | `pandi === null` |
| **cii** | `scoreCii` (line 114) | `ciiRating == null` |
| **psc** | `scorePsc` (line 104) | **NEVER** — PSC is not scored as unknown; it is **omitted entirely** when `detentionCount` is absent (line 151–153: `if (detentionCount != null) factors.push(scorePsc(...))`) |

There is a parallel `UNKNOWN_SHARE = 0.6` constant at **`lib/sailing/fit-breakdown.ts:81`** used by other fit factors (utilisation, classFit, etc.), but those are independent of vetting.

---

## Q2 — HOW does 0.6 flow into fit%?

### Averaging formula (`vessel-vetting.ts:155–156`)

```ts
const avgShare =
  factors.reduce((sum, f) => sum + VETTING_VERDICT_SHARE[f.verdict], 0) / factors.length;
```

- `factors.length` is **always 5** (no PSC) or **6** (with PSC when detentionCount supplied).
- **Unknown factors ARE included in the denominator.** If 3/5 factors are unknown and 2/5 are ok: avgShare = (3×0.6 + 2×1.0)/5 = **0.76**, not 1.0 from the 2 known factors.
- All-unknown example: 5×0.6 / 5 = **0.60** (the bias)

### Vetting component score (`fit-breakdown.ts:497–518`)

```ts
export function scoreVetting(vessel, refYear?, detentionCount?): FitBreakdownComponent {
  const w = FIT_WEIGHTS.vetting;  // = 7
  const result = computeVesselVetting(effectiveVessel, { refYear, detentionCount });
  return {
    factor: 'vetting', label: 'Vessel vetting',
    weight: w,
    score: Math.round(w * result.score * 10) / 10,  // 7 × avgShare, rounded to 0.1
    ...
  };
}
```

### Fit% final formula (`fit-breakdown.ts:661, 718`)

```ts
const rawSum = components.reduce((a, c) => a + c.score, 0);
let fit = rawSum - sanctionsPenalty - chartererPenalty;
// ... caps applied ...
const fitPercent = Math.max(0, Math.min(100, Math.round(fit * 10) / 10));
```

**TOTAL_WEIGHT = 100.** Fit% = (Σ component scores − penalties − caps) mapped to [0, 100].

Vetting weight = **7** out of 100. The vetting component score range:

| Scenario | avgShare | score | Contribution to fit% |
|----------|----------|-------|----------------------|
| All ok | 1.0 | 7.0 | 7.0 |
| All unknown (current) | 0.6 | 4.2 | 4.2 |
| All unknown (neutral 0.5) | 0.5 | 3.5 | 3.5 |
| All warn | 0.2 | 1.4 | 1.4 |

**Unknown DOES contribute to the denominator** — no renormalization happens today.

---

## Q3 — Honest alternatives (developer analysis)

### Option A: Exclude unknown from weighted average (renormalize)

Only known factors contribute; denominator = count of known factors.
Edge case: all unknown → avgShare undefined; must return a special value.

```ts
// Proposed implementation sketch
const known = factors.filter(f => f.verdict !== 'unknown');
const avgShare = known.length > 0
  ? known.reduce((s, f) => s + VETTING_VERDICT_SHARE[f.verdict], 0) / known.length
  : null; // or 0.5 or signal "no data"
```

**Pros:**
- Known factors get full signal weight (no dilution from missing data)
- Consistent with how brokers think: "this vessel has a black flag; I don't care it has no CII data"
- Most representative when most factors ARE known

**Cons:**
- With 1 known factor + 4 unknown: vetting = 100% (if that 1 factor is ok). **Score inflation on sparse data.**
- Edge case: all unknown → must decide score (0.5? 0? exclude?). Introduces another arbitrary choice.
- Counter-intuitive for the broker: a vessel where only flag is known but flag is ok gets same vetting % as a fully vetted vessel.
- **Fit% change**: net effect ambiguous — inflation for partially-known, deflation for all-unknown.

### Option B: Change 0.6 → 0.5 (truly neutral)

One-line change: `VETTING_VERDICT_SHARE.unknown = 0.5`.

**Pros:**
- 0.5 is the midpoint of [0,1]: genuinely "no opinion" / no reward, no penalty
- Minimal diff; easy to audit; predictable behavior
- Unknown stays in the denominator (no edge cases)

**Cons:**
- Still doesn't communicate "no data" to the broker — just scores it slightly lower
- The 0.1 difference (0.6→0.5) is small in absolute terms (≤0.7 fit points even for all-unknown)
- Doesn't align with DD panel behavior which already shows "нет данных" for unknown factors

### Option C: "No data" — exclude vetting factor entirely when all/most unknown

If a vessel has N or more unknown factors, set vetting `weight = 0` and exclude its score from rawSum. The denominator drops from 100 to 93. Other factors scale up slightly.

```ts
// Proposed sketch
if (unknownCount === 5) {
  return { factor: 'vetting', weight: 0, score: 0, rationale: 'No vetting data available.' };
}
```

**Pros:**
- Fully honest: missing data doesn't contribute (positive or neutral) to fit%
- Consistent with DD panel's `unknown → inactive` treatment (already implemented in `due-diligence.ts:257`)
- Broker sees fit% built only from real data

**Cons:**
- TOTAL_WEIGHT shrinks dynamically → fit% for data-poor vessels is driven by 93-pt scale
  (slightly inflating other factors, which may not be desired)
- Hard threshold (N unknowns) introduces another calibration decision
- Implementation more complex; changes the semantics of `FitBreakdownComponent.weight`

### Fit% magnitude per option

| Scenario | Current (0.6) | Option B (0.5) | Option A (excl) | Option C (excl all-unk) |
|----------|--------------|----------------|-----------------|------------------------|
| 5/5 unknown | 4.2 | 3.5 | 0 (or 3.5) | 0 (weight=0) |
| 4/5 unknown | 4.6 | 4.0 | score of 1 known factor | depends |
| 2.5/5 unknown (avg demo) | ~5.3 | ~4.9 | ~6.4 (inflation!) | ~5.3 |
| 0/5 unknown | same | same | same | same |

Average fit% bias vs. neutral-0.5 for demo corpus (90 vessels, avg 2.51 unknown factors):
**+0.35 fit points per vessel** (range: +0.14 to +0.7).

---

## Q4 — Impact: how many vessels affected?

### Demo data (`lib/sample-data/demo-parsed-vessels.json`, 90 vessels)

| Unknown factor count | Vessel count | % | Fit% overstatement vs. neutral |
|---------------------|-------------|---|-------------------------------|
| 1 unknown (just CII) | 35 | 38% | +0.14 pts |
| 2 unknown | 16 | 17% | +0.28 pts |
| 3 unknown | 6 | 6% | +0.42 pts |
| 4 unknown | 24 | 26% | +0.56 pts |
| 5 unknown (all) | 9 | 10% | +0.70 pts |

**Per-factor null rates in demo seed:**

| Factor | Null rate |
|--------|-----------|
| flag | 40% (36/90) |
| built (age) | 11% (10/90) |
| classSociety | 38% (35/90) |
| pandi | 61% (55/90) |
| **ciiRating** | **100% (90/90)** — all unknown |

**CII is always unknown across all 90 demo vessels.**
The Equasis backfill (`#1032`) enriched 22 vessels with real flag/built/class/P&I — but CII was never fetched.

### Value-bearing regen + prod

- **Value-bearing regen** (`scripts/demo-seed/real-matches.ts`, `patch-fit.ts`, `build.ts`):
  All three scripts call `computeFitBreakdown` which calls `scoreVetting` → the bias is baked into
  all stored `fit_percent` and `fit_breakdown` JSON. Any fix requires a regen pass.
- **Prod (pair-analyzer.ts:747)**: `computeFitBreakdown` called live on every match → fix takes
  effect immediately on next `pair-analyzer` run without regen.
- **Estimated fit% shift on regen with Option B**: −0.14 to −0.7 per match (small, unlikely to
  reorder board rankings; no anchor thresholds at boundaries that would trigger cap changes).

---

## Q5 — Consumers: where does vetting appear in UI?

### 1. Fit% headline (all match views)

Vetting is 7/100 of the fit% headline displayed everywhere a match score appears.
The bias lives here silently — the user sees "72%" not knowing it includes +0.7 from unknown vetting.

### 2. VettingBreakdown accordion (Vessels tab)

`components/match/VettingBreakdown.tsx:25`:
```ts
const pct = Math.round((vetting.score / vetting.weight) * 100);
```
Displays "Vetting detail 60%" for an all-unknown vessel. Green threshold ≥80%, amber ≥50%.
At 60% unknown → amber, which looks like real data.

### 3. Due Diligence panel — buildVetting (`lib/matching/due-diligence.ts:243–284`)

**Already honest.** Line 254–257:
```ts
const state: DDState =
  f.verdict === 'ok' ? 'pass'
  : f.verdict === 'caution' || f.verdict === 'warn' ? 'caution'
  : 'inactive'; // unknown → honesty: no data on this vessel
```
DD panel shows "нет данных по судну" and `inactive` state for each unknown vetting factor.
The hero counter counts only `pass`/`caution`/`info` — inactive rows excluded.

**KEY INCONSISTENCY:** The DD panel is already honest (unknown → inactive, not counted),
but the fit% includes a positive 0.6 contribution from the same unknown data.

### 4. VesselPassportPanel (`components/vessel/VesselPassportPanel.tsx`)

Separate from fit%; renders `null` rows for absent data (already honest: "if (!hasData) return null").

---

## ROOT CAUSE

The `VETTING_VERDICT_SHARE.unknown = 0.6` was set with the intention "missing data ≠ penalty"
(per the file comment). But 0.6 is above 0.5, so unknown data gives a **mild positive reward**,
not a neutral treatment. This means a vessel with no vetting data looks better in fit% than
a vessel with one confirmed 'caution' factor (0.65 per factor, vs. 0.6 for unknown).

The DD panel independently reached the more honest conclusion (inactive = no data = don't count),
creating a split: DD panel is honest, fit% is not.

---

## DEVELOPER RECOMMENDATION (фаундеру на выбор)

### Путь 1: Option B — Neutral 0.5 (simple, minimal risk)

Change `VETTING_VERDICT_SHARE.unknown: 0.6 → 0.5` in `vessel-vetting.ts:41`.
Parallel change in `fit-breakdown.ts:81` optional (controls other factors, not vetting).

- Impact: −0.14 to −0.7 fit points per vessel; requires demo regen.
- Pro: 1-line diff, auditable, no edge cases.
- Con: Still doesn't signal "no data" to the broker; just scores slightly lower.

### Путь 2: Option C — Exclude all-unknown vetting from fit% (honest, moderate complexity)

When all 5 vetting factors are unknown (detentionCount absent), return `weight: 0, score: 0`
from `scoreVetting`, then adjust `TOTAL_WEIGHT` dynamically in `computeFitBreakdown`.

- Impact: 9 demo vessels (10%) get vetting removed from denominator; fit% denominator becomes 93.
- Pro: Consistent with DD panel inactive treatment; truly honest.
- Con: Dynamic denominator complicates anchors; may need anchor recalibration.
- Requires: regen of demo matches + a new edge-case test.

### Путь 3: Hybrid (recommended by developer for full honesty)

- Change `VETTING_VERDICT_SHARE.unknown: 0.6 → 0.5` globally (neutral, no reward).
- For the VettingBreakdown UI display (`VettingBreakdown.tsx`): show "нет данных" label
  instead of "60%" when all factors are unknown/inactive.
- No fit% denominator change; just stops inflating.

---

## Files referenced

| File | Lines | Role |
|------|-------|------|
| `lib/sailing/vessel-vetting.ts` | 37–42, 46–126, 136–163 | Root constants + 5 factor scorers |
| `lib/sailing/fit-breakdown.ts` | 51–62, 81–91, 492–518, 637–738 | FIT_WEIGHTS, UNKNOWN_SHARE, scoreVetting, computeFitBreakdown |
| `lib/matching/pair-analyzer.ts` | 743–759 | Live scoring, detentionCount lookup |
| `lib/matching/due-diligence.ts` | 243–284 | DD panel — already honest (inactive for unknown) |
| `components/match/VettingBreakdown.tsx` | 14–41 | Vetting accordion in Vessels tab |
| `components/match/DueDiligencePanel.tsx` | 48–101 | DD panel renderer |
| `lib/sample-data/demo-parsed-vessels.json` | — | 90 demo vessels; CII 100% null |
| `scripts/demo-seed/real-matches.ts` | 331–357 | Value-bearing regen via computeFitBreakdown |
