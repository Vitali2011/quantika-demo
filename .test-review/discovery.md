# Phase 1 — Discovery (2026-06-09, Round 2)

## Context
Round 2 cold QA. Round 1 (2026-06-08) found M1/M2/L1 as MEDIUM/LOW gate-relevant issues and H1 as PRE-EXISTING HIGH.
PRs merged after Round 1:
- #877: fix(waterfall): M1 duration float→1dp, M2 TCE-basis reconcile, L1 negative-zero guard
- #878: fix(fit): recompute economics component from live TCE after computeStoredMatchEconomics (H1)

## Commits in scope (main as of 2026-06-09 tip = 24fb6917)
- 24fb6917 fix(fit): recompute economics component from live TCE after computeStoredMatchEconomics (H1) (#878)
- 967ad0a1 fix(waterfall): M1 duration float→1dp, M2 TCE-basis reconcile, L1 negative-zero guard (#877)
- e2cacec8 feat(w6a): surface economics provenance — DA confidence badge, Baltic-TC staleness, canal tag rename, war-risk rate date (I7/I12) (#876)
- c17b7af9 feat(w6b): surface CII llm-fallback disclosure, PSC/charterers demo banners (#875)
- b548d034 feat(counts): canonical match-count + ROI window + effectiveScore shared util (W8, closes I10, I11) (#873)

## Files changed by #877 + #878 (primary targets)
- components/economics/CalculationWaterfall.tsx (M1/M2/L1)
- lib/matching/persist-session-matches.ts (H1: recompute after computeStoredMatchEconomics)
- __tests__/economics/persist-session-matches-fit-recompute.test.ts (H1 regression test)
- components/economics/CalculationWaterfall.test.tsx (M1/M2/L1 regression tests)

## UI files changed (latest waves) → Browser E2E Gate ACTIVE
- components/economics/CalculationWaterfall.tsx
- lib/matching/persist-session-matches.ts (affects Passport tab TCE display)

## Verification targets
1. H1: Passport tab economics $ == live TCE displayed on match card; fit% not inflated for below-breakeven
2. M1: CalculationWaterfall duration_days shown as "X.X дней" (1dp), not raw float
3. M2: war-risk line in waterfall reconciles: total_tce = base_tce - war_risk/days
4. L1: No "$-0" anywhere in economics display
5. Fresh sweep: /matches list, cards, filter, /match/[id] tabs, dashboard counts, vetting badges
