# Searoute integration — design doc

**Date:** 2026-05-19
**Status:** approved, ready for implementation plan
**Goal:** Replace systematic haversine errors (40-60% under for canal-required routes) with real sea routing, expanding coverage from ~90 hand-curated ports to ~500 commercial ports + on-the-fly fallback for any port with coordinates.

## Background

`lib/sailing/port-distances.ts` (1244 lines) currently has a 3-tier distance resolution:

1. Hand-curated matrix (~500 pairs) → `exact: true`
2. Haversine great-circle from port-master.json coords → `exact: false`
3. `null` (port not found or no coords)

A code comment at line 1196 acknowledges haversine is "SYSTEMATICALLY WRONG (40-60% under)" for corridors requiring mandatory canal transits:

- Med ↔ Black Sea (Bosphorus/Dardanelles)
- Red Sea ↔ Med (Suez Canal)
- Atlantic ↔ Med (Gibraltar)
- Adriatic ↔ Aegean ↔ Black Sea

These are exactly the routes that matter for the dry-bulk freight scenarios in the demo. Every match scored against a wrong distance produces a wrong TCE estimate, which propagates into the ROI tile and `/matches` ranking.

## Goal

Replace haversine with **searoute** (real port-to-port maritime routing via canals/straits) as the primary fallback for any port pair where the hand-curated matrix has no entry.

## Architecture

Five-tier resolution after this change:

```
1. Hand-curated matrix (DISTANCES_NM)        → exact: true   (unchanged)
2. Pre-populated searoute JSON (~500 ports)  → exact: true   (NEW)
3. On-the-fly searoute-ts (Node.js)          → exact: true   (NEW)
4. Haversine                                 → exact: false  (last resort only)
5. null                                      → coords missing
```

Tiers 1, 4, 5 unchanged. Tiers 2 and 3 are new.

## Component 1 — Pre-populate script

`scripts/seed-distances.py` — one-time Python script run on dev-vps.

### Inputs

- `data/ports/port-master.json` — 11,767 UN/LOCODE ports with lat/lon
- Existing `DISTANCES_NM` from `lib/sailing/port-distances.ts` (regex-extracted for regression check)

### Logic

1. Load port-master.json, filter to top-500 commercial ports:
   - UN/LOCODE function code contains `1` (Port)
   - Exclude inland-only codes (e.g., function code `B` = Border crossing)
2. For each pair `(A, B)` where `A < B` (deduplicate):
   - `searoute.searoute(A.coords, B.coords, units="nm")` → distance in NM
   - Skip if searoute returns no route (inland, military, fishing-only)
3. Regression check vs existing `DISTANCES_NM`:
   - Pairs in both → compare
   - Diff ≤5% → silent OK
   - 5-10% → INFO log
   - 10-25% → WARNING (keep, log loudly)
   - > 25% → ERROR, script aborts (human review required)
4. Write result to `data/distances/searoute-pairs.json`
5. Print 10-pair spot-check table for human eyeball verification

### Output

- `data/distances/searoute-pairs.json` — ~125,000 pairs × ~30 bytes ≈ **3.5 MB**
- Format: `{ "Antwerp|Rotterdam": 172, ... }` (canonical sorted-pair key with `|` separator, matching existing `DISTANCES_NM` convention)
- Summary printed: `added=N, mismatches=M, skipped=K`

### Run

```bash
ssh root@dev-vps 'cd /root/work/quantika-demo && pip install searoute && python scripts/seed-distances.py'
```

ETA: ~10-15 minutes one-time.

### Acceptance

- Script exits 0 on success
- Zero errors >25% diff (or human-reviewed exceptions documented in commit message)
- JSON file is valid (loadable)
- Spot-check table shows ≤5% diff vs sea-distances.org for 10 reference routes

## Component 2 — On-the-fly fallback

Modification to `lib/sailing/port-distances.ts`.

### Code change

Inside `getPortDistance()`, between the JSON lookup (new tier 2) and the haversine fallback (existing tier 4):

```typescript
// Tier 3: live searoute via Node.js
const pa = getPortMaster(a);
const pb = getPortMaster(b);
if (pa?.lat != null && pb?.lat != null) {
  const cached = searouteCache.get(`${a}|${b}`);
  if (cached !== undefined) return cached;
  try {
    const route = computeSearoute(pa, pb); // searoute-ts call
    if (route) {
      const result = { nm: route.nm, exact: true };
      searouteCache.set(`${a}|${b}`, result);
      return result;
    }
  } catch {
    /* fall through to haversine */
  }
}
```

### Cache

LRU cache, ~10,000 entries, in-memory per server instance. Cache miss = ~30-50ms (searoute compute). Cache hit = <1ms.

### Dependency

`searoute-ts` npm package (~3 MB). Bundle impact: routes using `getPortDistance` may need to opt into `runtime = 'nodejs'` (not Edge) if the library uses Node-only APIs. To be confirmed during implementation.

### Feature flags

- `DISTANCE_USE_SEAROUTE_JSON` (default `true`) — toggle tier 2
- `DISTANCE_USE_SEAROUTE_LIVE` (default `true`) — toggle tier 3

Both flags read at module load. Setting either to `false` cleanly skips that tier — system falls back to old behavior (matrix + haversine).

## Validation strategy

### Level 1 — automated regression (in script)

Built into `seed-distances.py` step 3. Catches systematic errors (e.g., searoute mistakes Suez for Cape route) before any JSON is written.

### Level 2 — human spot-check (pre-commit)

Script prints 10 reference routes:

```
Rotterdam  → Novorossiysk:  searoute=4180  sea-distances.org≈4150  ✓ (1% diff)
Hamburg    → Singapore:     searoute=9870  sea-distances.org≈9850  ✓ (0.2%)
NewOrleans → Santos:        searoute=5640  sea-distances.org≈5680  ✓ (0.7%)
```

Founder eyeballs against https://sea-distances.org. If all ≤5% diff → commit JSON.

### Level 3 — unit tests (for tier 3 on-the-fly)

`__tests__/port-distances-searoute.test.ts`:

- 5-10 known pairs return expected values within ±5% tolerance
- Cache hits return <5ms (timing-based or call-count-based)
- Inland port (e.g., Moscow) returns `null` or falls through to haversine
- Edge-runtime compatibility check if applicable

## Rollback

Both new tiers are env-flag isolated:

- `DISTANCE_USE_SEAROUTE_JSON=false` → skip tier 2
- `DISTANCE_USE_SEAROUTE_LIVE=false` → skip tier 3

System reverts to current behavior. No DB migrations, no data cleanup required. JSON file remains in repo but unused.

## Performance impact

- Tier 2 (JSON Map lookup): <1ms — negligible
- Tier 3 (searoute compute, cold cache): 30-50ms per pair, ~10,000 pairs cached in-memory after warm-up
- `/matches` cold render: +1-2s on first request after server restart (warming cache for ~30 vessel-cargo pairs)
- `/matches` warm render: no perceptible change

Bundle size: +3MB (searoute-ts). Affects only routes that call `getPortDistance` — Next.js code-splits per-route, so the homepage and unrelated routes are not affected.

## Out of scope

- Replacing the existing hand-curated `DISTANCES_NM` matrix (kept as authoritative for pairs with known BIMCO numbers — tier 1 wins)
- Extending to port-master.json beyond top-500 (long tail covered by tier 3 on-the-fly)
- Real-time canal-status awareness (Suez closure, ice routes) — out of scope, advisory data only
- Distance unit changes (stays nautical miles throughout)
- Touching `/matches` or TCE math — they consume `getPortDistance()` unchanged

## Files touched

| File                                        | Change                                               |
| ------------------------------------------- | ---------------------------------------------------- |
| `scripts/seed-distances.py`                 | NEW — pre-populate script                            |
| `data/distances/searoute-pairs.json`        | NEW — 3.5 MB generated artifact                      |
| `lib/sailing/port-distances.ts`             | +30 lines: JSON load + tier-3 hook + flags           |
| `lib/sailing/searoute-client.ts`            | NEW — thin wrapper around searoute-ts with LRU cache |
| `__tests__/port-distances-searoute.test.ts` | NEW — unit tests for tier 3                          |
| `package.json`                              | +1 dep: `searoute-ts`                                |
| `.env.local.example`                        | +2 flags                                             |

7 files. Tier M task per Plan-then-Dispatch (will go through dev-pipeline-deep).

## Open questions for implementation phase

1. Confirm `searoute-ts` npm package exists and supports Node.js 20. If not — fall back to spawning Python subprocess (slower, ~200ms per call, only viable for tier 2 pre-populate; tier 3 would be dropped).
2. Confirm Edge-runtime compatibility. If incompatible — routes using `getPortDistance` need `export const runtime = 'nodejs'`.
3. Decide whether to ship tier 2 (JSON) and tier 3 (live) in one PR or split into two PRs.

These get resolved in the writing-plans phase, not now.
