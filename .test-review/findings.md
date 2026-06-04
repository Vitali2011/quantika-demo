# Findings — fix-econ-a-bunker (PR #822)

## Summary
4/4 adversarial attacks passed. 1 edge-case finding (MEDIUM, not blocking).

---

## Findings (gate-relevant)

### FINDING-1: bunkerPort not reset to null when recommendation returns fallback after a previous successful recommendation

**Severity:** MEDIUM  
**Class:** React state machine  
**Introduced by this PR:** Partially (see below)

**Reproduce:**
1. Render `<EconomicsTab cargo={MED_CARGO} .../>` — recommendation fires → bunkerPort='GIGIB'
2. Re-render same instance with `cargo={PACIFIC_CARGO}` — recommendation fires fallback (no on-route hubs)
3. `bunkerPort` stays 'GIGIB' (not null) — P&L fires with GIGIB bunker price for a Pacific route

**Why partially introduced:**
- Pre-PR: SGSIN persisted on fallback (wrong for all non-SGSIN routes)
- Post-PR: Previous recommendation port persists (wrong if route changed)
- First-render fix is correct (null → wait for recommendation = IMPROVEMENT)
- Edge case only reproducible when component stays mounted across cargo changes

**Blocking?** NO — first-render behavior is correct. Multi-cargo stale port is an edge
case that requires stateful component mounting (rare in the current app's page-based navigation).

**Suggested follow-up:** In the recommendation effect, when `data.fallback` is true
AND `bunkerPortManual` is false, also call `setBunkerPort(null)` to reset the port.

```typescript
if (data.fallback) {
  setBunkerFallback(data.message);
  setBunkerReco(null);
  setBunkerCandidates([]);
  setBunkerRecommendedSplit(null);
  setBunkerLift(null);
  if (!bunkerPortManual) setBunkerPort(null); // ← add this
}
```

---

## Attacks Run (Phase 3)

| Attack | Result | Notes |
|--------|--------|-------|
| bunkerPort absent → 400 | PASS | Covered in tce-missing-bunker-port |
| bunkerPort='' → 400 (Zod) | PASS | Zod regex rejects before custom guard |
| bunkerPort='sgsin' (lower) → 200 | PASS | toUpperCase() normalises |
| bunkerPort='XXXXX' → 422 | PASS | No DB row → 422 |
| bunkerPriceUsdPerMt=0 → 200, finite TCE | PASS | Manual bypasses bunkerPort |
| bunkerPriceUsdPerMt=-500 → 200, finite TCE | PASS | No crash, no Infinity |
| Infinity serializes to null → 400 | PASS | Zod rejects |
| Manual port selection prevents reco override | PASS | bunkerPortManual=true blocks override |
| A1 stale price → console.warn | PASS | |
| A1 fresh price → no warn | PASS | |

---

## Pre-existing Issues (informational, do not affect gate)

None identified. The multi-cargo stale port issue is partially pre-existing (SGSIN was
always wrong for non-Singapore routes; now "previous port" is wrong for route changes).

---

## Browser E2E Gate

UI changed (EconomicsTab.tsx is a `.tsx` file). Browser E2E gate activated but dev server
not running in this environment. Manual verification of the A3 matrix (per plan) is required
before prod deploy:

> A3 matrix: Marmara→Veracruz → bunker default = GIGIB/ESCEU, NOT Singapore.
> To verify: open `/match/43604` Economics tab after deploy.
