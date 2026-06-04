# Attack Plan — fix-econ-a-bunker

## Classification Table

| File | Class | Severity | Technique |
|------|-------|----------|-----------|
| `tce/route.ts` (bunkerPort guard) | validator/route-handler | HIGH | contract test + adversarial value shapes |
| `EconomicsTab.tsx` (null state + gate) | React state machine | HIGH | RTL behavioral (already tested) + edge cases |
| `bunker-recommendation/route.ts` (A1 stale log) | log/monitoring | LOW | unit (already tested) |

## Ordered Attack List (HIGH first)

### A — tce/route.ts bunkerPort guard
1. `bunkerPort` absent + no manual price → 400 bunker_port_required [COVERED by tce-missing-bunker-port]
2. `bunkerPort` = '' → Zod rejects first (400 validation error)
3. `bunkerPort` = 'sgsin' (lower) → 200, SGSIN price used [COVERED]
4. `bunkerPort` = 'XXXXX' → 422 [COVERED]
5. `bunkerPriceUsdPerMt: 0` (manual zero) → bypasses bunkerPort check, calculates with 0 bunker [NOT TESTED]
6. `bunkerPriceUsdPerMt: -500` (negative) → bypasses check, calculates with -500 [NOT TESTED]
7. `bunkerPriceUsdPerMt` present + bunkerPort absent → manual path, 200 [COVERED]

### B — EconomicsTab state machine
8. recommendation returns port → bunkerPort set → P&L fires with that port NOT 'SGSIN' [COVERED]
9. recommendation returns fallback (port=null) → bunkerPort stays null → P&L gated [COVERED]
10. route change (cargo changes while mounted, bunkerPortManual=false) → stale port from previous route
    — **NOT COVERED** — potential regression where fallback doesn't reset bunkerPort to null
11. user manually sets port BEFORE recommendation arrives → bunkerPortManual=true → recommendation doesn't override [NOT TESTED DIRECTLY]
12. `voyageInputData.input` contains bunkerPort when ready=true → confirm it's non-null string [implicit in RTL test]

### C — A1 freshness watchdog  
13. Stale price → console.warn [COVERED]
14. Fresh price → no warn [COVERED]
15. Port with no price row → skipped (not stale-checked) — implicit in existing tests

## Uncovered Attack Scenarios (to execute in Phase 3)
- Attack 5: `bunkerPriceUsdPerMt: 0` — API behaviour
- Attack 6: `bunkerPriceUsdPerMt: -500` — API behaviour (negative price)
- Attack 10: component re-render with new cargo after fallback — bunkerPort not reset
- Attack 11: manual port selection prevents recommendation override

## Attack 10 Analysis: bunkerPort NOT reset on fallback (post-first-render)

When the component is mounted with one route (→ recommendation sets 'GIGIB'),
then cargo changes to a route with no on-route hub (recommendation returns fallback),
the `bunkerPort` state stays 'GIGIB' (not reset to null).

This means: P&L fires with GIGIB bunker price even for a route where GIGIB is wrong.

**Severity:** MEDIUM (only affects multi-cargo UX flows where component stays mounted)

**In practice:** EconomicsTab is likely unmounted/remounted per match-route change
(Next.js page navigation). BUT if the component is kept mounted across cargo changes
(e.g. in a carousel or comparison view), this bug manifests.

**Is it introduced by this PR?** PARTIALLY:
- Pre-PR: SGSIN was always the default; on fallback, SGSIN stayed → wrong for Med routes
- Post-PR: Previous recommendation port persists on fallback → also wrong but in a different direction
- The "null → loading" state eliminates the wrong-SGSIN case for first render (IMPROVEMENT)
- But the "stale non-null port on fallback" is a new edge case that didn't apply before

**Verdict contribution:** APPROVE-WITH-FOLLOWUPS (not BLOCK — first-render case fixed, 
multi-cargo stale port is edge case only reproducible in stateful navigation)
