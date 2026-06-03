# Wave C1 — TCE consumption parse fix (#782a, the −$96.3k case)

**Branch off `origin/main`.** Tier S, **risk-override** (parser) → mandatory `/test-skill` with real input shapes. Independent of A1/B/C4 (only `lib/matching/tce-calculator.ts`). Part of the 2026-06-03 QA program.

## Goal
Kill the extreme negative TCE (−$96.3k/day) shown as a "match". Root: `parseLeadingNumber` (`lib/matching/tce-calculator.ts:58-67`) does `s.match(/(\d+(?:\.\d+)?)/)` — grabs the FIRST number in the string. For LADY ANITA the consumption field is `"Ballast: IFO 180 M/E 3.7MT/D; ..."` → it returns **180** (the fuel-grade "IFO 180"), not the real ~3.7 mt/day. 180 mt/day → bunker = 180×days×$600 → millions → −$96k/day. Correct parse (~3.7) → +$7k/day.

## Fix
In `lib/matching/tce-calculator.ts`, make the **consumption** parse skip fuel-grade tokens. Either:
- a dedicated `parseConsumption(s)` that extracts the `…MT/D` / `mt/day` figure (e.g. `/(\d+(?:\.\d+)?)\s*(?:MT\/?D|mt\/?day|t\/day)/i`), falling back to `DEFAULT_CONSUMPTION_MT_PER_DAY` when absent; OR
- make `parseLeadingNumber`, when used for consumption, strip fuel-grade tokens (`IFO 180/380/500`, `VLSFO`, `LSMGO`, `MGO`, `M/E`, `A/E`) before matching.
Keep `parseLeadingNumber` behavior unchanged for speed and other numeric fields (don't break its other callers — grep them first).

## Verify (real input shapes — risk-override)
- `"Ballast: IFO 180 M/E 3.7MT/D"` → **3.7** (not 180); `"abt 14 mt/day"` → 14; `"14.5"` → 14.5; `""`/null → default; `{value:'3.7MT/D'}` wrapper → recurse → 3.7; a string with NO mt/day figure → default (not a stray grade number).
- Re-derive: LADY ANITA TCE flips from ≈−$96k to a sane positive figure.
- FULL `npm test` (all ~9051) 0 failures; `npx tsc --noEmit` clean; `git status` clean.

## Out of scope (other waves)
- TCE duration = laden-only + `dwt×0.9` weight fabrication (#782b) → Wave C2.
- Fold economics into fit (#783) → C3. Gates (#784) → C4. No display/seed.

Auto-PR to main on QA PASS. Emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
