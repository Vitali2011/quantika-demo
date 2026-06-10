# Discovery — c1-bunker-patch (PR #901)

## Commits on branch (above main)

```
66c78246 fix(c1-bunker-patch): fetch live NLRTM/VLSFO price in PATCH handler, pass to both computeStoredMatchEconomics calls
ba0223b6 test(c1-bunker-patch): RED — PATCH freight paths must use live bunker price
```

## Changed Source Files

1. `app/api/matches/[id]/route.ts` — PATCH handler; adds bunker price fetch + passes to `computeStoredMatchEconomics`
2. `__tests__/api/matches-id-freight-bunker.test.ts` — new regression test (115 lines), TDD red-first

## Key Behavior Changes

**Before:** `computeStoredMatchEconomics` called WITHOUT `bunkerPriceUsdPerMt`; always used `DEFAULT_BUNKER_USD_PER_MT = 600`.

**After:**
- `getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')` is called after the 404 guard, wrapped in try/catch.
- Result passed as `bunkerPriceUsdPerMt` to both `reset_freight_rate` and `freight_rate_usd_per_mt` paths.
- On error (e.g. missing table), falls through to `undefined`, which triggers the `DEFAULT_BUNKER_USD_PER_MT = 600` fallback inside `computeStoredMatchEconomics`.

## New Test Structure

`__tests__/api/matches-id-freight-bunker.test.ts`:
- Mocks `computeStoredMatchEconomics` to spy on call arguments
- Seeds `bunker_prices` row: NLRTM/VLSFO = 791 USD/mt
- Two behavioral tests: `freight_rate_usd_per_mt` path + `reset_freight_rate` path
- Both assert `bunkerPriceUsdPerMt: 791` is passed through
