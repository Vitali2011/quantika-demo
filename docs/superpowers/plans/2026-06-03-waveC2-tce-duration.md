# Wave C2 — TCE duration scope + weight fabrication (#782b)

**Branch off `origin/main`** (now has C1 #796 consumption-parse fix). Tier **M**, **risk-override** (economics calc) → mandatory `/test-skill` real shapes. Independent of A2 (MatchesClient) and C4 (match-filters). Part of 2026-06-03 QA program.

## Goal

Fix the absurdly-HIGH TCE ($53.4k on 8.1k DWT, $109.2k on 15k DWT) and the mild-negative cases — two compounding code-design issues in `lib/matching/tce-calculator.ts`:

1. **Duration = laden leg only.** `tce-calculator.ts:113` `durationDays = safeDist / (safeSpeed*24)` counts ONLY the laden voyage — no ballast leg, no port days (load+discharge), no idle. So `dailyTce = (freight − costs) / durationDays` divides full freight by ~1–4 days → huge $/day. Fix: duration = round-trip (ballast reposition + laden) + port days (load + discharge) + any idle, so the per-day figure reflects the real voyage length.
2. **Weight fabrication.** `tce-calculator.ts:110` `safeQty = quantity_mt > 0 ? quantity_mt : dwt*0.9` — when cargo weight is null it assumes a near-full load (dwt×0.9), inflating freight revenue. Fix: when weight is unknown, use a conservative estimate (or mark the TCE as low-confidence/estimate-only) rather than assuming full load. The fit-breakdown already penalizes "weight not stated" — keep TCE honest about the unknown.

Consumers: `voyage-calculator.ts:121,194` (bunker + dailyTce), and the seed mirror `scripts/demo-seed/real-matches.ts:241-247` auto-inherits the fix.

## Verify (risk-override — real shapes; the formula CHANGES, so update affected TCE expectations to the new CORRECT formula — that is legitimate, not bending tests)

- SEAGULL 71 (8.1k DWT, ~700nm laden): TCE drops from ≈$53k/day into a plausible handysize range (~$5–15k/day).
- SEAGULL 55-class (15k DWT, ~400nm): from ≈$109k/day to plausible.
- A tiny-cargo-long-voyage case: TCE may still be negative but realistic, OR flagged low-confidence when weight unknown — no fabricated full-load profit.
- Round-trip duration > laden-only duration for every voyage with a ballast leg.
- FULL `npm test` (all ~9051) 0 failures; `npx tsc --noEmit` clean; `git status` clean.

## Out of scope (other waves)

- Consumption parse (#782a) — DONE in C1, do not redo; build on it.
- Fold economics into fit (#783) → C3 (depends on this). Gates (#784) → C4. Display/seed → other waves.
- Do NOT touch Fit-Breakdown factor weights or transit math.

Auto-PR to main on QA PASS (full merge+deploy authority). Emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
