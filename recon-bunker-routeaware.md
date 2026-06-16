BRANCH_AT_START=claude/bunker-routeaware

# Recon: Route-Aware Bunker Port (#1002) — Design Map

**Date**: 2026-06-15  
**Branch**: `claude/bunker-routeaware`  
**Status**: RECON ONLY — no code edits

---

## 0. Critical Context: What's Already Done

Before scoping #1002, note that **#1000 (PATCH proxy fix)** is already complete on this branch:

- `lib/migrations/052-matches-vessel-cargo-inputs.ts` ✅ exists — 4 columns added idempotently
- `lib/matching/matches-repository.ts` ✅ wired with `hasVesselCargoInputColumns` guard, conditional INSERT/refresh
- `lib/matching/compute-matches.ts:152-155` ✅ passes `vessel_open_position`, `vessel_speed_kts`, `vessel_consumption_mt_per_day`, `cargo_quantity_mt` to `createMatch`
- `lib/matching/persist-session-matches.ts:195-198` ✅ same
- `scripts/demo-seed/regenerate-matches.ts:762-767` ✅ same in `writeBucket`
- `app/api/matches/[id]/route.ts:92-99` ✅ `buildVesselProxy`/`buildCargoProxy` now reads from stored columns

**#1002 is the only open scope on this branch.**

---

## 1. How the On-Route Recommendation Is Computed Today

**File:** `app/api/voyage/bunker-recommendation/route.ts` (HTTP GET endpoint, `force-dynamic`)

### Inputs (query params)
| Param | Type | Notes |
|-------|------|-------|
| `from` | LOCODE or port name | load port |
| `to` | LOCODE or port name | discharge port |
| `grade` | VLSFO \| MGO | default VLSFO |
| `dwt` | number? | vessel DWT for lift estimate |
| `speedKn` | number? | vessel speed for effective $/MT |
| `consMtPerDay` | number? | vessel consumption for effective $/MT |
| `voyageDays` | number? | for bunker lift estimate |

### Selection Logic (file:line)
1. **Basin filter** — `isCandidateInVoyageBasins(candidate, from, to)` (`lib/sailing/voyage-basin.ts:283`) — excludes candidates outside the BFS-corridor of basins between from→to. Prevents Pacific/EastAsia hubs appearing on Med routes. Fail-open for unknown basins.
2. **DB price lookup** — `getLatestBunkerPrice(db, candidate, 'VLSFO')` — synchronous, SQLite. No DB row → skip candidate.
3. **Stale watchdog** — logs warn if price_date older than 7 days; does NOT exclude.
4. **Detour filter** — `leg1 + leg2 - directNm ≤ max(0.15 × directNm, 200 NM)`. If leg distance unknown: fail-open, include candidate with `deviationNm=0`.
5. **Effective $/MT rank** — `computeBunkerComparison({candidates, vesselSpeedKn, dailyConsMtPerDay, liftTonnes, vesselDayRateUsd, euaPriceEur?})` (`lib/economics/bunker-comparison.ts`) — pure math, returns array sorted by `effectiveUsdPerMt ASC` (includes detour fuel cost, time cost @ $15k/day default, EU ETS carbon cost).
6. **Winner** — `candidates[0]` = min effective $/MT.

### Outputs
```ts
interface BunkerRecommendationResponse {
  port: string | null;          // LOCODE of winner (e.g. 'ESCEU')
  priceUsdPerMt: number | null; // raw price at that port (live DB)
  recommendation: string | null; // human-readable
  savingsUsd: number;           // vs worst on-route candidate
  candidates: BunkerCandidateRow[];
  fallback: boolean;            // true = no on-route candidates found
}
```

### Can it run server-side / be extracted as a lib fn?

**YES.** All logic is synchronous DB access + pure math — zero network I/O:
- `getPortDistance` — pure lookup
- `isCandidateInVoyageBasins` — pure math + PORTS_JSON
- `getLatestBunkerPrice` — synchronous SQLite
- `computeBunkerComparison` — pure math
- `estimateBunkerLift` — pure math
- `getLatestEuaPrice` — synchronous SQLite

The route handler is `force-dynamic` only because of `getStore()`. The selection algorithm is fully extractable into a pure, synchronous lib fn.

### 28-hub candidate list
```
SGSIN CNZOS HKHKG KRPUS CNSHA TWKHH LKCMB  (Asia/Pacific)
AEFJR SAJED                                   (Middle East)
NLRTM BEANR GIGIB ESALG ESLPA GRPIR TRIST MTMLA  (Europe ARA + Med)
ROCND EGPSD ITAUG ESCEU CYLMS               (Med + Black Sea regional — added 2026-06-02)
USHOU USNYC PABLB BRSSZ USLAX               (Americas)
ZADUR                                         (Africa)
```

---

## 2. The 3 Bunker Consumers

### Consumer A — Stored (match-creation, list TCE)
All 3 write-paths call `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` → pass price to `computeStoredMatchEconomics`.

| Write-path | Bunker lookup | File:line |
|------------|--------------|-----------|
| `compute-matches.ts` | `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` | `:54` |
| `persist-session-matches.ts` | `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` | `:57` |
| `regenerate-matches.ts` | `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` | `:594` |
| PATCH route | `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` | `app/api/matches/[id]/route.ts:204` |

Flow: price → `computeStoredMatchEconomics({..., bunkerPriceUsdPerMt})` → `buildMatchEconomics(...)` → `computeTce(...)` → `tce_usd_per_day` column.

Fallback when table empty: `DEFAULT_BUNKER_USD_PER_MT = 600` (`lib/constants.ts:116`). **NOTE:** `$600` is NOT the normal stored-path price — all write-paths pass live NLRTM price; $600 is only the empty-table fallback in `stored-match-economics.ts:196`.

### Consumer B — Detail (EconomicsTab → /api/voyage/tce, headline TCE)

```
EconomicsTab.tsx:91   → useState<BunkerPort|null>('NLRTM')  ← HARDCODED default
EconomicsTab.tsx:291  → POST /api/voyage/tce { bunkerPort: 'NLRTM', ... }
tce/route.ts:311-314  → getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')
```

**Deliberate non-wiring at `EconomicsTab.tsx:169`:**
```ts
// NOTE: We do NOT auto-set bunkerPort to the recommended on-route port here.
// The headline voyage TCE stays on baseline NLRTM/VLSFO so it matches the stored
// LIST/fit TCE, which is computed at live NLRTM/VLSFO spot...
```
This guard is CORRECT given the current state — auto-wiring only the DETAIL side would make DETAIL use Ceuta while LIST stays NLRTM → DETAIL ≠ LIST on every Med/Black-Sea route → regresses #1009.

### Consumer C — PATCH (Recalculate override)
Same as Consumer A: `app/api/matches/[id]/route.ts:204` hardcodes NLRTM. After #1000 fix, it reads real vessel/cargo inputs from stored columns so the economics are correct — but the bunker port remains NLRTM.

---

## 3. The Canonical Seam: `resolveRecommendedBunkerPort`

### THE TRAP (from the task brief — confirmed in code)

If DETAIL auto-wires (sets bunkerPort ← recommended) but STORED stays NLRTM:
- STORED: `tce_usd_per_day` computed with NLRTM price (e.g. $608/MT)
- DETAIL: shows Ceuta price (e.g. $642/MT effective after detour)
- DETAIL ≠ LIST on every Med/Black Sea route → **breaks #1009**

The non-wiring at `EconomicsTab.tsx:169` correctly prevents this divergence.

### CORRECT DESIGN

Make the STORED path route-aware too. Both list and detail use the SAME recommended port → same economics → list == detail preserved.

```
resolveRecommendedBunkerPort(db, loadPort, dischargePort, 'VLSFO', vesselOpts?)
  ├─ returns { port: 'ESCEU', priceUsdPerMt: 642 }    (Med route → Ceuta)
  ├─ returns { port: 'CYLMS', priceUsdPerMt: 651 }    (Black Sea → Cyprus)
  └─ returns { port: 'NLRTM', priceUsdPerMt: 608, fallback: true }  (no on-route candidates)
```

Both `compute-matches.ts` and `EconomicsTab` use the same selection algorithm → same port → same price → TCE invariant maintained.

### Proposed Lib Function

**Location:** `lib/economics/bunker-routing.ts` (near `bunker-comparison.ts`)

```ts
import type Database from 'better-sqlite3';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { getLatestBunkerPrice, getLatestEuaPrice } from '@/lib/market/bunker-repository';
import { isCandidateInVoyageBasins } from '@/lib/sailing/voyage-basin';
import { computeBunkerComparison } from '@/lib/economics/bunker-comparison';
import { estimateBunkerLift } from '@/lib/economics/bunker-lift';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { DEFAULT_BUNKER_USD_PER_MT } from '@/lib/constants';

export interface RecommendedBunkerPort {
  port: string;              // LOCODE e.g. 'ESCEU', 'NLRTM'
  priceUsdPerMt: number;     // live price from this port's DB row
  fallback: boolean;         // true = no on-route candidates → defaulted to NLRTM
}

interface VesselOpts {
  dwtSummer?: number;
  speedKn?: number;
  consMtPerDay?: number;
  voyageDays?: number;
}

/**
 * Synchronous, DB-only selection of the cheapest on-route bunker port.
 * Mirrors the HTTP GET /api/voyage/bunker-recommendation algorithm.
 * Fallback: NLRTM (current behavior when no on-route candidates).
 */
export function resolveRecommendedBunkerPort(
  db: Database.Database,
  loadPort: string,
  dischargePort: string,
  grade: 'VLSFO' | 'MGO',
  vessel?: VesselOpts,
): RecommendedBunkerPort {
  // ... same BUNKER_CANDIDATES loop from route.ts, extracted here
  // Returns NLRTM fallback when loop finds nothing
}
```

**What it does (mirrors route.ts algorithm):**
1. Loop `BUNKER_CANDIDATES` — same 28 hubs, same constant (move to `lib/economics/bunker-routing.ts` or re-export)
2. `isCandidateInVoyageBasins(candidate, loadPort, dischargePort)` — same basin filter
3. `getLatestBunkerPrice(db, candidate, grade)` — same DB lookup
4. Detour check via `getPortDistance` — same 15% / 200 NM threshold
5. `computeBunkerComparison(...)` — same effective $/MT ranking
6. Return winner; fallback to `{ port: 'NLRTM', priceUsdPerMt: getLatestBunkerPrice(db,'NLRTM',grade)?.price_usd_per_mt ?? DEFAULT_BUNKER_USD_PER_MT, fallback: true }` if no on-route candidates

The route handler `bunker-recommendation/route.ts` becomes a thin async wrapper calling this lib fn.

---

## 4. Per-Consumer Wiring Plan

### A. Stored write-paths (3 sites → same change each)

| File | Current | Post-fix |
|------|---------|---------|
| `compute-matches.ts:52-56` | `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` | `resolveRecommendedBunkerPort(db, loadPort, dischargePort, 'VLSFO', { dwtSummer: vesselDwt, speedKn: ..., ... })` |
| `persist-session-matches.ts:55-59` | same | same |
| `regenerate-matches.ts:594-595` | same | same |
| PATCH `route.ts:202-207` | `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` | `resolveRecommendedBunkerPort(db, existing.load_port, existing.discharge_port, 'VLSFO')` |

Each call gets `{ port, priceUsdPerMt }`. Pass `priceUsdPerMt` to `computeStoredMatchEconomics` as `bunkerPriceUsdPerMt`. **Also persist `port` LOCODE in new `bunker_port` column** (see migration 053 below).

### B. EconomicsTab (Detail path — seed from stored port)

EconomicsTab needs a new prop `initialBunkerPort?: string | null`. The page.tsx RSC passes `storedMatch.bunker_port`.

```ts
// EconomicsTab.tsx
const [bunkerPort, setBunkerPort] = useState<BunkerPort | null>(initialBunkerPort ?? 'NLRTM');
```

When `storedMatch.bunker_port = 'ESCEU'`, EconomicsTab initializes with Ceuta → fires `/api/voyage/tce` with `bunkerPort='ESCEU'` → detail TCE uses same Ceuta price source as stored TCE → list == detail.

**The non-wiring comment at line 169 changes meaning:** Instead of "never auto-wire", it becomes "auto-wire from `initialBunkerPort` at init; the client-side reco merely CONFIRMS the engine's choice (advisory)." The reco response still shows the comparison table; if reco returns a different recommended port (e.g. price changed since creation), user can switch manually.

### C. New migration 053 — `bunker_port TEXT`

```ts
// lib/migrations/053-matches-bunker-port.ts
const migration053: Migration = {
  version: 53,
  name: 'matches-bunker-port',
  up(db) {
    const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{name:string}>;
    if (!cols.some(c => c.name === 'bunker_port')) {
      db.exec(`ALTER TABLE matches ADD COLUMN bunker_port TEXT`);
    }
  },
  down(db) { void db; },
};
```

**Why persist the port LOCODE (not just the price)?**
- EconomicsTab reads it to initialize `bunkerPort` state → detail calls same port's live price
- Audit trail: can reconstruct what port was used in stored TCE
- Staleness: when stored TCE used Ceuta but Ceuta price is now stale, detail will still look up Ceuta (fresh price), which is the right behavior

### D. Wire `bunker_port` into CREATE/refresh paths

`matches-repository.ts` — add `bunker_port?: string | null` to `StoredMatch` and `CreateMatchInput`, add `hasBunkerPortColumn(db)` guard, wire into INSERT and `refreshComputedColumns` (mirror `hasVesselCargoInputColumns` pattern at lines 162-165, 208-253, 479-481).

---

## 5. Edge Cases / Fallback / Staleness

### Fallback to NLRTM
When `resolveRecommendedBunkerPort` finds no on-route candidates:
- Returns `{ port: 'NLRTM', priceUsdPerMt: ..., fallback: true }`
- Stored TCE uses NLRTM — same as current behavior
- EconomicsTab initializes with NLRTM — same as current
- **Invariant preserved for all non-Med/Black-Sea routes**

### When `bunker_port` column doesn't exist yet (old rows)
- `StoredMatch.bunker_port` will be `undefined`/`null`
- EconomicsTab: `initialBunkerPort ?? 'NLRTM'` → NLRTM fallback
- Existing rows keep current behavior — no disruption

### Staleness: stored price vs. detail live price
The stored `tce_usd_per_day` is computed at match-creation time with Ceuta price (e.g. $640/MT on day 0). The EconomicsTab re-fetches Ceuta live price on day 3 (e.g. $650/MT). This causes small TCE drift (bunker cost differs by $10/MT × lift tonnage / voyage days).

**Assessment:** same drift existed before for NLRTM — the port is now correct, only intraday price movement remains. This is expected and mirrors the existing behavior. No change needed.

**Do NOT persist `bunker_price_usd_per_mt` as a stored snapshot.** The detail path already always uses live price for the chosen port; parity is through port identity, not frozen price.

### When `resolveRecommendedBunkerPort` is slow (DB scan over 28 hubs)
28 synchronous SQLite `SELECT` calls — negligible in a single transaction context. Already done in the HTTP GET handler; extracting to lib fn does not change the cost.

### When load or discharge port is unknown/vague
- `getPortDistance(loadPort, candidate)` returns null → candidate included with `deviationNm=0` (fail-open from route.ts behavior)
- If `loadPort` itself is null → `resolveRecommendedBunkerPort` cannot determine corridor → return NLRTM fallback immediately

---

## 6. Blast Radius + Regen Plan

### Which matches change
All Med/Black Sea routes where a cheaper on-route port exists:
- Nemrut Bay → Liverpool: NLRTM → Ceuta (saves ~$44,968 on 500 MT lift = ~$2,141/day on a 21-day voyage)
- Marmara → Central Med: NLRTM → Trieste (saves ~$11,843 on ~500 MT lift = ~$564/day)
- Black Sea → NW Europe: NLRTM → Constanta or Ceuta
- East Med → any: NLRTM → Limassol or Port Said

NW Europe ↔ NW Europe routes: NLRTM wins the comparison → no change.
Asia/Pacific routes: Singapore wins → stored TCE changes for those routes too.

**TCE magnitude (Supramax, Ceuta vs Rotterdam example):**
- Savings per MT lift: ~$44,968 / 500 MT = $89.94/MT
- Voyage duration: ~21 days (Nemrut → Liverpool with Ceuta detour ≈ +0.5 day)
- TCE uplift: ~$44,968 / 21 ≈ **+$2,141/day**
- At market rate ($54.72/MT), stored TCE was +$5,353/day → becomes +$7,494/day (**40% increase**)

**Number of affected rows:** depends on demo seed DB. The route-aware fix affects every Med/Black Sea match (estimated 30-50% of seed matches based on typical demo data).

### Regen Plan
1. Run `scripts/demo-seed/regenerate-matches.ts --dry` to see which matches change and by how much
2. Merge migration 053 into the DB (`runMigrations` on startup handles it automatically)
3. Run `scripts/demo-seed/regenerate-matches.ts` (without --dry) to persist new seed values
4. Script internally calls `invalidateLiveSessions` — wipes per-session UUID copies so next login re-hydrates with fresh data
5. Prod-write via founder-auth admin endpoint or direct SSH to `data/demo-seed.db`

The `regenerate-matches.ts` already calls `writeBucket` which calls `computeStoredMatchEconomics` via `analyzePairs`. After adding `resolveRecommendedBunkerPort` to the bunker lookup at line 594-596, the regen will automatically pick the right port per route.

---

## 7. "One Number" Invariant Test

### Proposed test
**File:** `__tests__/api/bunker-routeaware-parity.test.ts`

```ts
// Asserts: stored bunker_port == EconomicsTab initial port == recommended port
// AND stored tce ≈ detail tce (same port, live price)
describe('bunker route-aware parity — #1002', () => {
  it('Med route uses on-route port in stored TCE, not NLRTM', () => {
    // Seed a Med match: load_port='TRJIY' (Nemrut Bay), discharge='GBLIV' (Liverpool)
    // Run computeStoredMatchEconomics with resolveRecommendedBunkerPort
    // → expect result.bunker_port !== 'NLRTM' (Ceuta or Gibraltar should win)
    // → tce_usd_per_day > 0
    const result = computeStoredMatchEconomics({
      cargo: { originPort: cf('Nemrut Bay'), destinationPort: cf('Liverpool'), ... },
      vessel: { dwtSummer: cf(56000), speedLaden: '13', consumption: '28', ... },
      db: testDb,
      bunkerPriceUsdPerMt: undefined, // let it auto-select via resolveRecommendedBunkerPort
    });
    expect(result.bunker_port).not.toBe('NLRTM');
    expect(result.tce_usd_per_day).toBeGreaterThan(0);
  });

  it('NW Europe route stays at NLRTM (fallback correct)', () => {
    // load_port='BEANR' (Antwerp), discharge='NLRTM' (Rotterdam)
    // On-route comparison → NLRTM wins or is the only candidate
    const result = computeStoredMatchEconomics({
      cargo: { originPort: cf('Antwerp'), destinationPort: cf('Rotterdam'), ... },
      db: testDb,
    });
    expect(result.bunker_port).toBe('NLRTM');
  });

  it('list-bunkerPort == detail-bunkerPort == recommended for Med route', async () => {
    // Create match with stored bunker_port via computeStoredMatchEconomics
    // GET /api/voyage/bunker-recommendation?from=TRNemrut&to=GBLIV
    // Assert stored.bunker_port === reco.port
    // Assert |stored.tce - detail.tce| / stored.tce < 0.05  (price drift only)
  });
});
```

**Behavioral test (PI2):** the list-bunkerPort==detail-bunkerPort assertion is behavioral (makes HTTP call to the recommendation API or calls the lib fn directly, checks actual port selection).

---

## 8. Issue Acceptance Criteria Status

| Issue | Criterion | Status | Evidence |
|-------|-----------|--------|----------|
| #1002 | Voyage P&L TCE auto-updates to on-route recommended bunker port | ❌ | `EconomicsTab.tsx:91` hardcodes NLRTM; non-wiring at `:169` is deliberate |
| #1002 | EconomicsTab comment at `:169` accurately describes stored-path bunker source | ❌ | Comment says "live NLRTM/VLSFO spot" — **factually correct** (not $600 flat); but the "correct fix" description is now this plan |
| #1002 | Stored TCE and live Voyage P&L TCE use same bunker port | ❌ | Stored uses NLRTM; detail uses NLRTM too (same by coincidence, not by design) |
| #1004 (partial) | One bunker model everywhere | ❌ | 4 separate hardcoded NLRTM lookups |
| #1009 | list==detail TCE invariant | ✅ | #1009 already merged; DA vague-port fix done; bunker still both NLRTM so invariant holds today |
| #1000 | PATCH Recalculate uses single-voyage duration + real inputs | ✅ | Migration 052 + proxy fix done on this branch |

---

## 9. Design Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `resolveRecommendedBunkerPort` returns different port than HTTP route for same inputs | MEDIUM | They must use identical BUNKER_CANDIDATES + detour constants + effectiveUsdPerMt formula. Extract one copy, route handler becomes wrapper. |
| Regen changes TCE for Med matches → demo numbers shift | LOW | Expected and correct — the founder's whole complaint is the numbers are wrong. Run --dry first, review delta. |
| `bunker_port` column absent on prod DB at deploy time | LOW | Migration 053 runs on startup; idempotent. Falls back to NLRTM via `?? 'NLRTM'` in EconomicsTab. |
| EUA price not available in some envs (integration test DB) | LOW | `computeBunkerComparison` handles `euaPriceEur=undefined` → `carbonCostUsd=0`, `euaUsedFallback=true`. No error. |
| `resolveRecommendedBunkerPort` differs from stored `bunker_port` after price table refresh | LOW | Port selection is by effective $/MT which includes detour cost — if prices change, a different port might win. Stored port reflects creation-time decision; reco shows today's decision. Acceptable: user can see both and switch manually. |
| Staleness: stored TCE at Ceuta $640 vs detail live Ceuta $655 | LOW | Same drift existed for NLRTM; now geographically correct. Not a regression. |
| `isCandidateInVoyageBasins` uses PORTS_JSON static data — server-side import at match-creation time | LOW | Already imported in `lib/sailing/voyage-basin.ts`. No new bundle impact; match-creation is server-side. |

---

## 10. File:Line Reference Summary

| Symbol | File | Line |
|--------|------|------|
| `bunkerPort` state init (NLRTM hardcoded) | `components/match/EconomicsTab.tsx` | 91 |
| Non-wiring guard comment | `components/match/EconomicsTab.tsx` | 169-176 |
| NLRTM lookup in `compute-matches` | `lib/matching/compute-matches.ts` | 54 |
| NLRTM lookup in `persist-session-matches` | `lib/matching/persist-session-matches.ts` | 57 |
| NLRTM lookup in PATCH route | `app/api/matches/[id]/route.ts` | 204 |
| NLRTM lookup in regen script | `scripts/demo-seed/regenerate-matches.ts` | 594 |
| `DEFAULT_BUNKER_USD_PER_MT = 600` (empty-table fallback only) | `lib/constants.ts` | 116 |
| `BUNKER_CANDIDATES` (28 hubs) | `app/api/voyage/bunker-recommendation/route.ts` | 32-49 |
| Detour filter constants | same | 52-53 |
| `isCandidateInVoyageBasins` | `lib/sailing/voyage-basin.ts` | 283 |
| `computeBunkerComparison` | `lib/economics/bunker-comparison.ts` | (top-level export) |
| `estimateBunkerLift` | `lib/economics/bunker-lift.ts` | (top-level export) |
| `getLatestBunkerPrice` | `lib/market/bunker-repository.ts` | 12 |
| Migration 052 (4 vessel/cargo input cols — already done) | `lib/migrations/052-matches-vessel-cargo-inputs.ts` | all |
| `hasVesselCargoInputColumns` pattern (mirror for bunker_port) | `lib/matching/matches-repository.ts` | 162-164 |
| `refreshComputedColumns` (wire `bunker_port` update here) | `lib/matching/matches-repository.ts` | ~479-481 |
| `EconomicsTabProps` interface (add `initialBunkerPort`) | `components/match/EconomicsTab.tsx` | 23-48 |
| storedMatch props passed to MatchTabs | `app/match/[id]/page.tsx` | 330-343 |

---

## 11. Confirmed: Shared Util vs. Per-Surface

**Answer: SHARED UTIL** — `lib/economics/bunker-routing.ts`.

All 4 consumers (3 stored write-paths + PATCH) call one lib fn with the same algorithm. The HTTP route handler `bunker-recommendation/route.ts` becomes a thin async wrapper. EconomicsTab seeds its initial state from the stored `bunker_port` value — no separate client-side selection algorithm needed.

The key invariant: at any given moment, calling `resolveRecommendedBunkerPort(db, cargo.originPort, cargo.destinationPort, 'VLSFO')` on the server returns the same port that the client's `GET /api/voyage/bunker-recommendation?from=X&to=Y` returns. This is guaranteed because both use the same underlying algorithm (same lib fn / same wrapper).

---

## 12. Implementation Scope (Derived from This Recon)

| Phase | Scope | Files |
|-------|-------|-------|
| 1 | Extract `resolveRecommendedBunkerPort` lib fn | CREATE `lib/economics/bunker-routing.ts` |
| 2 | Migration 053 — `bunker_port TEXT` column | CREATE `lib/migrations/053-matches-bunker-port.ts`, modify `index.ts` |
| 3 | Wire repository (StoredMatch + createMatch + refresh) | `lib/matching/matches-repository.ts` |
| 4 | Replace 4 NLRTM hardcodes with lib fn | `compute-matches.ts`, `persist-session-matches.ts`, `regenerate-matches.ts`, PATCH route |
| 5 | Seed EconomicsTab from stored port | `components/match/EconomicsTab.tsx` (add prop + change useState init), `app/match/[id]/page.tsx` (pass prop) |
| 6 | Update non-wiring comment at `:169` | `components/match/EconomicsTab.tsx` |
| 7 | Parity test | CREATE `__tests__/api/bunker-routeaware-parity.test.ts` |
| 8 | Regen seed DB | `scripts/demo-seed/regenerate-matches.ts` (already wired in Phase 4) |

Estimated PR size: 8 files modified/created, ~120-180 lines net change.
