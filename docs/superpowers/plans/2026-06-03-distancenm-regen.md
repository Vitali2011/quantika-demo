# Plan — distanceNm for regen matches (T1)

**Tier:** M · risk-override (matching/normalizer) → mandatory `/test-skill` · creative=no.
**Branch:** off origin/main (`9cfca018`).

## Gate 0 — TRACE
- **Target:** `distance_nm` stored per match in regen.
- **Consumers (3):** bunker basin-filter (`/api/voyage/bunker-recommendation` — round-4 noted "match без distanceNm пускает мировые хабы"), ballast scoring (`lib/sailing/fit-breakdown.ts scoreBallast` — null distance → "unknown" conservative), Voyage P&L distance.
- **Entry:** seed (`scripts/demo-seed/real-matches.ts` L251 computes via `getPortDistance` from `lib/sailing/port-distances.ts`, stores `distance_nm` L302/383).
- **Real failure data (probe):** board fit≥60 = 226 matches, **15 have NULL distance_nm**. Root: `getPortDistance`/`port-distances` uses its OWN port lookup (normalizePortName) that did NOT receive the #4 diacritic-fold + vague-resolution — so Constanța/vague ports resolve in `resolvePort` (P&L) but NOT in the distance path → no distance stored.
- **Parity:** n/a (no artifact column change; regen re-runs).

## Scope
Wire the same resolution the #4 fixes added (diacritic fold + `resolveVaguePort` representative) into the DISTANCE lookup path so the 15 null-distance board matches get a sea distance:
- Option A (preferred): in `real-matches.ts`, before `getPortDistance(origin, dest)`, resolve each port via `resolvePort` (now fold+ports) → use canonical name; if still unresolved, `resolveVaguePort` → representative port name → `getPortDistance` on that. Store distance_nm from the representative (approximate — acceptable, like P&L).
- Option B: add diacritic-fold to `port-distances.ts normalizePortName` directly (helps ALL distance consumers). Verify no collision regressions.
- Choose the lower-blast option; if touching `port-distances.ts` (shared), grep + keep `lib/sailing/__tests__/port-distances*.test.ts` green.

## Acceptance (REAL DATA — orchestrator verifies after, not unit-only)
- After regen on demo-seed.db: board (fit≥60) NULL distance_nm **15 → ~0** (residual only genuine-unknown TBS/Port-of-Call).
- main board stays 28; existing port-distances tests green; full jest green (ignore governance path-artifact).
- `/test-skill` cold QA PASS.

## Out-of-scope
- Do NOT regen prod (orchestrator does prod-apply). Do NOT touch P&L/economics. Do NOT widen `resolvePort` semantics.

## If stuck → QUESTIONS.md + state.md + stop.
