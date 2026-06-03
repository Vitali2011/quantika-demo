# Wave C4 — Hard gates: knock out commercially/physically impossible pairs (#784 + 9 audited violations)

**Branch off `origin/main`.** Tier **L**, **creative=y** (design = founder-approved spec), **risk-override** (matching engine/filters/parser) → mandatory `/test-skill` with real input shapes. Independent of A1/B/C1 (touches `lib/sailing/match-filters.ts`, parse-cargo schema, vessel-restriction parsing — no overlap). Part of the 2026-06-03 QA program; implements **Layer B** of the approved design.

## Design source (READ FIRST — approved 2026-06-02)
`docs/superpowers/specs/2026-06-02-matching-gates-cap-clean-data-design.md` (scp'd into this worktree) + `docs/superpowers/plans/2026-06-02-matching-gates-engine.md`. Audit data on dev-vps: `~/orchestrator-state/quantika-demo/restriction-audit-2026-06-02.md` (9 confirmed violations; 17/94 cargoes carry a hard vessel requirement). READ the audit before coding.

## Goal
Few, ironclad matches. Hard gates remove impossible pairs BEFORE scoring, so #784 (5k-DWT war-zone-origin transatlantic) and the 9 audited violations (beam-16-vs-29m, max-25yr-vs-30yr, geared-required-vs-gearless, no-Europe→Constanța, no-Ukraine→Odessa) no longer surface as good matches.

## Scope — Layer B (gate engine) ONLY
1. **New structured cargo fields** in parse-cargo schema + extraction prompt: `max_vessel_age_yrs`, `gear_required` (bool), `max_loa_m`, `max_beam_m`, `flag_required`/`class_required`. Patterns per spec §B.1 ("max NN yrs", "geared/grd req", "max loa/beam NN", "flag/class XX").
2. **Vessel voyage/trading-restriction parsing**: structured exclusions from `vessel.restrictions` free text — distinguish **hard** ("no <region> ports", "<region> excl") from **soft** ("not prefer <region>"). §B.2.
3. **Extend `HardFilterInput` + `runHardFilters()`** (`lib/sailing/match-filters.ts`) to BLOCK (§B.3): age>max; gear_required & gearless & no confirmed cranes; beam/LOA>max; flag/class mismatch; load/discharge port in a vessel **hard**-excluded region (soft → strong penalty + red flag, NOT block). `checkVesselAge` already exists (`match-filters.ts:270`) — wire/extend it. **Conservative on missing data**: unknown built/beam → do NOT block (no false knockouts), surface "could not verify".
4. **Cranes** (§B.4): not a blanket block; block only when cargo explicitly requires gear and neither vessel nor port provides it; else amber "confirm cranes".
5. Add a **size-vs-laden-voyage / war-position** consideration for #784 specifically: a tiny vessel (handysize/sub-handy) on a transatlantic laden leg from a war-risk open position is implausible — gate or strong-penalty (use `lib/economics/war-risk.ts` HRA list keyed on the **vessel open position**, not just cargo ports).

## Out of scope (other waves — do NOT do here)
- **Layer A** clean-source (anonymizer field-safety, `[object Object]`, build-year coverage, date handling, vague-region marmara) → seed wave (C5/Layer A).
- **Layer C** top-3-per-cargo cap → separate (overlaps #789 floor; coordinate later).
- **Regenerate + prod-apply** → C5 (local-execution, Rule #22).
- Crane SWL-vs-unit-weight; ice-class. Do NOT re-architect the LLM pipeline.
- The gates CODE + unit tests here; the parsed-field *population* + regen come with the seed wave.

## Verify (risk-override — real input shapes, per spec acceptance)
- Per-gate unit tests with **real shapes**: null / number / string / ConfidenceField wrapper — NOT happy-path only.
- Acceptance: the 3 reviewed matches change (#2 no-Ukraine→Odessa BLOCKED, #3 no-Europe→Constanța BLOCKED, #1 age BLOCKED iff cargo states a limit); all 9 audited violations gone from good matches; conservative-on-missing-data leaves unknowns un-blocked but flagged.
- FULL `npm test` (all ~9051) 0 failures; `npx tsc --noEmit` clean; `git status` clean (commit the scp'd design docs too).

Auto-PR to main on QA PASS — but this is a **risky engine wave**: orchestrator HOLDS for founder review before merge (founder asked risky waves shown first). Emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
