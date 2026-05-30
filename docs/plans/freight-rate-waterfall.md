# Plan: Freight-rate waterfall (`resolveFreightRate`) — Wave #7 / L2 #7

Branch: `fix/freight-rate-waterfall` (off L2-economics-wiring). Source design: `~/.handover/freight-brief.md` (founder-agreed, do not redo).

## Goal

One function `resolveFreightRate(input) → { value, source, confidence }` — a 4-tier priority
waterfall feeding the freight rate into TCE display. **TCE formula, match count, and ranking
must not change** — the rate only affects what TCE is _shown_, not which pairs match.

Tiers (highest priority first):
| # | source | trigger | confidence | badge |
|---|--------|---------|-----------|-------|
| 0 | `manual` | broker override present (sticky) | 1.0 | ✎ вручную |
| 1 | `parsed` | `cargo.freightRateUsd` present ($/mt from email) | 0.9 | ✓ из письма |
| 2 | `baltic` | per-class $/day index available + distance + tonnes | 0.5 | ~ рынок (Baltic <date>) |
| 3 | `estimated`| always (fallback) — existing `estimateFreightRate` | 0.3–0.6 | ≈ оценка (dimmed, "ставка не подтверждена") |

## Reality-check findings (from code probe 2026-05-30)

1. **tier-3 exists, keep verbatim**: `estimateFreightRate(cargoType, distanceNm, dwt)` →
   `{rate, source:'estimated', confidence}` at `lib/matching/tce-calculator.ts:79`. NOT a wrapper —
   `resolveFreightRate` selects among tiers and calls this one for tier 3.
2. **TCE untouched**: `computeEstimatedTce(freightEst, …)` already passes `freightEst.source` through to
   `TceEstimate.freight_rate_source`. Feeding it `source:'parsed'|'baltic'|'manual'` needs only a TYPE
   widening of `FreightRateEstimate.source` — no formula change.
3. **tier-1 parser already done**: `freight_rate_usd` (per-MT) fully extracted —
   `lib/prompts/parse-cargo.ts:387-395` + `lib/schemas/parse-cargo.ts:61` + `lib/parsing/parse-cargo-ai.ts:116`
   → `ParsedCargo.freightRateUsd` (`lib/types.ts:192`). **Do NOT touch the prompt** (regression risk).
   Work = consume `cargo.freightRateUsd` + add a fixture proving extraction.
4. **manual already sticky**: persistence is `INSERT OR IGNORE` (createMatch) + idempotency guard
   (compute-matches skips if matches exist). No code path UPDATEs an existing row's rate except the
   explicit PATCH. So "sticky" = (a) don't add an overwrite path, (b) add a UI reset path.
5. **Baltic unit mismatch** (DOCUMENTED ASSUMPTION): brief formula needs per-class **$/day**; seeds are
   index **points** (BHSI=650, BSI=1100, BCI=1600, BDI=1450; only TOEPFER_TMI=12683 is real $/day).
   BHSI is typed `unit:'index'` for KPI display — must not repurpose. → add a _separate_ static, dated
   per-class TC-average $/day seed; existing points rows untouched.
6. **call-sites** of the rate today: `compute-matches.ts:80`, `persist-session-matches.ts:43`,
   `pair-analyzer.ts:642` (buildMatchEconomics), `app/api/matches/[id]/route.ts:100` (manual PATCH).
7. **UI chain**: `app/match/[id]/page.tsx:240-241` → `components/match/MatchTabs.tsx` →
   `components/match/EconomicsTab.tsx` (override box + `est` badge only, lines 184-228, 191-193).
   `app/matches/MatchesClient.tsx:594` also shows `estimated` badge.

## Decisions / assumptions (founder absent → documented, proceeding)

- **A1 Baltic $/day seed**: new migration `039-baltic-tc-dayrates-seed` (021–038 already exist; next free
  version is 39) inserts per-class TC-average $/day rows into `baltic_indices` with distinct codes
  `BHSI_TC`, `BSI_TC`, `BPI_TC`, `source='static-seed'`, `price_date='2026-05-09'` (same date as existing
  seed), realistic magnitudes anchored to TOEPFER_TMI≈12,683: handysize `BHSI_TC≈11500`,
  supramax `BSI_TC≈13500`, panamax `BPI_TC≈15000`. Live feed = L4, out of scope.
  Register in `lib/migrations/index.ts` (`import migration039` + append to `allMigrations`).
  `getBalticDayRate` wraps the lookup in try/catch → missing `baltic_indices` table returns null
  (protects existing tests whose in-memory DB never ran migration 019/039).
- **A2 class mapping** (by DWT, brief's intent): `dwt<45000→BHSI_TC` (handysize/handymax),
  `45000≤dwt<70000→BSI_TC` (supramax/ultramax), `dwt≥70000→BPI_TC` (panamax+). Panamax→BPI_TC
  (we seed it; brief's "BPI if present else BSI" fallback kept if row missing).
- **A3 tier-2 fires only when** baltic day-rate row found AND `distanceNm>0` AND `quantityMt>0` AND
  `estimateVoyageDays>0`; else fall through to tier 3. Guards against the $0.x/mt nonsense.
- **A4 reset-to-auto**: PATCH accepts `{ reset_freight_rate: true }` → recompute the AUTO rate from the
  stored match row (cargo_type, distance_nm, vessel_dwt) via `resolveFreightRate` with no manual/parsed and
  no quantity → resolves to **estimate** (tier 3), restoring the original persisted value; sets
  `freight_rate_source` back to the resolved source. (parsed/baltic need the original email/quantity which
  the match row doesn't store — re-applied on the next full recompute; documented in the route + UI copy.)
- **A5 lumpsum**: out of scope — parser extracts per-MT only today; lumpsum normalization would need a
  prompt change (regression risk) + reliable quantity. Deferred; noted in PR.
- **A6 confidence ladder**: manual 1.0 / parsed 0.9 / baltic 0.5 / estimate unchanged 0.3–0.6.

## Architecture

`resolveFreightRate` stays **pure** (no DB) for testability; the caller resolves the baltic day-rate.

```
// lib/matching/freight-resolver.ts (NEW)
export type FreightRateSource = 'manual' | 'parsed' | 'baltic' | 'estimated';
export interface ResolveFreightInput {
  cargoType: string | null;
  parsedFreightRateUsdPerMt?: number | null;   // tier 1 — cargo.freightRateUsd
  vesselDwt: number;
  quantityMt: number;
  distanceNm: number;
  speedKts?: number;
  manualRateUsdPerMt?: number | null;           // tier 0
  balticDayRate?: { usdPerDay: number; date: string; indexCode: string } | null; // tier 2 (caller-resolved)
}
export interface ResolvedFreightRate {
  value: number; source: FreightRateSource; confidence: number; balticDate?: string;
}
export function resolveFreightRate(i: ResolveFreightInput): ResolvedFreightRate
```

```
// lib/market/baltic-freight.ts (NEW) — DB-bound tier-2 helpers
export function balticIndexCodeForDwt(dwt: number): 'BHSI_TC'|'BSI_TC'|'BPI_TC'
export function getBalticDayRate(db, dwt): { usdPerDay; date; indexCode } | null  // getLatestBalticIndex + fallback BPI_TC→BSI_TC
```

Tier-2 math inside `resolveFreightRate`:
`value = round2( balticDayRate.usdPerDay * estimateVoyageDays(distanceNm, speedKts) / quantityMt )`
(import `estimateVoyageDays` from `lib/economics/voyage-days.ts`). Guard A3.

Type widening (additive): `FreightRateEstimate.source` and `TceEstimate.freight_rate_source` in
`tce-calculator.ts` → include `'parsed'|'baltic'`. `updateMatchFreightRate` source param → `FreightRateSource`.

## Steps (TDD — test first each step; `lib/types.ts` additive only)

### S1 — freight-resolver core (pure)

- TEST `lib/matching/__tests__/freight-resolver.test.ts`: priority (manual beats all; parsed beats
  baltic/estimate; baltic beats estimate; estimate fallback); confidence per tier; tier-2 math on
  2–3 routes gives sane $/mt (e.g. BSI_TC 13500 × 12d / 45000t ≈ $3.6/mt — sane); tier-2 guards
  (no baltic / qty 0 / dist 0 → estimate); manual 0/negative ignored → next tier.
- IMPL `lib/matching/freight-resolver.ts`.

### S2 — baltic day-rate seed + helper

- TEST `__tests__/lib/market/baltic-freight.test.ts`: `balticIndexCodeForDwt` boundaries (44999→BHSI_TC,
  45000→BSI_TC, 70000→BPI_TC); `getBalticDayRate` returns seeded row; BPI_TC missing → BSI_TC fallback.
- IMPL migration `lib/migrations/021-baltic-tc-dayrates-seed.ts` (+ register in migration index) +
  `lib/market/baltic-freight.ts`. Verify migration list wiring (find the registry).

### S3 — widen TCE source types (additive, no formula change)

- TEST: extend `tce-calculator.test.ts` — `computeEstimatedTce` passes through `source:'baltic'|'parsed'`.
- IMPL: widen `FreightRateEstimate.source`, `TceEstimate.freight_rate_source` unions.

### S4 — wire matching pipeline to resolveFreightRate

- TEST `compute-matches` + `persist-session-matches` + `pair-analyzer`/buildMatchEconomics: when
  `cargo.freightRateUsd` set → source `parsed`; when baltic available + no parsed → `baltic`; else `estimated`.
  **Assert match COUNT + ranking unchanged** (snapshot existing match-count tests stay green).
- IMPL: replace `estimateFreightRate→computeEstimatedTce` blocks in `compute-matches.ts:79-85`,
  `persist-session-matches.ts:42-48`, and `buildMatchEconomics` (`tce-calculator.ts:162`) with
  `resolveFreightRate(...)` → feed `{rate:value, source}` into `computeEstimatedTce`. `buildMatchEconomics`
  gains optional `parsedFreightRateUsdPerMt` + `balticDayRate` inputs; pair-analyzer passes
  `cargo.freightRateUsd` + `getBalticDayRate(db, dwt)`. (pair-analyzer has no db today → thread db in OR
  resolve baltic in compute-matches and pass through; pick least-invasive in impl.)

### S5 — reset path in PATCH route

- TEST `app/api/matches/[id]/__tests__/route.test.ts`: `{reset_freight_rate:true}` → recomputes auto
  (source `estimated`), clears manual; manual override still works; bad input 400; 404 other-session.
- IMPL: add reset branch in `app/api/matches/[id]/route.ts` PATCH using `resolveFreightRate` from stored row.

### S6 — UI: 4-source badges + sticky + reset button

- TEST `__tests__/components/match/EconomicsTab-freight-badge.test.tsx`: renders correct badge per
  source (manual/parsed/baltic/estimated); estimate dimmed + "ставка не подтверждена"; baltic shows date;
  reset button visible only when source==='manual'; clicking reset PATCHes `{reset_freight_rate:true}`.
- IMPL: `EconomicsTab.tsx` badge map + reset button; `MatchesClient.tsx:594` badge map (all 4).
  TCE always shown (already is) with source badge. Mark PR `needs visual-preview`.

### S7 — tier-1 parser fixture (NO prompt change)

- TEST: add a parse-cargo fixture/case asserting `freight_rate_usd` ("$18/mt", "usd 22 pmt") →
  `freightRateUsd` populated. (parser logic already supports it — fixture guards the contract.)

## Verification (verification-before-completion)

- `NODE_OPTIONS='--max-old-space-size=8192' npm test` (ONE run; known-foreign flake
  `progonq/score-classify` is NOT our regression). Capture pass/fail counts.
- `npx tsc --noEmit` clean. eslint clean (fresh-worktree: commit with `--no-verify` after manual
  eslint+tsc per project memory).
- Manual sanity in a test: baltic $/mt on 2–3 routes is plausible ($1–$15/mt range).
- Confirm match count/ranking tests unchanged (no edits to their expectations — PI3).

## Process gates (founder-mandated)

TDD (this plan) → **/test-skill** (risk-override: parser touched, adversarial QA) →
requesting-code-review → verification-before-completion → finishing-a-development-branch
(draft PR to main, do NOT merge, mark `needs visual-preview`).

## Out of scope (hard)

Live Baltic feed; TCE/scoring formula; match count/ranking; bucket partitioning; lumpsum parsing;
prompt rewrite. `lib/types.ts` additive only.
