# test-skill Findings — claude/tce-list-detail-unify (#819)

## HIGH findings (gate-relevant)

### BUG-1: bunkerPriceUsdPerMt=0 always sent when user has no manual price

**Severity:** HIGH — introduced by this PR (Task 5)
**File:** `components/match/EconomicsTab.tsx`
**Root cause:** `buildCanonicalTceInputs` always gets `bunkerPriceUsdPerMt: 0` when user hasn't entered a price. The VoyageInput result always has `bunkerPriceUsdPerMt: 0`. The POST body includes `"bunkerPriceUsdPerMt": 0`. API: `typeof 0 === 'number'` → TRUE → uses $0 as manual bunker price → bunker cost = $0 → inflated TCE.

**Test:** `__tests__/regression/economics-tab-bunker-price-zero.test.tsx` — FAILS (bunkerPriceUsdPerMt is 0 in body)

**Fix:** Override `bunkerPriceUsdPerMt` in the spread after buildCanonicalTceInputs:
```typescript
...(bunkerPriceUsdPerMt !== '' ? { bunkerPriceUsdPerMt: Number(bunkerPriceUsdPerMt) } : {}),
```
(restore old conditional spread for this specific field)

---

## MEDIUM findings (informational)

### BUG-2: compareInputs.cargo.freightRateUsdPerMt=0 when no rate available
**Severity:** MEDIUM — UX regression. Old: `?? 28`, New: `?? 0`. Route comparison modal shows all-loss with $0 freight revenue when no rate available. Fix: gate compareInputs.ready on freightRateUsdPerMt > 0.

---

## Pre-existing Issues (not introduced by this PR)
None.

## Coverage Summary
- buildCanonicalTceInputs adversarial: 10 tests PASS
- distanceFactor 0.7→1.0: existing tests cover
- session-buckets B(c): dead-code traced, no regression
- regenerate-matches INSERT: column count verified (25 cols, 25 values)
- EconomicsTab bunker price: BUG-1 HIGH FAIL
