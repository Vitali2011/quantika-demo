# Implementation Plan — Match «Due Diligence» Panel (2026-06-16)

> Spec: `docs/superpowers/specs/2026-06-16-match-due-diligence-panel-design.md`
> Recon: `docs/research/dd-panel-recon-2026-06-16.md`
> Tier M · model: Opus 4.8 :high · branch: `dd-panel`

## Goal

New presentational «Due Diligence» panel on the match detail page, mounted
**under** `<SourceAttributionSection>`, full-width. Re-presents EXISTING computed
match data as 5 grouped categories with check rows (pass / caution / info /
inactive) + a hero counter «ran N checks». **Zero engine change** — no scoring,
regen, pair-analyzer, or seed writes. Reads `storedMatch.*` only → list==detail
parity by construction (#856).

## Architecture decision (important — avoids client-bundle landmine)

MVP panel is **static** (no accordion/interaction). Therefore:
- **Server-side pure builder** `lib/matching/due-diligence.ts` does ALL derivation.
- **Server component** `components/match/DueDiligencePanel.tsx` renders the model.
- **NO `'use client'`** anywhere in this feature. This dodges the documented
  port-master / heavy-import client-bundle landmine (memory: importing
  vetting/l5c/port utils into a client component bloats the bundle ~786KB).
- If any future interactivity is needed, split a thin client leaf — NOT in MVP.

Pure builder = trivially unit-testable (the test-skill / cold-QA target).

## Files

### 1. NEW `lib/matching/due-diligence.ts` (pure builder, server-only)

```ts
export type DDState = 'pass' | 'caution' | 'info' | 'inactive';
export interface DDCheck { label: string; state: DDState; evidence: string | null; }
export interface DDCategory { key: string; label: string; icon: string; checks: DDCheck[]; }
export interface DDModel {
  categories: DDCategory[];
  counter: { ran: number; pass: number; caution: number; flagsCritical: number };
  fitPercent: number | null;
}

export interface BuildDDArgs {
  fitBreakdown: import('@/lib/types').FitBreakdown | null; // parsed from storedMatch.fit_breakdown
  fitPercent: number | null;                               // storedMatch.fit_percent
  worksheet: import('@/lib/types').MatchWorksheet | null;  // storedMatch.worksheet_json
  sanctions: import('@/lib/types').MatchSanctions | null;  // worksheet.sanctions
  tceUsdPerDay: number | null;                             // storedMatch.tce_usd_per_day
  breakevenTce: number | null;                             // storedMatch.breakeven_tce_usd_per_day
  freightRateSource: string | null;                        // storedMatch.freight_rate_source
  consumptionEstimated: boolean;                           // storedMatch.consumption_estimated === 1
  vessel: import('@/lib/types').ParsedVessel | null;       // for vetting re-derive + hold cleanliness
  cargoDescription: string | null;                         // for hold cleanliness re-derive
}

export function buildDueDiligence(args: BuildDDArgs): DDModel { /* ... */ }
```

Builder maps the recon per-category field-path table into the 5 categories:

**Category 1 — Судно ↔ порт** (icon `ship`)
- DWT/utilisation → `fb.components[factor==='utilisation']` → pass if score≥~70% weight, else caution; evidence = `.rationale` (+ bracketData).
- Draft load port → `worksheet.hardFilters.draft` → pass/`.warning`→caution; evidence built from `.estimatedLadenDraftM`/`.portLimitM`/`.reason` (reuse fb draft `.rationale` if richer).
- Draft discharge port → `worksheet.hardFilters.destDraft`.
- Cranes → `worksheet.hardFilters.crane` (+ `destCrane`); evidence = fb cranes `.rationale`.
- **LOA под причал → INACTIVE** «не подключено» (audit gap — data exists, not wired).
- **Воздушный габарит → INACTIVE** «нет данных» (audit gap).

**Category 2 — Груз ↔ трюмы** (icon `package`)
- Volume/holds → `fb.components[factor==='volume']`.
- Cargo type ↔ vessel type → `fb.components[factor==='cargoType']`.
- Hold cleanliness / last cargoes → re-derive server-side:
  `checkCompatibility(parseLastCargoes(vessel.lastCargoes), cargoDescription)`
  (`lib/cargo/l5c-matrix.ts`). `compatible && !requires_extra_clean` → pass;
  `requires_extra_clean` → caution; `!compatible` → caution/flag with blocking_pairs.
  **`vessel.lastCargoes==null` OR `cargoDescription==null` → INACTIVE «нет данных в письме»** (NEVER fake pass).
- IMSBC group → from worksheet.hardFilters.imsbc if present → info/caution; else INACTIVE.

**Category 3 — Экономика рейса** (icon `coin`)
- TCE vs breakeven → `tceUsdPerDay` vs `breakevenTce` → pass if above; evidence «TCE $X/day — $Y above/below breakeven». If breakeven null → use fb economics rationale.
- Economics fit → `fb.components[factor==='economics']`.
- Utilisation → already in cat 1? Put utilisation in economics OR vessel-port — pick ONE (recon lists it under economics). Put under economics to avoid dup.
- Ballast → `fb.components[factor==='ballast']`.
- Freight vs Baltic → `freightRateSource`: 'baltic'/'estimated' → caution «оценка»; 'manual'/'parsed' → info. `consumptionEstimated` → caution badge «расход оценён».

**Category 4 — Ветинг судна** (icon `shield-check`)
- Per-sub-factor rows via `computeVesselVetting(vessel, { refYear: <current UTC year>, detentionCount })` (`lib/sailing/vessel-vetting.ts`) when `vessel` present → map each `VettingFactor` verdict (ok→pass, caution→caution, warn→caution/flag, unknown→inactive); evidence = factor `.rationale`.
  - `cii` factor with `unknown`/no data → INACTIVE «нет данных по судну».
- **RightShip score → INACTIVE** «не подключено» (not built).
- Class fit → `fb.components[factor==='classFit']`.
- Timing/readiness → `fb.components[factor==='timing']` + `worksheet.readiness.verdict`.
- If `vessel==null` → vetting category uses rolled-up `fb.vetting.rationale` as a single row; sub-factors inactive.

**Category 5 — Комплаенс / риск** (icon `scale`)
- War-risk → `worksheet.sanctions` war-risk portion / fb sanctionsPenalty → pass if no zones, caution if AWRP/zones; evidence from sanctions reason.
- Sanctions судна (OFAC/EU) → `worksheet.sanctions.{risk,reason,blocking}` → pass if clean, flag if blocking.
- **KYC чартерера → INACTIVE** «не подключено» (audit gap).

**Counter:** `ran` = count of checks with state ∈ {pass,caution,info} (exclude inactive).
`pass` = pass count. `caution` = caution count. `flagsCritical` = checks where a hard
block / blocking sanctions would have removed it from board (rare on detail page; usually 0).
Hero text: «Прогнали {ran} проверок · {pass} ✓ · {caution} ⚠ · критичных стопов {flagsCritical===0?'нет':flagsCritical}».

**Honesty invariant (test this):** any null/absent source → `inactive`, never `pass`.

**Parity invariant (test this):** builder reads ONLY the passed stored-derived args;
it must NOT import or call `computeFitBreakdown`, and must NOT read
`sessionMatch.fitPercent`/`.economics.tceUsdPerDay`. (computeVesselVetting &
checkCompatibility are pure presentation re-derivations on the SAME stored vessel/cargo
snapshot the page already uses — allowed; they do not touch scoring/regen.)

### 2. NEW `components/match/DueDiligencePanel.tsx` (server component, NO 'use client')

Props: `{ model: DDModel }` (page builds the model and passes it) — keeps the
component a dumb renderer.
- Card wrapper matching existing panels (`MatchWorksheet`/cards styling, Tailwind +
  shadcn tokens already in repo). Full-width.
- Hero row: counter text + fit% pill (reuse existing fit-pill style).
- 5 category groups: uppercase label + icon, rows with state icon (check/alert-triangle/
  info-circle/minus), label, muted evidence line. Inactive rows: muted + italic «не подключено / нет данных».
- Follow existing design system; do NOT invent new colors. Reuse status colors used
  elsewhere (success/warning/info/muted).

### 3. EDIT `app/match/[id]/page.tsx`

- Import `buildDueDiligence` + `DueDiligencePanel`.
- After `</SourceAttributionSection>` (≈line 363), inside `{sessionMatch && (...)}`,
  NOT gated on `cargoEmail`:
```tsx
{(() => {
  const fb = storedMatch.fit_breakdown ? JSON.parse(storedMatch.fit_breakdown) as FitBreakdown : null;
  const ddModel = buildDueDiligence({
    fitBreakdown: fb,
    fitPercent: storedMatch.fit_percent ?? null,
    worksheet,
    sanctions: worksheet?.sanctions ?? null,
    tceUsdPerDay: storedMatch.tce_usd_per_day ?? null,
    breakevenTce: storedMatch.breakeven_tce_usd_per_day ?? null,
    freightRateSource: storedMatch.freight_rate_source ?? null,
    consumptionEstimated: storedMatch.consumption_estimated === 1,
    vessel: vesselWithCii ?? vessel ?? null,
    cargoDescription: cargo?.cargoDescription?.value ?? null,
  });
  return <DueDiligencePanel model={ddModel} />;
})()}
```
(Adjust to match actual variable names in scope — recon confirms `storedMatch`,
`worksheet`, `vessel`/`vesselWithCii`, `cargo` are all in scope at that point.)
- Guard JSON.parse in try/catch → null on malformed (panel handles null fb gracefully:
  categories that depend on fb show inactive, not crash).

### 4. NEW `lib/matching/__tests__/due-diligence.test.ts`

Pure builder unit tests:
1. Happy path: full fitBreakdown + worksheet + vessel → expected categories, states, counter.
2. **Honesty:** `vessel.lastCargoes=null` → hold-cleanliness row `inactive`, NOT pass; counter excludes it.
3. **Honesty:** missing fitBreakdown (null) → fb-dependent rows inactive; no crash.
4. **Honesty:** LOA/air-draft/RightShip/KYC rows always `inactive` (gap rows present, not fake).
5. **Counter:** excludes inactive; pass/caution counts correct.
6. **Parity:** builder output fitPercent === passed fitPercent (no recompute); given a
   fitBreakdown whose components differ from a hypothetical live recompute, builder still
   uses the passed (stored) values.
7. Vetting: vessel with known flag/class/age → per-sub-factor rows mapped; cii unknown → inactive.
8. Sanctions blocking → compliance flag row.

## Verification (executor must run, emit markers)

- `npx tsc --noEmit` (set `NODE_OPTIONS=--max-old-space-size=4096` — VPS OOM precedent).
- `npx jest lib/matching/__tests__/due-diligence.test.ts` + `--findRelatedTests app/match/[id]/page.tsx components/match/DueDiligencePanel.tsx`.
- `npm run build` (route metrics) — confirm `/match/[id]` builds; **watch bundle size of
  `/match/[id]` does NOT balloon** (server-only derivation = should be flat).
- Preview: load a match detail page, confirm panel renders under Source Attribution with
  real counter + categories; load a match with null lastCargoes → hold-cleanliness shows
  inactive, not a green check.
- Emit `<<PR_URL=...>>`, `<<TESTSKILL=...>>` (after cold QA), `<<TEST_STEP=...>>`.

## Non-goals (YAGNI)

No engine/scoring/regen/seed change. No client interactivity/accordion. No email embed.
No replacement of the existing right-rail factor panel. No new data sourcing (gap rows
stay inactive — LOA/CII/RightShip/KYC are separate ROI-queue tasks).

## Acceptance criteria (from spec)

- Panel visible under SOURCE ATTRIBUTION on match detail (prod-demo).
- Hero counter correct (active only); fit% identical to hero pill (same stored field).
- 5 categories; each active row carries living evidence; inactive rows muted, NO fake checks.
- Zero diff to scoring/regen/pair-analyzer; list==detail==panel parity holds.
- Builder unit tests green; tsc clean; build flat bundle.
