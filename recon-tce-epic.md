BRANCH_AT_START=claude/tce-epic-recon

SCOPE MATCH: RECON-only mapping of all TCE calculation paths, divergence root causes, and canonical-calculator seam for epic #1004.

---

# TCE Epic #1004 — Recon: Unsynchronized Calculation Paths

**Date**: 2026-06-15  
**Branch**: `claude/tce-epic-recon`  
**Status**: RECON ONLY — no code edits, no PR targets any fix yet

---

## 1. Per-Callsite Map

Every surface that produces a TCE number, with its rate source, bunker source, and key cost assumptions.

| Path | Entry point (file:line) | Rate source | Bunker source | Duration formula | War-risk | Notes |
|------|------------------------|-------------|---------------|-----------------|----------|-------|
| **Fit-scoring (stored)** | `lib/matching/stored-match-economics.ts:73` → `lib/matching/tce-calculator.ts:buildMatchEconomics` → `lib/economics/compute-tce.ts:computeTce` | `resolveFreightRate()` waterfall: manual→parsed→Baltic→estimate (tier 0-3) | `bunkerPriceUsdPerMt` param or `DEFAULT_BUNKER_USD_PER_MT=600` (`lib/constants.ts:116`) | `ballastDays + ladenDays + 2` when `ballastDistanceNm` known; else `estimateRoundTripDays(2×laden+2)` | `excludeWarRiskFromDailyTce: true` | Written to `tce_usd_per_day` DB column. `openPosition` from actual `ParsedVessel`. |
| **Voyage P&L (live)** | `components/match/EconomicsTab.tsx:370` auto-fires → `POST /api/voyage/tce` → `lib/economics/voyage-calculator.ts:calculateTCE` → `computeTce` | `currentRate ?? storedFreightRate` (from stored match) | Live spot from DB: `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` (default port hardcoded `EconomicsTab.tsx:91`) | `buildCanonicalTceInputs`: `ballastDays+ladenDays+2` if `ballastDistanceNm` prop set; else round-trip | `excludeWarRiskFromDailyTce: true` | `durationDays` passed as `overrideDurationDays`. Ballast prop from `storedMatch.ballast_distance_nm`. |
| **Recalculate PATCH** | `components/match/EconomicsTab.tsx:handleOverrideSubmit` → `PATCH /api/matches/[id]` (`route.ts:207`) → `buildCargoProxy/buildVesselProxy` → `computeStoredMatchEconomics` → `computeTce` | User-entered rate (PATCH body `freight_rate_usd_per_mt`) | Live spot from DB: `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` (`route.ts:196`) | **BROKEN**: `buildVesselProxy` nulls `openPosition` → `ballastDistanceNm=null` → `estimateRoundTripDays(2×laden+2)` | `excludeWarRiskFromDailyTce: true` | Also loses `speedLaden`, `consumption`, `quantity` — all revert to class defaults. |
| **Bucket card fallback** | `lib/matching/session-buckets.ts:69` → `computeEstimatedTce` (legacy thin wrapper) | `estimateFreightRate(cargoType, nm, dwt)` (tier-3 only) | `DEFAULT_BUNKER_USD_PER_MT=600` | Round-trip only (no ballast) | Not applied | Only used for bucket matches where `m.economics` is null (distance unresolvable at analyze time). |

### computeTce duration logic (canonical)

`lib/economics/compute-tce.ts:113-123`:

```
if overrideDurationDays set     → use it directly            (Voyage P&L path)
elif ballastDistanceNm > 0      → ballastDays + ladenDays + 2  (stored-path when openPosition known)
else                            → estimateRoundTripDays(2×laden+2)  (PATCH path — always hits this)
```

---

## 2. Root Statement

**All three TCE paths already call the same leaf function (`computeTce`). The divergence is entirely in the INPUTS passed to it — not in the formula.**

The single root cause: `buildVesselProxy()` and `buildCargoProxy()` in `app/api/matches/[id]/route.ts` reconstruct vessel/cargo from a `StoredMatch` row that does not persist `openPosition`, `speedLaden`, `consumption`, or `cargo_quantity_mt`. These fields are nulled (lines 84, 89, 91, 31, 37), so `computeStoredMatchEconomics` receives a degraded proxy that cannot determine ballast distance → it always falls back to round-trip duration. A typical Supramax voyage jumps from ~17 days (single-voyage) to ~27 days (round-trip), making `dailyTce = netVoyageUsd / durationDays` **40–60% smaller** or even negative when `netVoyageUsd < 0` at a low user-entered rate.

---

## 3. Divergence Cause per Issue

### Issue #1000 — Negative Recalculate TCE

**Root**: `buildVesselProxy` (`route.ts:54`) sets `openPosition: null` (line 84), `speedLaden: null` (line 89), `consumption: null` (line 91). `buildCargoProxy` (`route.ts:22`) sets `weightMt: null`, `quantity: null` (lines 31, 37).

Chain of effects:
1. `openPosition=null` → `getPortDistance(openPosition, loadPort)` returns null → `ballastDistanceNm=null`
2. `ballastDistanceNm=null` → `computeTce` falls into `estimateRoundTripDays(2×laden+2)` (`compute-tce.ts:123`)
3. `speedLaden=null` → `parseLeadingNumber(vessel.speedLaden)` returns 0 → resolves to class default (~12 kt) via `resolveConsMtPerDay`
4. `consumption=null` → `parseConsumption(vessel.consumption, 0)` returns 0 → class-estimate fires
5. `quantity=null` → `resolveCargoWeight(cargo)` returns DWT×0.65 (not actual cargo)
6. Duration inflated ~57% → `dailyTce = netVoyage / inflatedDays` → negative when `netVoyage ≈ 0` at market rate

**Voyage P&L does not have this bug**: `EconomicsTab` passes `ballastDistanceNm` from `storedMatch.ballast_distance_nm` (`page.tsx:153-157`) into `buildCanonicalTceInputs`, which preserves the stored single-voyage span.

**Fix path**: Persist `vessel_open_position`, `vessel_speed_kts`, `vessel_consumption_mt_per_day`, `cargo_quantity_mt` in the `matches` table. PATCH proxy reads real stored values instead of nulling them.

---

### Issue #1001 — "Explain this deal" silent no-op

**Root**: Two-flag desync + wrong gate ordering.

| Flag | Where | Value in demo build | Effect |
|------|-------|--------------------|----|
| `NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED` | Bundle-time env | `true` | Button renders in RSC (`page.tsx:298`) and passes client gate (`ExplainDealModal.tsx:139`) |
| `EXPLAIN_DEAL_ENABLED` | Runtime server env | not set (→ `undefined`) | Server route fires 403 (`explain-deal/route.ts:204-206`) |

Gate ordering in `app/api/ai/explain-deal/route.ts`:
```
Line 204: if EXPLAIN_DEAL_ENABLED !== 'true' → return 403 { feature_disabled }
Line 246: if isDemoMode()                    → return buildDemoExplanation(...)  ← UNREACHABLE
```

`isDemoMode()` is a dead path. The 403 fires before it. User sees button (rendered), clicks it, receives 403 → `ExplainDealModal` shows "This feature is not enabled" error — which looks like a silent no-op if the error state is not prominent.

`buildDemoExplanation()` (line 64) is fully implemented and returns a valid 4-section narrative without LLM call. It just can't be reached.

**Fix path**: Either (a) move `isDemoMode()` check BEFORE the `EXPLAIN_DEAL_ENABLED` gate, or (b) set `EXPLAIN_DEAL_ENABLED=true` in the demo `.env.local`. Option (a) is safer — demo mode shouldn't need the feature flag enabled in prod env.

---

### Issue #1002 — Route-blind Rotterdam bunker default

**Root**: Two independent bugs, one compounds the other.

**Bug A — Hardcoded default in EconomicsTab**:  
`components/match/EconomicsTab.tsx:91`:
```ts
const [bunkerPort, setBunkerPort] = useState<BunkerPort | null>('NLRTM');
```
All Voyage P&L TCE calculations default to Rotterdam live price regardless of actual trade route. A Black Sea voyage (e.g. Odessa → Izmir) would use Rotterdam pricing, not Konstantsa or Istanbul.

**Bug B — Comment is factually wrong**:  
`EconomicsTab.tsx:169-173` says: *"keep Rotterdam to match stored LIST TCE which is always computed at NLRTM"*. This is incorrect. The stored path uses `DEFAULT_BUNKER_USD_PER_MT=600` (a flat fallback, `lib/constants.ts:116`), NOT Rotterdam live spot. So:
- Stored TCE: $600/MT flat fallback
- Voyage P&L TCE: Rotterdam live spot (e.g. $580 or $620)
- These are already divergent; the comment perpetuates a false assumption.

**Bug C — Bunker recommendation not auto-wired**:  
`app/api/voyage/bunker-recommendation/route.ts` implements 28-hub on-route comparison including Med/Black Sea regional hubs. Result is returned and shown in the comparison table. But `EconomicsTab.tsx:169` explicitly comments: *"do NOT auto-set bunkerPort here"* — so the recommended port never updates the headline P&L calculation.

**Fix path**: 
1. On bunker-recommendation response, auto-set `bunkerPort` to recommended port (remove the deliberate non-wiring at line 169).
2. Stored-path bunker: pass live NLRTM price into `computeStoredMatchEconomics` at match-creation time so stored TCE and Voyage P&L TCE use the same live price at creation time (not a flat $600 constant).

---

### Issue #1003 — Two scoring systems produce contradictory labels

**Root**: Legacy scorer still runs to completion alongside new fit scorer. `applyBallastSizeCap` demotes fit-derived matchLevel independently of bucket label derivation. These are three separate systems on three independent code paths.

**Timeline in `pair-analyzer.ts`**:

| Line(s) | Action | System |
|---------|--------|--------|
| 573, 617 | `computeScoreBreakdown(...)` → numeric score (0-100) | Legacy scorer |
| 581, 625, 638 | `m.matchLevel = deriveMatchLevel(m.score)` — score≥70→'good', ≥40→'possible' | Legacy scorer |
| 658-671 | `applyBallastSizeCap` demotes legacy 'good' → 'possible' if ballast > 2×classRadius | Legacy cap |
| 737-748 | `computeFitBreakdown({..., tceUsdPerDay})` → `m.fitPercent` (e.g. 87%) | New fit scorer |
| 751 | `m.matchLevel = deriveMatchLevelFromFit(m.fitPercent)` — fit≥70→'good', ≥60→'possible' | **Overwrites legacy** |
| 754-765 | `applyBallastSizeCap` on fit-derived 'good' → may demote to 'possible' | Fit cap |
| 775 | Sort by `fitPercent` desc | — |

The `matchLevel` at line 751 OVERWRITES the legacy value at line 638. So the "87% · Possible Match" scenario is coherent: fit=87 → 'good' → ballast cap fires → 'possible'. The contradiction is not between the two scorers — it's between `matchLevel='possible'` (hero pill label) and `bucketReason.bucket='main'` (shown as "MAIN MATCH").

**Bucket reason is independent** (`lib/matching/bucket-reason.ts:deriveBucketReason`): returns `{ bucket: 'main', reason: 'Passed all hard filters...' }` when no exclusion condition applies. 'main' bucket ≠ 'good' tier — a 'possible' match can be in the 'main' bucket. The UI conflates "MAIN MATCH" (bucket label) with quality tier ("Good/Possible Match"), making it read as a contradiction.

**Additional noise**: Legacy `score`, `scoreBreakdown` (`reason_structured` column) still persisted to DB and included in RSC payload. They're dead-end tech debt — nothing in the UI reads `m.score` for display since fit scoring launched.

**Fix path**:
1. Remove legacy `computeScoreBreakdown` from `pair-analyzer.ts` (dead path since fit scorer overwrites `matchLevel`).
2. Rename "MAIN MATCH" UI label to "Main Bucket" or "Priority Match" to distinguish bucket partition from quality tier. Or: render `deriveBucketReason().reason` as tooltip, not header.
3. Optionally: drop `score` / `reason_structured` columns (migration).

---

## 4. Canonical-Calculator Seam

### Where it is now

`lib/economics/compute-tce.ts:computeTce` — pure, synchronous, deterministic, no DB/network. All three main paths already call it. **The seam already exists.**

### What's broken at the seam

The seam should be defined not at `computeTce` but at `computeStoredMatchEconomics` — the function that hydrates all inputs correctly (real vessel speed, consumption, ballast distance, DA, EUA, canal). All surfaces should call this function with **real, not reconstructed** inputs.

```
CORRECT INPUT SEAM
──────────────────
                 ┌─ Fit scoring (match creation)
                 │    real ParsedVessel / ParsedCargo from email parse
                 │
computeStoredMatchEconomics ─→ buildMatchEconomics ─→ computeTce
                 │
                 ├─ Voyage P&L (EconomicsTab live recalc)
                 │    real values from storedMatch + UI overrides
                 │
                 └─ Recalculate PATCH (user enters freight rate)
                      ← CURRENTLY BROKEN: uses null-stripped proxy
                         must use real persisted vessel/cargo fields
```

### Proposed seam definition

**Single rule**: Every TCE call goes through `computeStoredMatchEconomics`. No caller constructs raw `TceInputs` independently.

| Consumer | Current path | Post-fix path |
|----------|-------------|---------------|
| Match creation (`pair-analyzer.ts:730`) | `computeMatchEconomicsFor` → `computeStoredMatchEconomics` | No change (already correct) |
| Voyage P&L tab (`/api/voyage/tce`) | `calculateTCE` → `computeTce` directly | Acceptable — `durationDays` is explicitly computed by EconomicsTab from `buildCanonicalTceInputs`; parity maintained |
| PATCH recalculate (`/api/matches/[id]`) | `buildCargoProxy`/`buildVesselProxy` → `computeStoredMatchEconomics` (broken inputs) | **Persist real fields; read from DB, not proxy reconstruction** |
| Bucket card fallback (`session-buckets.ts:69`) | `computeEstimatedTce` legacy wrapper | Acceptable until distance unresolvable case is addressed separately |

### Minimum fix for seam correctness

Add to `matches` table (new migration):
```sql
ALTER TABLE matches ADD COLUMN vessel_open_position TEXT;
ALTER TABLE matches ADD COLUMN vessel_speed_kts REAL;
ALTER TABLE matches ADD COLUMN vessel_consumption_mt_per_day REAL;
ALTER TABLE matches ADD COLUMN cargo_quantity_mt REAL;
ALTER TABLE matches ADD COLUMN ballast_distance_nm REAL;  -- already added per #849?
```

Note: `ballast_distance_nm` may already be persisted (see `stored-match-economics.ts:64` return type includes `ballast_distance_nm`). Verify migration state before adding again.

`buildVesselProxy` then reads real values:
```ts
// PATCH route.ts — after fix
speedLaden: existing.vessel_speed_kts ? String(existing.vessel_speed_kts) : null,
consumption: existing.vessel_consumption_mt_per_day ? String(existing.vessel_consumption_mt_per_day) : null,
openPosition: existing.vessel_open_position ?? null,
```

`buildCargoProxy` reads real quantity:
```ts
quantity: existing.cargo_quantity_mt ? String(existing.cargo_quantity_mt) : null,
```

---

## 5. Risks / Blast Radius

| Change | Blast radius | Risk |
|--------|-------------|------|
| Persist `vessel_open_position`, `vessel_speed_kts`, `vessel_consumption_mt_per_day`, `cargo_quantity_mt` in matches table | New migration; affects `compute-matches.ts`, `persist-session-matches.ts`, match creation path | LOW — additive columns; existing rows get NULL (proxy falls back to same behavior as today for old rows) |
| PATCH proxy reads real fields instead of null | `app/api/matches/[id]/route.ts` + PATCH handler | MEDIUM — changes Recalculate TCE output. Any test asserting PATCH response `tce_usd_per_day` value will need update. Verify `__tests__/matches-patch-*.test.ts`. |
| `isDemoMode()` before `EXPLAIN_DEAL_ENABLED` in explain-deal route | One route file; no DB, no migration | LOW — feature flag behavior unchanged for non-demo; demo gets working flow |
| Auto-wire bunker-recommendation to `bunkerPort` state | EconomicsTab client component | LOW-MEDIUM — headline P&L number changes when recommended port ≠ NLRTM; user-visible number changes after tab load. Remove the explicit non-wiring comment at line 169. |
| Remove legacy `computeScoreBreakdown` from pair-analyzer | `pair-analyzer.ts`, `match-scoring.ts`, `__tests__/match-scoring.test.ts` | MEDIUM — `score`, `reason_structured` columns become dead writes. Any test asserting `m.score` or `scoreBreakdown` shape fails unless updated. Existing DB rows keep legacy data. |
| Rename "MAIN MATCH" label in UI | `components/match/MatchBucketCard.tsx` (or equivalent label source) | LOW — UI only, no logic |
| Drop `score`/`reason_structured` DB columns | Migration; irreversible | HIGH — deferrable; do after legacy scorer removed and verified |

---

## 6. Acceptance Criteria Status

### Epic #1004 — TCE paths synchronized

| AC | Description | Status |
|----|-------------|--------|
| AC-E1 | On any match at market freight rate: fit-scoring TCE == Voyage P&L TCE == Recalculate TCE (same number, same sign) | ❌ FAILING — Recalculate uses round-trip duration; fit uses single-voyage |
| AC-E2 | TCE is never negative for a market-rate freight input on a real cargo/vessel pair | ❌ FAILING — inflated duration causes negative dailyTce at market rate on some pairs |
| AC-E3 | Bunker price source documented and consistent between stored and live paths | ❌ FAILING — stored uses $600 flat; live uses Rotterdam spot; comment at EconomicsTab:169 is incorrect |

---

### Issue #1000 — Negative Recalculate TCE

| AC | Description | Status |
|----|-------------|--------|
| AC-1a | PATCH Recalculate uses same duration formula as Voyage P&L tab (single-voyage when ballast known) | ❌ FAILING |
| AC-1b | PATCH Recalculate uses actual vessel speed & consumption (not class defaults) | ❌ FAILING |
| AC-1c | PATCH Recalculate uses actual cargo quantity (not DWT×0.65) | ❌ FAILING |
| AC-1d | After fix: `overrideTce` in PATCH response matches Voyage P&L TCE within ±5% at same freight rate | ❌ NOT VERIFIABLE until AC-1a/b/c addressed |

---

### Issue #1001 — "Explain this deal" silent no-op

| AC | Description | Status |
|----|-------------|--------|
| AC-1001a | In demo mode, clicking "Explain this deal" returns 200 with demo narrative (no LLM call) | ❌ FAILING — server returns 403 before `isDemoMode()` check |
| AC-1001b | In non-demo mode without `EXPLAIN_DEAL_ENABLED`, button is hidden (not just erroring) | ✅ PASSING — RSC gate at `page.tsx:298` uses `NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED`; if that's false, button not rendered |
| AC-1001c | Demo explanation modal shows 4-section narrative without network/LLM latency | ❌ FAILING (blocked by AC-1001a) |

---

### Issue #1002 — Route-blind Rotterdam bunker default

| AC | Description | Status |
|----|-------------|--------|
| AC-1002a | Voyage P&L TCE auto-updates to on-route recommended bunker port after tab load | ❌ FAILING — deliberate non-wiring at `EconomicsTab.tsx:169` |
| AC-1002b | EconomicsTab comment at line 169 accurately describes stored-path bunker source | ❌ FAILING — comment says "always NLRTM"; actual stored-path uses DEFAULT_BUNKER=600 |
| AC-1002c | Stored TCE and live Voyage P&L TCE use the same bunker price at match creation time | ❌ FAILING — stored uses $600 flat; live uses NLRTM spot |

---

### Issue #1003 — Two scoring systems contradictory labels

| AC | Description | Status |
|----|-------------|--------|
| AC-1003a | Legacy `computeScoreBreakdown` removed or no longer affects persisted/displayed values | ❌ FAILING — still runs and writes `score`/`reason_structured` |
| AC-1003b | "MAIN MATCH" label (bucket=main) and match quality label (Good/Possible) are visually distinguished | ❌ FAILING — current UI reads as a contradiction |
| AC-1003c | `applyBallastSizeCap` demotion reason surfaced in UI as tooltip or secondary text | ❌ FAILING — ballast cap fires silently; "87% Possible Match" unexplained |
| AC-1003d | `m.score` / `m.scoreBreakdown` removed from RSC payload (dead fields) | ❌ FAILING — still included |

---

## 7. File:Line Reference Summary

| Symbol | File | Line |
|--------|------|------|
| `DEFAULT_BUNKER_USD_PER_MT = 600` | `lib/constants.ts` | 116 |
| `computeTce` (canonical leaf) | `lib/economics/compute-tce.ts` | ~30 |
| `computeTce` duration fallback: round-trip | `lib/economics/compute-tce.ts` | 123 |
| `computeTce` duration: single-voyage | `lib/economics/compute-tce.ts` | 119-121 |
| `computeTce` duration: override | `lib/economics/compute-tce.ts` | 113-114 |
| `computeStoredMatchEconomics` | `lib/matching/stored-match-economics.ts` | 73 |
| `buildMatchEconomics` | `lib/matching/tce-calculator.ts` | ~280 |
| `buildCargoProxy` (PATCH proxy, strips quantity/weight) | `app/api/matches/[id]/route.ts` | 22 |
| `buildVesselProxy` (PATCH proxy, strips openPosition/speed) | `app/api/matches/[id]/route.ts` | 54 |
| `openPosition: null` in proxy | `app/api/matches/[id]/route.ts` | 84 |
| `speedLaden: null` in proxy | `app/api/matches/[id]/route.ts` | 89 |
| `consumption: null` in proxy | `app/api/matches/[id]/route.ts` | 91 |
| PATCH bunker lookup: live NLRTM | `app/api/matches/[id]/route.ts` | 196 |
| PATCH calls `computeStoredMatchEconomics` w/ proxy | `app/api/matches/[id]/route.ts` | 207, 230 |
| `bunkerPort` state hardcoded NLRTM | `components/match/EconomicsTab.tsx` | 91 |
| Bunker-reco NOT auto-wired (explicit comment) | `components/match/EconomicsTab.tsx` | 169 |
| `EXPLAIN_DEAL_ENABLED` server gate (fires 403) | `app/api/ai/explain-deal/route.ts` | 204-206 |
| `isDemoMode()` check (unreachable) | `app/api/ai/explain-deal/route.ts` | 246-247 |
| `buildDemoExplanation` (implemented, never called) | `app/api/ai/explain-deal/route.ts` | 64 |
| RSC gate for ExplainDealModal | `app/match/[id]/page.tsx` | 298 |
| Client gate (`NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED`) | `components/match/ExplainDealModal.tsx` | 139 |
| Legacy `computeScoreBreakdown` call | `lib/matching/pair-analyzer.ts` | 573, 617 |
| Legacy `deriveMatchLevel` sets `m.matchLevel` | `lib/matching/pair-analyzer.ts` | 581, 625, 638 |
| `computeFitBreakdown` call | `lib/matching/pair-analyzer.ts` | 737 |
| `m.fitPercent` assigned | `lib/matching/pair-analyzer.ts` | 748 |
| `m.matchLevel` overwritten by fit scorer | `lib/matching/pair-analyzer.ts` | 751 |
| `applyBallastSizeCap` (fit-derived cap) | `lib/matching/pair-analyzer.ts` | 754-765 |
| Sort by fitPercent | `lib/matching/pair-analyzer.ts` | 775 |
| `deriveMatchLevel` (legacy: score≥70→'good') | `lib/sailing/match-scoring.ts` | ~L60 |
| `deriveMatchLevelFromFit` (fit≥70→'good') | `lib/sailing/match-scoring.ts` | ~L80 |
| `deriveBucketReason` (bucket=main independent of tier) | `lib/matching/bucket-reason.ts` | ~L30 |
