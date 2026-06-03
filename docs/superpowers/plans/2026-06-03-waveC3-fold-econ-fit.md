# Wave C3 — Fold economics into fit: demote loss-making voyages (#783)

**Branch off `origin/main`** (now has C1 #796 + C2 #798 TCE fixes + C4 #797 gates). Tier **M**, **risk-override** (scoring/ranking path) → mandatory `/test-skill` real shapes. Independent of A2 (MatchesClient render). Part of the 2026-06-03 QA program. Depends on C1/C2 (folding a *broken* TCE = ranking by garbage — those are merged, so TCE is now sane).

## Goal
A voyage that **loses money** must not surface as a good (main-board) match. Today fit% is 9 non-economic factors and economics is computed display-only AFTER the realism partition — so a negative-TCE pair can still score 65% and sit on the main board (#783; C0 confirmed 9 negative-TCE + 5 absurd-high pairs live in mainMatches). Fold an **economic cap** into `computeFitBreakdown` mirroring the existing caps (late / under-util / uneconomic-ballast / EU-age) so the headline % itself reflects "this loses money," and the existing fit≥60 floor (#789, A2) then drops it off the main board into Review.

## Locked design (creative=n — mirror the existing `caps[]` pattern, do NOT re-architect)
`lib/sailing/fit-breakdown.ts` already has a `caps[]` array (~line 526) where a single killing factor lowers `fit` below the linear sum (`{reason, ceiling}`; caps only ever LOWER, never raise; the applied cap is recorded in `appliedCap` so the broker sees WHY). Add an **economic cap** there:

1. **Add optional input** `tceUsdPerDay?: number` to `FitBreakdownInput` (backwards-compatible — absent ⇒ no cap, conservative-on-missing exactly like every other unknown branch).
2. **Economic cap rule** (in `caps[]`):
   - `tceUsdPerDay != null && tceUsdPerDay < 0` → `{ reason: 'voyage loses money (TCE −$X/day) — uneconomic', ceiling: 40 }` (clearly off the main board, lands in Review).
   - Optional softer band for marginal-but-positive (e.g. `0 ≤ tce < ~3000`, below typical OPEX) → ceiling ~58 (just under the 60 floor). Keep conservative; if the spec/anchors disagree, prefer ONLY the `<0` hard cap and note the marginal band as a follow-up. Do NOT cap on missing/undefined TCE.
3. **Wire both callers to pass the TCE:**
   - `lib/matching/pair-analyzer.ts`: economics is currently computed AFTER the realism partition (only for mainMatches, ~line 725). To feed the cap, compute the per-pair TCE (or reuse `buildMatchEconomics`/`computeDailyTce` from `tce-calculator.ts`) **before** `computeFitBreakdown` (~line 671) and pass `tceUsdPerDay`. Keep the existing post-partition economics enrichment for the display `m.economics` object — just make the fit pass TCE-aware. Reuse one computation if practical; do not double-charge an LLM call (TCE is pure arithmetic, cheap).
   - `scripts/demo-seed/real-matches.ts`: it already computes TCE for the persisted `tce_usd_per_day` column — pass that same figure into `computeFitBreakdown` so the seed-built fit% is cap-consistent with live. (This is what makes C5 regen surface the demotion.)
4. **The absurd-HIGH cases** ($53k/$109k on tiny DWT) are fixed by C1/C2 (TCE recompute), NOT here. C3 only demotes loss-makers. Do not add a high-TCE cap.

## Out of scope (other waves — do NOT touch)
- TCE formula itself (C1 #796 consumption parse + C2 #798 duration/weight — merged, build on them).
- Hard gates (#784 → C4 #797, merged). Render floor/dedup (#789/#787 → A2). Display (#785/#786/#788 → A1).
- Fit factor **weights** or the realism-partition bucket thresholds — do NOT recalibrate the 9 factors; the cap is additive and only lowers fit.
- Seed regen + prod-apply → C5 (local-exec). C3 ships CODE only; the demotion is invisible on prod until C5 regenerates through the fixed engine (same CODE-vs-DATA rule as C1/C2/C4).

## Verify (risk-override — real input shapes per Rule #5)
- Per-shape unit tests on the cap: `tceUsdPerDay` = negative / 0 / small-positive / large-positive / **undefined** (missing ⇒ NO cap, fit unchanged) / null.
- A negative-TCE pair that previously scored ≥60 now caps to ≤40 and carries `appliedCap.reason` mentioning the loss; it therefore falls below the #789 floor → off the main board.
- A healthy positive-TCE pair is UNCHANGED (no false demotion); a missing-TCE pair is UNCHANGED (conservative).
- `appliedCap` precedence: if both an economic cap and another cap apply, the lowest ceiling wins (existing loop already does this — just confirm the economic cap participates).
- FULL `npm test` (all ~9051) 0 failures (update any fit-breakdown anchor test whose expectation legitimately moves because a fixture is loss-making — that is correct, NOT bending; RC1: fix impl, never bend a test that's red because the cap reintroduced a bug). `npx tsc --noEmit` clean; `git status` clean. Grep `__tests__/` for fit-breakdown anchor guards first (v3.18.0 sweep).

Auto-PR to main on QA PASS (full merge+deploy authority). Emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
