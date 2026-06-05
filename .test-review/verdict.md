# test-skill Verdict — detectSpot tighten (fix-detectspot-tighten)

**Verdict: APPROVE**

## What was tested

Phase 1 — Discovery: 1 commit, 2 files changed (readiness-gap.ts + readiness-gap.test.ts)

Phase 2 — Attack surface: Class 10 (Cleanroom) + Class 11 (PBT-adjacent edge cases)
- Change is a regex/normalizer guard in a shared symbol (detectSpot)
- Risk: false-positive flip (spot→non-spot for dated vessels) and false-negative flip (non-spot→spot for edge inputs)

Phase 3 — Attack executed:
- All 8 spec shapes: PASS
- 17 adversarial edge cases (case variants, date formats, port+no-date, keyword-only, newline): ALL PASS
- Consumer suite (pair-analyzer, economics-wiring, laycan-display): 31 tests PASS
- Integration regression (SEAGULL-12 shape): isSpot=false, verdict='idle': PASS
- match-realism-stability (4 tests): PASS

## Findings

None. All probe inputs behaved as expected.

**Notable edge case — "spot today":**
After fix, `detectSpot("spot today") = false` (parseVesselOpenDate sees "today" in stripped string → Date → non-spot).
This is CORRECT behavior — a vessel marked "today" has an explicit date context; the 30-day spot window is reserved for keyword-only availability signals. This is an improvement, not a regression.

**Pre-existing gap (not introduced by this PR):**
`parseVesselOpenDate("spot 2026-06-03")` still returns `today` (spot branch fires first in date-parsing.ts).
So openDateObj for a "spot 2026-06-03" vessel is computed as today, not 2026-06-03.
For the SEAGULL-12 scenario (today = 2026-06-03), the open date IS today, so the calculation is correct.
For a future scenario where today ≠ 2026-06-03, openDateObj would drift. This is a pre-existing limitation of parseVesselOpenDate, out of scope for this fix. Recommend a follow-up to make parseVesselOpenDate prefer the ISO date over the keyword when both are present.

## Gate

No security bugs, no data corruption, no breaking API changes, no HIGH findings introduced by this PR.

**APPROVE**
