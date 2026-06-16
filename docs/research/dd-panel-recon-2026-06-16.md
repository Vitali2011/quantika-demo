# Due Diligence Panel — Recon Report (2026-06-16)

**Branch:** dd-panel  
**Status:** READ-ONLY recon, zero code changes  
**Author:** orchestrator subagent (caveman)

---

## Q1 — WHERE: Insertion Point

### Main render file

**`app/match/[id]/page.tsx`** — Server Component, sole file rendering the match detail page.

#### Structural layout (line refs)

| Block | Lines | Notes |
|-------|-------|-------|
| Hero row (fit pill, title, route) | 192–256 | `data-testid="match-hero"` |
| Vessel + Cargo overview cards | 266–310 | 2-column grid |
| `<MatchWorksheet>` | 313 | Full-width above tabs |
| `<ExplainDealModal>` button | 318–325 | Conditionally rendered when `sessionMatch` |
| `<MatchTabs>` | 327–345 | Vessels / Economics / Passport / Quote / Emails |
| **`<SourceAttributionSection>`** | **347–363** | Last block inside `{sessionMatch && ...}` — INSERTION POINT |
| "Session data unavailable" fallback | 367–373 | When no sessionMatch |
| Right aside `<MatchDetailPanel>` | 375–384 | Sticky, desktop only |

#### Exact JSX insertion point

After line 363 (closing `</>` of the `{sessionMatch && ...}` block), **before** line 366 (`}}`):

```tsx
// app/match/[id]/page.tsx — insert after </SourceAttributionSection> closing bracket (≈line 363):
{cargo && sessionMatch && (
  <DueDiligencePanel
    fitBreakdown={storedMatch.fit_breakdown ?? null}
    fitPercent={storedMatch.fit_percent ?? null}
    worksheet={worksheet}
    sanctions={worksheet?.sanctions ?? null}
    tceUsdPerDay={storedMatch.tce_usd_per_day ?? null}
    vesselLastCargoes={vessel?.lastCargoes ?? null}
    cargoDescription={cargo?.cargoDescription?.value ?? null}
    vessel={vessel ?? null}
  />
)}
```

The component should be full-width (`w-full`) because it lives inside the `flex-1 min-w-0 space-y-4` left column div (line 263) — same container as MatchWorksheet and MatchTabs.

#### Component props signature (recommended)

```tsx
// components/match/DueDiligencePanel.tsx
'use client';

export interface DueDiligencePanelProps {
  /** Serialised FitBreakdown JSON from storedMatch.fit_breakdown */
  fitBreakdown: string | null;
  fitPercent: number | null;
  /** MatchWorksheet from storedMatch.worksheet_json — carries hardFilters + sanctions */
  worksheet: import('@/lib/types').MatchWorksheet | null;
  sanctions: import('@/lib/types').MatchSanctions | null;
  tceUsdPerDay: number | null;
  vesselLastCargoes: string | null;
  cargoDescription: string | null;
  vessel: import('@/lib/types').ParsedVessel | null;
}
```

All props are already materialised on the page at that render point — zero new DB queries needed.

---

## Q2 — DATA SHAPE

### Source: `storedMatch` (DB row, always present)

Comes from `getMatch(db, dbId)` or `getMatchBySlug(...)` — type `MatchRow` in `lib/matching/matches-repository.ts:22`.

| DB column | TS field | Purpose |
|-----------|----------|---------|
| `fit_percent` | `storedMatch.fit_percent` | Hero fit%, single source |
| `fit_breakdown` | `storedMatch.fit_breakdown` | JSON string → `FitBreakdown` |
| `tce_usd_per_day` | `storedMatch.tce_usd_per_day` | Stored TCE, single source |
| `worksheet_json` | parsed to `worksheet: MatchWorksheet` | hardFilters + vessel/cargo snapshot |
| `distance_nm` | `storedMatch.distance_nm` | Laden route nm |
| `ballast_distance_nm` | `storedMatch.ballast_distance_nm` | Ballast nm |
| `freight_rate_usd_per_mt` | `storedMatch.freight_rate_usd_per_mt` | Freight $/mt |

### Source: `sessionMatch` (in-memory Match object, may be absent)

Type `Match` from `lib/types.ts:486`. Extra fields not in DB:

| Field | Type | Purpose |
|-------|------|---------|
| `sessionMatch.hardFilters` | `MatchHardFilters \| undefined` | Hard filter results (live) |
| `sessionMatch.sanctions` | `MatchSanctions \| undefined` | Sanctions screening result |
| `sessionMatch.economics` | `EconomicsResult \| undefined` | Full economics breakdown |

**Key invariant:** `storedMatch.fit_breakdown` is the persisted, authoritative FitBreakdown JSON (written at persist time by `persist-session-matches.ts:188-189`). The panel MUST read from `storedMatch`, not re-derive.

### (a) Fit Breakdown — `FitBreakdown` type

**File:** `lib/types.ts:563–604`  
**Source field:** `storedMatch.fit_breakdown` (JSON string) → parse to `FitBreakdown`

```ts
// lib/types.ts:563
export interface FitBreakdownComponent {
  factor: FitFactor;      // 'utilisation' | 'timing' | 'ballast' | 'classFit' | 'cargoType' | 'cranes' | 'volume' | 'draft' | 'vetting' | 'economics'
  label: string;          // e.g. 'Size / utilisation', 'Vessel vetting', 'Economics (TCE)'
  weight: number;         // e.g. 19, 7, 18
  score: number;          // earned 0..weight
  rationale: string;      // human-readable broker-facing string
  bracketData?: string;   // short structured numbers in brackets
}
export interface FitBreakdown {
  components: FitBreakdownComponent[];
  totalWeight: number;    // usually 100
  fitPercent: number;     // 0..100
  partCargo: boolean;
  vesselClass: string;
  sanctionsPenalty: number;
  chartererPenalty?: number;
  appliedCap: { reason: string; ceiling: number } | null;
  inputs: { distanceNm, gapDays, verdict, utilisation, vesselDwt, cargoWtMax };
}
```

Factor weights: `lib/sailing/fit-breakdown.ts:51–62`  
`utilisation:19, timing:15, ballast:15, classFit:9, cargoType:6, cranes:6, volume:3, draft:2, vetting:7, economics:18`

**For each DD category:**

| DD Category | FitBreakdown factor | field path |
|-------------|--------------------|-----------
| Vessel ↔ Port physics | `draft` | `fb.components.find(c => c.factor === 'draft')` |
| Cargo ↔ Holds | `volume`, `cargoType`, `cranes` | `fb.components.filter(c => ['volume','cargoType','cranes'].includes(c.factor))` |
| Voyage economics | `economics`, `utilisation`, `ballast` | `fb.components.filter(c => ['economics','utilisation','ballast'].includes(c.factor))` |
| Vessel vetting | `vetting` | `fb.components.find(c => c.factor === 'vetting')` |
| Compliance/risk | sanctions from `worksheet.sanctions` | `worksheet?.sanctions` (not a FitBreakdown factor) |

### (b) Vetting sub-factor verdicts

**File:** `lib/sailing/vessel-vetting.ts:17–31`

```ts
export type VettingVerdict = 'ok' | 'caution' | 'warn' | 'unknown';

export interface VettingFactor {
  key: string;    // 'flag' | 'class' | 'age' | 'pandi' | 'cii' | 'psc'
  label: string;  // 'Flag (Paris MoU)', 'Class society (IACS)', 'Vessel age', 'P&I insurance', 'CII rating', 'PSC detentions'
  verdict: VettingVerdict;
  rationale: string;
}

export interface VesselVettingResult {
  score: number;  // 0..1
  factors: VettingFactor[];
  badges: string[];
}
```

**Critical:** The per-factor `VettingFactor[]` is NOT stored. The vetting factor in `fit_breakdown` stores only a single aggregate `FitBreakdownComponent` (score, rolled-up rationale, bracketData). The individual sub-factors (flag / class / age / pandi / cii / psc) are only available by re-calling `computeVesselVetting(vessel, { refYear, detentionCount })` with the live `vessel` object from session.

→ **If the panel wants per-sub-factor rows, it needs `vessel` (ParsedVessel) in scope** and calls `computeVesselVetting` client-side, or renders from the rolled-up `vetting` component rationale only.

`VettingBreakdown.tsx` (line 14) currently reads from `fitBreakdown` JSON — gets the rolled-up rationale only. Full 5/6-factor table requires `vessel` prop.

### (c) Hold cleanliness verdict

**File:** `lib/matching/hold-cleanliness.ts:12–40`

`applyHoldCleanliness` mutates `m.issues[]` in-place. The verdict is NOT a separate structured field — it is encoded as a string in `match.issues`:

- Incompatible: `"Hold cleanliness: incompatible with last cargo (${blockers})"` 
- Extra clean needed: `"Hold cleanliness: extra cleaning required (caution)"`

**UI source:** `VesselsTab.tsx:72–75` re-runs `checkCompatibility(parseLastCargoes(vessel.lastCargoes), newCargo)` client-side with live `vessel.lastCargoes` and cargo description.

→ **The panel must also call `checkCompatibility` client-side** with `vessel.lastCargoes` + `cargoDescription`. Both available via props.

The `L5CCompatResult` type (from `lib/cargo/l5c-matrix.ts`) returns:

```ts
{
  compatible: boolean;
  requires_extra_clean: boolean;
  blocking_pairs: Array<{ previous: string; reason: string }>;
  warnings: string[];
}
```

### (d) Economics / TCE breakdown

**Source:** `storedMatch.tce_usd_per_day` — authoritative single source (list == detail parity per #856).  
**Extended breakdown:** `sessionMatch.economics.breakdown` (type `EconomicsBreakdown`, `lib/types.ts:63–87`):

```ts
export interface EconomicsBreakdown {
  bunkerCost: number;       // USD
  bunkerPort: string;
  euEtsAmount: number;      // EUR
  warRiskPremium: number;   // USD
  warRiskZones: string[];
  canal_usd?: number;       // Canal dues
  ets_usd?: number;
  splitBunkerSavings?: number;
}
```

**For DD panel Economics category checks:**

| Check | Field path |
|-------|-----------|
| TCE vs breakeven | `storedMatch.tce_usd_per_day` vs `storedMatch.breakeven_tce_usd_per_day` |
| TCE fit score | `fb.components.find(c=>c.factor==='economics')` — score/weight/rationale |
| Utilisation % | `fb.components.find(c=>c.factor==='utilisation')` — bracketData has `cargo/vessel mt` |
| Freight rate source | `storedMatch.freight_rate_source` ('manual'/'parsed'/'baltic'/'estimated') |
| Breakeven | `storedMatch.breakeven_tce_usd_per_day` (migration 050) |

### (e) Hard filter results — draft / cranes

**Stored in:** `worksheet.hardFilters` (type `MatchWorksheet.hardFilters`, `lib/types.ts:479`)

```ts
hardFilters: Pick<MatchHardFilters, 'draft' | 'crane' | 'volume'> & Partial<Omit<MatchHardFilters, 'draft' | 'crane' | 'volume'>>
```

Full `MatchHardFilters` (`lib/types.ts:425–441`):

```ts
export interface MatchHardFilters {
  draft: HardFilterCheck;      // load port draft
  crane: HardFilterCheck;      // load port cranes
  volume: HardFilterCheck;
  cargoVessel: HardFilterCheck;
  destDraft: HardFilterCheck;  // discharge port draft
  destCrane: HardFilterCheck;
  cargoWeight: HardFilterCheck;
  imsbc?: HardFilterCheck;
  vesselAge?: HardFilterCheck;
  dimensions?: HardFilterCheck;
  gearRequired?: HardFilterCheck;
  voyage?: HardFilterCheck;
  flagClass?: HardFilterCheck;
  warPositionVoyage?: HardFilterCheck;
}

export interface HardFilterCheck {
  pass: boolean;
  reason?: string;
  warning?: boolean;
  estimatedLadenDraftM?: number;  // M4 field
  portLimitM?: number;            // M4 field
}
```

**Field paths for DD panel:**

| Check | Path |
|-------|------|
| Load port draft | `worksheet.hardFilters.draft.pass` / `.reason` / `.estimatedLadenDraftM` / `.portLimitM` |
| Discharge port draft | `worksheet.hardFilters.destDraft.pass` / `.reason` |
| Load port cranes | `worksheet.hardFilters.crane.pass` / `.warning` / `.reason` |
| Discharge port cranes | `worksheet.hardFilters.destCrane.pass` / `.reason` |
| Volume / holds | `worksheet.hardFilters.volume.pass` / `.reason` |

### (f) Data quality flags — `DataTier`

**Type:** `lib/data-quality/types.ts:1–8`

```ts
export type DataTier = 'live' | 'estimated' | 'stale';
export interface DataQuality { tier: DataTier; source?: string; asOf?: string; note?: string; }
```

**Where set:** `lib/matching/tce-calculator.ts:426` — `sessionMatch.economics.dataQuality.consumption` gets `{ tier: 'estimated', source: 'class-estimate' }` when consumption was estimated.

**Also:** `storedMatch.consumption_estimated === 1` (DB column) signals estimated consumption.  
**Baltic staleness:** `storedMatch.freight_rate_source === 'baltic'` → `getBalticDayRate(db, dwt)?.date` → `deriveTier({ source:'static-seed', asOf, staleAfterDays:14 })`.

For the DD panel Economics category data-quality indicator:
- `storedMatch.consumption_estimated === 1` → show `estimated` badge on consumption
- `storedMatch.freight_rate_source` → show source tier on freight rate

---

## Q3 — EVIDENCE STRINGS

**Answer: YES — the panel can reuse per-factor `.rationale` strings directly.**

Every `FitBreakdownComponent` in `storedMatch.fit_breakdown` already carries a broker-facing `rationale` string generated in `lib/sailing/fit-breakdown.ts`. These are the same strings visible in the right-rail MatchDetailPanel. They are the canonical evidence strings.

### Per-factor examples (from fit-breakdown.ts scorers):

| Factor | File:Line | Example rationale |
|--------|-----------|-------------------|
| Cranes | `fit-breakdown.ts:372` | `"Ship is geared — no dependence on shore cranes."` |
| Cranes (gearless) | `fit-breakdown.ts:399` | `"Ship is gearless; crane availability at load/discharge not yet confirmed."` |
| Volume | `fit-breakdown.ts:433` | `"Cargo takes ~82% of the ship's grain capacity — ideal fill."` |
| Draft | `fit-breakdown.ts:460` | `"Estimated laden draft ~9.2m (approximate, conservative) within port limit 10.5m."` |
| Vetting | `fit-breakdown.ts:481–485` | `"Items to confirm before fixing: Vessel age, P&I insurance."` or `"Vetting clean — no open items."` |
| Economics | `fit-breakdown.ts:530` | `"TCE $8,200/day — $1,400/day above class breakeven."` |
| Utilisation | `fit-breakdown.ts:146–150` | `bracketData: "12,500 / 14,800 mt"` |

### Key detail: Vetting sub-factors

The FitBreakdown `vetting` component only carries a **rolled-up** rationale (`"Items to confirm: Flag (Paris MoU), Vessel age."`). Individual per-sub-factor verdicts (ok/caution/warn) require re-calling `computeVesselVetting(vessel, {refYear})` — `lib/sailing/vessel-vetting.ts:136`.

→ Recommendation: for the DD panel "Vessel vetting" category, use the rolled-up `fb.vetting.rationale` as the category-level evidence string. For a per-row breakdown (flag / class / age / P&I / CII / PSC), re-derive client-side with `vessel` in scope. VettingBreakdown.tsx (`components/match/VettingBreakdown.tsx:14`) shows the current pattern (rolled-up only).

### Hold cleanliness

Re-run `checkCompatibility` client-side (same as VesselsTab.tsx:72–75). No stored structured field.

---

## Q4 — DEMO PARITY

### Single source invariant

The page reads all display values from **`storedMatch` (DB row)**, written once at persist time. The panel MUST read the identical DB fields — no re-derivation.

| Displayed value | Single source field | Page line |
|----------------|---------------------|-----------|
| Fit % hero pill | `storedMatch.fit_percent` | page.tsx:207 |
| Fit % in Vessel card | `storedMatch.fit_percent` | page.tsx:284 |
| FitBreakdown components | `storedMatch.fit_breakdown` (JSON) | page.tsx:344 |
| TCE $/day | `storedMatch.tce_usd_per_day` | page.tsx:336 |
| Distance nm | `storedMatch.distance_nm` | page.tsx:335 |
| Freight rate | `storedMatch.freight_rate_usd_per_mt` | page.tsx:333 |

### Demo mode / session parity (#856)

`app/match/[id]/page.tsx:62–68`: demo mode rehydration via `persistSessionMatches` re-persists session matches under the new session ID, then resolves via stable cargo/vessel slug. The `storedMatch` is always a **session-scoped copy** owned by the current `sessionId` — NOT the NULL-session master. `storedMatch.user_id === sessionId` is enforced.

**Issue #856 root cause** (from `gh issue view 856`): Three mismatches between list TCE (stored at regen) and detail TCE (recalculated on card open): distance shadowing, war-risk flag, and live bunker vs stored bunker. Fixes in MatchTabs.tsx + voyage-calculator.ts + tce-calculator.ts thread `storedTceUsdPerDay` / `storedDistanceNm` / `storedFreightRate` to EconomicsTab so the live recalculation can show the same starting point.

**For the DD panel:** the panel reads `storedMatch.fit_breakdown` (same JSON as MatchDetailPanel's right-rail) and `storedMatch.tce_usd_per_day` (same value as EconomicsTab's `storedTceUsdPerDay` prop). **No recomputation** → automatically list==detail==panel parity.

### What the panel must NOT do

- Do NOT call `computeFitBreakdown(...)` — reads stale live session data that may differ from stored
- Do NOT read from `sessionMatch.fitBreakdown` or `sessionMatch.fitPercent` — these can diverge on session reload
- Do NOT use `sessionMatch.economics.tceUsdPerDay` — always read `storedMatch.tce_usd_per_day`

---

## Per-Category Field-Path Table

| DD Category | Check row | Source | Field path |
|-------------|-----------|--------|-----------|
| **Vessel ↔ Port physics** | Draft load port | worksheet | `worksheet.hardFilters.draft.{pass, estimatedLadenDraftM, portLimitM, reason}` |
| | Draft discharge port | worksheet | `worksheet.hardFilters.destDraft.{pass, reason}` |
| | Draft fit score | fitBreakdown | `fb.components[factor==='draft'].{score, weight, rationale}` |
| **Cargo ↔ Holds** | Volume / hold fit | fitBreakdown | `fb.components[factor==='volume'].{score, weight, rationale, bracketData}` |
| | Cargo type fit | fitBreakdown | `fb.components[factor==='cargoType'].{score, weight, rationale}` |
| | Cranes | fitBreakdown + worksheet | `fb.components[factor==='cranes'].rationale`, `worksheet.hardFilters.crane.{pass, warning, reason}` |
| | Hold cleanliness | live re-derive | `checkCompatibility(parseLastCargoes(vessel.lastCargoes), cargoDescription)` |
| **Voyage economics** | TCE vs breakeven | storedMatch | `storedMatch.tce_usd_per_day`, `storedMatch.breakeven_tce_usd_per_day` |
| | Economics fit score | fitBreakdown | `fb.components[factor==='economics'].{score, weight, rationale, bracketData}` |
| | Utilisation % | fitBreakdown | `fb.components[factor==='utilisation'].{score, weight, rationale, bracketData}` |
| | Ballast distance | fitBreakdown | `fb.components[factor==='ballast'].{score, weight, rationale}` |
| | Freight rate source | storedMatch | `storedMatch.freight_rate_source` ('manual'/'parsed'/'baltic'/'estimated') |
| | Data quality | storedMatch | `storedMatch.consumption_estimated === 1` |
| **Vessel vetting** | Vetting score | fitBreakdown | `fb.components[factor==='vetting'].{score, weight, rationale}` |
| | Per-factor detail (flag/class/age/P&I/CII/PSC) | live re-derive | `computeVesselVetting(vessel, {refYear: new Date().getUTCFullYear()}).factors` |
| | Timing readiness | fitBreakdown + worksheet | `fb.components[factor==='timing'].rationale`, `worksheet.readiness.verdict` |
| | Class fit | fitBreakdown | `fb.components[factor==='classFit'].{score, weight, rationale}` |
| **Compliance / risk** | Sanctions risk | worksheet | `worksheet.sanctions.{risk, reason, blocking}` — `MatchSanctions` from `lib/types.ts:444` |
| | Sanctions penalty | fitBreakdown | `fb.sanctionsPenalty` |
| | Charterer penalty | fitBreakdown | `fb.chartererPenalty` |

### Hero counter: "ran N checks"

Count: `worksheet.hardFilters` enumerable keys (up to 14 per `MatchHardFilters` definition) + `fb.components.length` (10 factors) + hold cleanliness (1) + sanctions (1 if present).

---

## Recommended Component Architecture

```
app/match/[id]/page.tsx          ← Server Component, passes storedMatch + worksheet + vessel + cargo
  └─ <DueDiligencePanel>         ← new Client Component
       fitBreakdown: string|null  ← storedMatch.fit_breakdown
       fitPercent: number|null    ← storedMatch.fit_percent
       worksheet: MatchWorksheet|null
       sanctions: MatchSanctions|null  ← worksheet?.sanctions
       tceUsdPerDay: number|null  ← storedMatch.tce_usd_per_day
       breakevenTce: number|null  ← storedMatch.breakeven_tce_usd_per_day
       vessel: ParsedVessel|null  ← for vetting re-derive + hold cleanliness
       cargoDescription: string|null ← for hold cleanliness re-derive
```

**New file:** `components/match/DueDiligencePanel.tsx`  
**Insertion point:** `app/match/[id]/page.tsx` after `</SourceAttributionSection>` closing tag (currently line 362, inside `{cargo && cargoEmail && (...)}` block — mount it immediately after, inside the `{sessionMatch && (...)}` scope).

**Note:** `SourceAttributionSection` is inside `{cargo && cargoEmail && (...)}` (lines 347–363). The DD panel should be sibling to this, inside the outer `{sessionMatch && (...)}` block (lines 316–364) but NOT gated on `cargoEmail` — it works even without the email as long as `worksheet` and `fitBreakdown` are present.

Recommended insertion is lines 363–364:

```tsx
// After: </SourceAttributionSection>
// Still inside: {sessionMatch && ( ... )}

<DueDiligencePanel
  fitBreakdown={storedMatch.fit_breakdown ?? null}
  fitPercent={storedMatch.fit_percent ?? null}
  worksheet={worksheet}
  sanctions={worksheet?.sanctions ?? null}
  tceUsdPerDay={storedMatch.tce_usd_per_day ?? null}
  breakevenTce={storedMatch.breakeven_tce_usd_per_day ?? null}
  vessel={vesselWithCii ?? null}
  cargoDescription={cargo?.cargoDescription?.value ?? null}
/>
```

---

## Issue #856 Acceptance Table

| Issue | Criterion | Status | Evidence |
|-------|-----------|--------|----------|
| #856 | list==detail parity: distance bug | n/a (closed via #1006) | `storedMatch.distance_nm` is single source both in list + detail |
| #856 | DD panel reads storedMatch, not recomputed | ✓ (plan confirmed) | Panel will read `storedMatch.fit_breakdown` + `storedMatch.tce_usd_per_day` — same fields as EconomicsTab `storedTceUsdPerDay` prop (page.tsx:336) |

#856 is a closed/merged fix. The DD panel inherits parity by construction (reads same stored columns).

---

## Pre-PASS Verification

**N/A — read-only recon, no files changed.**  
TypeCheck not applicable. No tests needed. No literal strings changed.

Verified: `git status --porcelain` → empty (clean tree).
