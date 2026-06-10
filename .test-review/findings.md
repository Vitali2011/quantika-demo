# test-skill Findings — c1-bunker-patch (PR #901)

## HIGH findings (gate-relevant)

None found.

---

## MEDIUM findings

None found.

---

## LOW findings

### LOW-1: Broad catch on `getLatestBunkerPrice` swallows non-table errors

**Severity:** LOW (pre-existing pattern; silently degrades to constant; no data loss)
**File:** `app/api/matches/[id]/route.ts` lines 194-198
**Root cause:** The catch block catches ALL exceptions, not just "no such table". If `getLatestBunkerPrice` has a code bug (e.g. SQL syntax error), the error is swallowed and the default 600 is used silently. This makes latent bugs harder to diagnose.
**Pre-existing?** The same pattern is used for `getLatestEuaPrice` in `stored-match-economics.ts` (line 133-138). So this is consistent with established codebase pattern.
**Impact:** On malformed DB or migration regression, TCE will silently use stale default rather than surfacing an error. No user-facing data corruption.
**Recommendation:** Follow-up only. Consider a specific table-existence check or at minimum a console.warn.

### LOW-2: `bunkerPriceUsdPerMt = 0` from DB passes through to calculations

**Severity:** LOW (pathological DB data; not a code bug)
**Root cause:** `getLatestBunkerPrice` returns a row with `price_usd_per_mt = 0` (if such a row is inserted). The `!= null` check on line 333 of `tce-calculator.ts` passes `0` through, overriding the 600 default. Result: TCE computed with $0 bunker fuel → inflated TCE.
**Pre-existing?** YES — this issue exists on `main` in `tce-calculator.ts` (same guard). This PR doesn't introduce it; it merely exposes it because the live price is now actually fetched.
**Impact:** Only exploitable via manually inserting a `0` price row into the DB. Normal seeding/upsert paths would never produce `0`. The `upsertBunkerPrice` function in `bunker-repository.ts` has no guard against this, but this is an operational concern, not a code defect.
**Recommendation:** Follow-up: add `|| price_usd_per_mt <= 0` guard to the fetch result or `!== 0` check in the consumer.

---

## Pre-existing Issues (not introduced by this PR)

- `bunkerPriceUsdPerMt = 0` passthrough in `tce-calculator.ts` (LOW-2 above; present on main)
- Broad catch pattern for EUA price fetch in `stored-match-economics.ts`

---

## Attack Execution Results

**Attack 1 (bunker fetch location):** PASS — fetch is AFTER 404 check (line 183 guard, then line 193 fetch). Correct.

**Attack 2 (test run):**
- `__tests__/api/matches-id-freight-bunker.test.ts`: 2/2 PASS
- `app/api/matches/[id]/__tests__/route.test.ts`: 16/16 PASS  
- Full `__tests__/api/` suite: 761/763 PASS (2 skipped), 0 failures

**Attack 3 (TypeScript):** OOM during full tsc check (large codebase, 2GB limit hit). Partial run shows no errors in changed files. Not attributable to this PR.

**Attack 4 (catch too broad):** LOW-1 above. Pre-existing pattern in the codebase.

**Attack 5 (reset + manual conflict):** PASS — `reset_freight_rate: true` is checked first (line 204) and returns early. Manual rate is silently ignored. Behavior is unchanged from pre-PR. No test covers this explicitly but it's the documented behavior.

**Attack 6 (`bunkerPriceUsdPerMt = 0`):** LOW-2 above. Pre-existing issue, not introduced by this PR.
