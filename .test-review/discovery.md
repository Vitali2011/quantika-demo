# Discovery — fix-econ-a-bunker (PR #822)

## Commits
- ec9dcf12 fix(economics): remove SGSIN default — gate P&L on bunker-rec response (#820)
- 8dbd3973 docs(plan): econ-cluster fix plan (plan doc only)

## Changed Source Files (3)
1. `app/api/voyage/bunker-recommendation/route.ts` — A1: freshness watchdog (log-only)
2. `app/api/voyage/tce/route.ts` — A2.2: 400 on missing bunkerPort (removes SGSIN ?? default)
3. `components/match/EconomicsTab.tsx` — A2.1: useState null + gate voyageInputData on bunkerPort != null

## Key Behavior Changes
- `tce/route.ts`: `(data.bunkerPort ?? 'SGSIN').toUpperCase()` → explicit 400 when bunkerPort absent
- `EconomicsTab`: initial bunkerPort=null; P&L call gated; port set from recommendation response
- `bunker-recommendation`: stale price warning (read-only, log-only)

## New Tests Added
- `bunker-freshness-watchdog.test.ts` — A1 stale/fresh price logging (PI2 route handler)
- `tce-missing-bunker-port.test.ts` — A2.2 400/200/422 value shapes
- `EconomicsTab-bunker-null.test.tsx` — A2.1 RTL: GIGIB not SGSIN, fallback gates P&L

## Modified Tests (setup, not assertions)
- `EconomicsTab-pnl.test.tsx` — added bunker-recommendation mock to setupFetch
- `EconomicsTab-cons-clamp.test.tsx` — changed fallback mock → valid port mock
- `tce-auto-bunker.test.ts` — 1 assertion change: SGSIN default test → 400 required

## What Existing Tests Cover
- Basin filter, eff-split, candidates, consumption/DWT clamp, reco adversarial
- TCE backward-compat, EUA auto-derive, ETS auto-derive
- EconomicsTab: bunker-hint, bunker-route-aware, EUA, war-risk, compare-inputs, P&L
