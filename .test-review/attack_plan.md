# Attack Plan — c1-bunker-patch (PR #901)

## Classification Table

| File | Class | Severity | Technique |
|------|-------|----------|-----------|
| `app/api/matches/[id]/route.ts` (PATCH bunker fetch) | route handler / data fetch | HIGH | code review + test execution |
| `__tests__/api/matches-id-freight-bunker.test.ts` | regression test | N/A | test quality review |

## Key Questions

1. Is the bunker price fetch inside or outside the 404 check?
   → AFTER 404 check (lines 181-198 in route.ts). Correct order.

2. Race condition between price fetch and economics computation?
   → No race — SQLite operations are synchronous; `getLatestBunkerPrice` is synchronous.

3. What if `getLatestBunkerPrice` throws a non-table-missing exception?
   → Catch is broad (`catch { bunkerPriceUsdPerMt = undefined; }`). Any error silently falls back
   to the default. This includes bugs in the query — potentially too broad.

4. What if `bunkerPriceUsdPerMt` is `undefined`?
   → `computeStoredMatchEconomics` has `bunkerPriceUsdPerMt?: number` — undefined is fine.
   `buildMatchEconomics` passes it to `computeEstimatedTce` which defaults to 600.

5. Does the test's `jest.mock` affect other suites?
   → Jest isolates mocks per module scope; `jest.mock` is hoisted but scoped to the test file.
   No cross-suite contamination expected.

6. Does the test cover non-existent match (404)?
   → No. But this is covered by existing `route.test.ts` (PI2-missing test).

7. `reset_freight_rate: true` AND `freight_rate_usd_per_mt` both in body — which wins?
   → `reset_freight_rate` check comes first (line 204) and returns early. Manual rate is ignored.
   This behavior is unchanged from pre-PR code.

## Identified Attack Vectors

- **A1:** Verify bunker fetch placement relative to 404 check (code review)
- **A2:** Run tests — existing suite + new suite
- **A3:** TypeScript check
- **A4:** Broad catch analysis — what errors does `getLatestBunkerPrice` throw?
- **A5:** reset_freight_rate + freight_rate_usd_per_mt conflict
- **A6:** `bunkerPriceUsdPerMt = 0` — does zero propagate to free bunkers?
