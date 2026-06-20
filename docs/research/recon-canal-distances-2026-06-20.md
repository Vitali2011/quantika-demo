# RECON: Canal-Aware Distances (Audit-1 #4 / A6)

**Branch:** recon-canal-distances  
**Date:** 2026-06-20  
**Status:** PASS — read-only recon complete

---

## ROOT CAUSE

`centroidFallbackDistance()` in `lib/sailing/port-distances.ts:1439` uses **pure haversine** (great-circle).  
When a load/discharge port is a vague broker shorthand that is not flagged as vague by `isVagueRegion()` (sea names, coast descriptors) but resolves via `regionCentroid()`, the distance is computed straight-line through land. No canal/strait routing is applied.

**Concrete examples:**

| Route | Haversine centroid | Real (via canal) | Error |
|-------|--------------------|-----------------|-------|
| "Egypt Mediterranean port" → Douala | 1992 nm | ~5800 nm (Med→Gibraltar→W.Africa) | **−66%** |
| "North Brazil" centroid → "North China" centroid | 8497 nm | ~14000 nm (via Suez or Cape) | **−39%** |
| "WC India" centroid → Marghera | 3372 nm | ~6500 nm (via Suez) | **−48%** |
| "Continent" centroid → Iskenderun (ballast) | ~2100 nm | ~3200 nm (via Med) | **−34%** |

---

## EXISTING CANAL INFRASTRUCTURE

### Distance Engine (lib/sailing/port-distances.ts)

Four-tier waterfall — canal-awareness differs per tier:

| Tier | Source | Canal-aware? | When fires |
|------|--------|-------------|-----------|
| T1 | Hand-curated `DISTANCES_NM` matrix (~1000+ pairs) | ✅ yes (manually verified, Bosphorus/Suez labelled) | Always first |
| T2 | `data/distances/searoute-pairs.json` (105 011 pairs) | ✅ yes (pre-computed real sea routes from searoute-ts) | Pair not in T1 |
| T3 | live `searoute-ts` via `lib/sailing/searoute-client.ts` | ✅ yes (Eurostat 2025 maritime network, explicit Suez/Panama/Bosphorus/Gibraltar) | Pair not in T1/T2; enabled by default (`DISTANCE_USE_SEAROUTE_LIVE` env flag) |
| T4 | haversine great-circle (`lib/sailing/haversine.ts`) | ❌ NO | T3 unavailable; returns `{ exact: false }` |
| Centroid | haversine on `regionCentroid()` coords | ❌ NO | One/both endpoints not a real port + not flagged by `isVagueRegion()` |

**Key detail:** `searoute-ts` is installed (`node_modules/searoute-ts`) and Tier 3 IS enabled by default. Tier 3 is canal-aware for **real ports with coords**. The centroid path bypasses Tier 3 entirely.

### Canal Tariff Infrastructure (data/canal.db + lib/economics/canals/)

`canal.db` (16KB) holds tariff rows for Suez, Panama, Kiel, Bosphorus by vessel type and SCNT.  
Used **only** for computing canal DUES (USD cost), **never** for distance computation.

**Canal DETECTION** (whether a route transits a canal) lives in `lib/matching/tce-calculator.ts:155–211` via basin classification (`_classifyPortBasin`, `_routeTransitsSuez`, `_routeTransitsBosporus`). This is robust and independent of distance tier.

**Conclusion: canal.db and canal cost detection are not broken. Distance underestimation is isolated to the centroid fallback path.**

---

## ALL DISTANCE WRITE PATHS (with file:line)

Three paths write `distance_nm` (laden distance) and/or `ballast_distance_nm` to the `matches` table.

### Path 1 — Seed regen (`scripts/demo-seed/regenerate-matches.ts:748`)
```
getPortDistance(loadPort, dischargePort) → voyage.nm → distance_nm in INSERT OR IGNORE
```
Calls `getPortDistance` directly with raw port strings from parsed cargo. No normalization outside `normalizePortName` inside `getPortDistance`.

### Path 2 — Live match compute (`lib/matching/compute-matches.ts:95`)
```
getPortDistance(loadPort, dischargePort) → distanceResult.nm → distance_nm in createMatch()
```
`createMatch` → `lib/matching/matches-repository.ts:176` → INSERT.

Also: `stored-match-economics.ts:121` feeds `getPortDistance(openPosition, loadPort)` → `ballast_distance_nm` → passed into `createMatch`.

### Path 3 — Session persist (`lib/matching/persist-session-matches.ts:72`)
```
getPortDistance(loadPort, dischargePort) → distanceResult.nm → distance_nm in createMatch()
```
Same function chain as Path 2, plus `computeStoredMatchEconomics()` internally calls `stored-match-economics.ts:102,121` for both laden and ballast.

### Additional callers (not DB-write paths)

| File:line | Purpose |
|-----------|---------|
| `lib/sailing/readiness-gap.ts:202` | Ballast leg distance for readiness gap / laycan fit |
| `lib/matching/session-buckets.ts:43` | Laden distance for scoring within session bucket |
| `lib/matching/pair-analyzer.ts:285` | Laden distance for economics (TCE input) |
| `app/api/voyage/tce/route.ts:284` | Ballast leg for voyage-level TCE API (display, not stored) |
| `app/match/[id]/page.tsx:170` | Client-side ballast display (SSR, not stored) |
| `lib/economics/bunker-routing.ts:124,148,149` | Bunker route leg distances (not stored to matches) |

**All three DB-write paths call the same `getPortDistance` function. A fix to the centroid fallback propagates to all paths without per-path changes.**

### Two-Write-Path Risk

The regen (Path 1) computes `distance_nm` independently from the live paths (Paths 2/3). The regen must be re-run after any fix to populate the seed bucket. Live session matches are repopulated at next session trigger. No path divergence risk — all three call the same function.

---

## WHAT isVagueRegion vs centroid DOES

**Blocked → returns null (no distance, no haversine):**
- Sea names: "Red Sea", "Black Sea", "Aegean Sea", "Mediterranean", "Marmara Sea", etc. → `isVagueRegion=true` → `getPortDistance` returns null
- Coast descriptors: "East Coast Greece", "West Coast India" → `isVagueRegion=true` → null
- Country-only: "Turkey", "Egypt", "Greece" → `isVagueRegion=true` → null

**Falls through to centroid (has centroid, not caught by isVagueRegion) → haversine, `exact:false`:**
- "Egypt Mediterranean port (unspecified)" → centroid (31.2°N, 29.9°E) → **haversine fires**
- "North Brazil (port unspecified)" → centroid (−2.6°N, −44.4°E) → **haversine fires**  
- "North China (port unspecified)" → centroid (38.9°N, 121.6°E) → **haversine fires**
- "Continent" / "ARA" → centroid (51.9°N, 3.6°E) → **haversine fires** (common vessel open position)
- "Spain Mediterranean port" / "Spanish Mediterranean port" → not exact SEA_NAMES entry → centroid fires if regionCentroid matches

---

## REGEN SCOPE ESTIMATE

**Demo seed data:** 146 cargoes, 90 vessels.

**Affected load ports (centroid haversine, NOT null):**
- "Egypt Mediterranean port (unspecified)": **5 occurrences** as load port
- "North Brazil (port unspecified)": **1 occurrence** as load port
- Total: ~6/146 = 4% of load ports

**Affected discharge ports (centroid haversine):**
- "North China (port unspecified)": 1 discharge
- Various vague Med ports ("Spanish Mediterranean", "East Coast Greece") → some caught by isVagueRegion (COAST_RX), some not
- Estimate: ~3-5 discharge ports in centroid path

**Affected vessel open positions:**
- Sea names (Aegean, Red Sea, Adriatic, Marmara Sea): **20/83 vessels** → `isVagueRegion=true` → null ballast distance (already null, NOT a wrong haversine)
- "Continent" / "ARA" centroid: likely 2-4 vessels → wrong ballast distance haversine

**Board impact:**

Routes most affected by distance underestimation:
1. **Egypt Mediterranean → Douala/Conakry**: ~5 load port × 5 Douala/Conakry discharge = up to 25 pairs. On the board ~5-10 matches. Centroid haversine: 1992nm vs real ~5800nm (−66%). At 12kn, voyage days delta: ~13 days short → TCE error of ~$150-200k+ on a Handysize.
2. **Any port → North China (centroid)**: 1 pair affected.
3. **North Brazil → anywhere**: 1 cargo, but if it reaches board, centroid error is severe (−39%).

**Conservative estimate: 5-15 matches on the demo board (10-30% of board) use centroid haversine for laden distance, producing TCE errors ranging from −34% (ballast leg) to −66% (laden Egypt Med → W.Africa).**  
High-impact routes: Med/Black-Sea load to West Africa discharge, and Far East discharge from Black Sea via vague shipper shorthand.

---

## DESIGN OPTIONS

### Option A: Pass centroid coords through Tier 3 (searoute-ts)

**Change:** In `centroidFallbackDistance()`, instead of calling `haversineDistanceNm` directly, call `computeSearouteCached(centroidCoords, portCoords)` from Tier 3.

**Tradeoff:**
- ✅ Canal-aware (searoute-ts routes via Eurostat maritime network)
- ✅ Single-function fix; all three write paths benefit
- ✅ Already-installed library; no new dependency
- ⚠️ Centroid coords may land on shallow water or inaccessible coastline → routing failure → null (falls back to haversine or returns null, both are worse). Risk: "Egypt Mediterranean" centroid is at Damietta area (31.2°N, 29.9°E) — likely OK; "North Brazil" (-2.6°N, -44.4°E) near Itaqui — likely OK.
- ⚠️ Performance: live routing is slower (~10-50ms per pair vs haversine ε). Cached after first call.

**Verdict:** Most practical fix. Marginal risk of routing failure on obscure centroid coords (mitigated by haversine fallback inside centroidFallbackDistance already).

### Option B: Waypoint corridors (route-specific detour multiplication)

**Change:** Detect canal transits for centroid pairs using the same basin classification from `tce-calculator.ts:_classifyPortBasin`. Add detour multipliers:
- Black Sea / Med → East of Suez: × (gc + 1800nm Bosphorus+Suez)
- West Med → West Africa: + 800nm (Gibraltar detour)

**Tradeoff:**
- ✅ No new dependency, predictable
- ✅ Fast (arithmetic only)
- ⚠️ Requires maintaining corridor table; won't cover every edge case
- ⚠️ Multipliers are estimates, not exact sea distances → still `exact:false`

**Verdict:** Good interim fix if Tier 3 proves unreliable for centroid coords. Lower accuracy than Option A.

### Option C: Expand Tier 2 JSON coverage for common vague regions

**Change:** Pre-compute searoute distances from each `regionCentroid` to all `KNOWN_PORTS` and add them to `searoute-pairs.json` under synthetic keys (e.g. `"Egypt Med Centroid|Douala"`). Then handle centroid-to-port lookup via normalized key.

**Tradeoff:**
- ✅ Fastest at runtime (JSON lookup)
- ⚠️ Most complex: requires centroid key naming scheme, larger JSON, synchronization when centroids change
- ⚠️ Doesn't handle centroid-to-centroid pairs (North Brazil → North China)

**Verdict:** Over-engineered for this scope. Option A is better.

---

## RECOMMENDED FIX PATH

1. **Fix**: In `centroidFallbackDistance()` (`lib/sailing/port-distances.ts:1439`), after resolving centroid coords, try `computeSearouteCached(ca, cb)` (same as Tier 3) and only fall through to haversine if it fails.
2. **Regen**: Run `npx tsx scripts/demo-seed/regenerate-matches.ts` to repopulate `distance_nm` and `tce_usd_per_day` in seed matches (Path 1).
3. **Tests**: Add behavioral test for "Egypt Mediterranean → Douala" (centroid route) verifying `nm > 4000` and `exact = false`. Verify Black Sea → Far East centroid paths use realistic distances.
4. **Note**: Session matches (Paths 2/3) auto-correct on next session trigger; seed bucket requires explicit regen.

---

## FILES CITED

| File | Role |
|------|------|
| `lib/sailing/port-distances.ts:1396` | `getPortDistance()` — main entry point |
| `lib/sailing/port-distances.ts:1439` | `centroidFallbackDistance()` — **the bug** |
| `lib/sailing/port-distances.ts:1452` | `computeDirectDistance()` — T1/T2/T3/T4 waterfall |
| `lib/sailing/searoute-client.ts` | Tier 3 live searoute-ts wrapper |
| `lib/sailing/region-centroids.ts:60` | "Black Sea" centroid (44.0°N, 34.0°E) |
| `lib/sailing/vague-region-detector.ts:30` | SEA_NAMES list |
| `lib/matching/tce-calculator.ts:155` | Basin classification + canal transit detection |
| `lib/economics/canals/index.ts` | Canal dues dispatcher |
| `lib/economics/canals/db.ts` | canal.db accessor (tariffs only) |
| `data/distances/searoute-pairs.json` | 105 011-pair sea-route distance table |
| `data/canal.db` | 22 tariff rows (Suez/Panama/Kiel/Bosphorus) |
| `scripts/demo-seed/regenerate-matches.ts:748` | Regen write path (distance_nm) |
| `lib/matching/compute-matches.ts:95` | Live compute write path |
| `lib/matching/persist-session-matches.ts:72` | Session persist write path |
| `lib/matching/stored-match-economics.ts:102,121` | Ballast distance economics |
