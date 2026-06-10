# Phase 2 — Attack Surface (2026-06-09, Round 2)

## Scope
Verify Round 1 followups only (H1/M1/M2/L1). No new attack surface added.

## Classification Table

| Finding | Class | Target | Severity | Result |
|---------|-------|--------|----------|--------|
| H1: live TCE in fit component | normalizer/merger | patchEconomicsComponent() | HIGH | FIXED ✓ |
| M1: duration float→1dp | UI display | CalculationWaterfall:88,182 | MEDIUM | FIXED ✓ |
| M2: war-risk addback row | UI math | CalculationWaterfall:166-181 | MEDIUM | FIXED ✓ (code+tests; no HRA in demo) |
| L1: fmtUsd(-0)→$-0 | formatter | fmtUsd()→line 22 | LOW | FIXED ✓ |

## Attack Plan (executed)
1. Code review of diffs in #877 + #878 ✓
2. Regression test suite 140/140 ✓
3. Browser E2E: /matches list + 10 match detail pages + passport tabs ✓
4. API-level: /api/matches for fit%/TCE distribution check ✓
