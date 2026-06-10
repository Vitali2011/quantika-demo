# test-skill Verdict — c1-bunker-patch (PR #901)

**Verdict: APPROVE**

## Summary

PR #901 is a narrow, well-targeted fix: the PATCH handler for `app/api/matches/[id]/route.ts` now fetches the live NLRTM/VLSFO bunker price and passes it to both `computeStoredMatchEconomics` calls. This closes a TCE inconsistency where list view (via `persist-session-matches`) used the live price but PATCH recomputation used the static 600 USD/mt fallback.

## What Was Tested

- `app/api/matches/[id]/route.ts` code reviewed line by line
- `lib/market/bunker-repository.ts` — no errors other than table-missing can realistically occur in normal operation
- `lib/matching/stored-match-economics.ts` — `bunkerPriceUsdPerMt: undefined` path correctly falls back to 600
- `lib/matching/tce-calculator.ts` — `0` passthrough issue confirmed pre-existing on main
- New test file quality: spy-based approach appropriate and sufficient
- 404 check ordering: confirmed correct (fetch after guard)
- Reset + manual conflict: no behavior change from pre-PR

## Test Run Results

```
__tests__/api/matches-id-freight-bunker.test.ts: 2/2 PASS
app/api/matches/[id]/__tests__/route.test.ts: 16/16 PASS
Full __tests__/api/ suite: 761 PASS, 2 skipped, 0 FAIL
```

## Findings

| ID | Severity | New? | Description |
|----|----------|------|-------------|
| LOW-1 | LOW | No (pre-existing pattern) | Broad catch on `getLatestBunkerPrice` swallows non-table errors |
| LOW-2 | LOW | No (pre-existing in main) | `bunkerPriceUsdPerMt = 0` would pass to calculator if DB has $0 row |

No HIGH or MEDIUM findings. Both LOW findings are pre-existing patterns, not introduced by this PR.

## Pre-existing Issues (not introduced by this PR)

- Zero-price passthrough in `tce-calculator.ts` (same on main)
- Broad catch pattern for EUA price consistent with codebase convention

## Follow-up Recommendations (non-blocking)

1. Consider a positive-value guard on the fetched bunker price: `?.price_usd_per_mt ?? undefined` should also filter `<= 0`
2. Consider narrowing the catch to handle specifically SQLite "no such table" errors rather than all errors
