# Matching: hard-gates + top-N cap + clean demo data — design

**Date:** 2026-06-02
**Author:** founder + Claude (broker walkthrough → brainstorm)
**Status:** approved (design), pending implementation plan
**Scratch findings:** `~/orchestrator-state/quantika-demo/match-review-errors-2026-06-02.md`
**Audit data:** `~/orchestrator-state/quantika-demo/restriction-audit-2026-06-02.md` (dev-vps)

---

## Problem

A manual broker walkthrough of the top demo matches (M/V SEAGULL 78/72/71) plus a read-only
corpus audit found that the matching engine shows **too many matches (~300–500, ~120 "good")**,
and that even top-ranked "good" matches are commercially/physically **invalid** because the engine
ignores constraints that a real broker treats as hard knockouts.

Three distinct problem classes (only the first is caused by our demo email/date edits):

| Class | Root | Caused by email/date edits? |
|---|---|---|
| **Dirty data** — broker-name `CONTACT N` leaks into vessel position field; `[object Object]` serialization of restriction fields; ~26% vessels missing build-year; partial date-rebasing (survey dates not rebased) | demo anonymizer + date-freshening | ✅ yes (our edits) |
| **Missing gates** — max-age, vessel voyage/trading-restriction, cargo-required gear, max LOA/beam, flag/class never enforced | `runHardFilters()` lacks the checks; schema lacks the fields | ❌ no — broken on original emails too |
| **Too many matches** — engine surfaces every pair above a score floor | display/ranking policy | ❌ no |

### Audit numbers (corpus = 94 cargo inquiries)
- **17 / 94 cargoes** carry a vessel requirement (max-age, geared-required, max beam/LOA, flag/class). Engine ignores all.
- **9 confirmed violations** in current matches across 3 cargo IDs (e.g. cargo "max beam 16m" → vessel beam 29m; cargo "max 25 years" → vessel 30yr).
- **0 structured restriction fields** in `parse-cargo` schema — all land in free-text `specialRequirements`.
- **8 restrictions serialized as `[object Object]`** (ConfidenceField array→string bug); **7 not parsed at all**.
- **38/51 vessels (74%)** have `built` year — age gate cannot run for the other 26% until parsing captures it.
- Vessel-side voyage restrictions ("no european ports", "not prefer ukraine voyage") — captured in `vessel.restrictions` (shown red in UI) but `HardFilterInput` has no path to them; engine only uses `restrictions` for IMSBC cargo-safety.

## Goal

Few, ironclad matches. Approved approach: **gates first, then cap** at **full depth (engine + clean data)**.
- Hard gates remove commercially/physically impossible pairs before scoring.
- After gates, cap to **top-3 per cargo** by fit; remainder hidden/overflow (not deleted from DB).
- Fix the data source so the engine is fed clean inputs, then regenerate the demo dataset.

Success = the 3 reviewed matches and the 9 audited violations no longer appear as good matches; total
match count drops from ~300–500 to a few per cargo; no false "good" survives a stated hard constraint.

## Design — three layers, sequenced A → B → C → regenerate → prod

### Layer A — clean the source (demo-seed pipeline)
1. **Anonymizer field-safety** (`scripts/demo-seed/seed-all.ts`): broker-name → `CONTACT N` replacement must NOT mutate structured position/port fields. Anonymize on a per-field basis (or after structured parse), not via global body text-replace. → fixes `CONTACT 3` in vessel position (ERR-4).
2. **Fix `[object Object]` serialization**: restriction/specialRequirements ConfidenceField arrays must serialize to readable text, not `[object Object]`. → fixes 8 corrupt rows.
3. **Vessel build-year coverage**: vessel parsing must capture `built` for all vessels where the email states it (currently 26% missing). Age gate depends on it.
4. **Consistent date handling**: rebase all relevant dates together (preserve laycan/position ranges); either rebase or do-not-surface survey/drydock dates so they don't create false "due drydock at laycan" artifacts (ERR-9).
5. **Vague-region coverage**: add `marmara` (+ any missing seas) to `SEA_NAMES` in `vague-region-detector.ts`; a position resolved ONLY via a sea-centroid (no port) must be treated as approximate, not as a precise point with "ideal" timing (ERR-5).

### Layer B — build the gates (engine)
1. **New structured cargo fields** in `parse-cargo` schema + prompt extraction: `max_vessel_age_yrs`, `gear_required` (bool), `max_loa_m`, `max_beam_m`, `flag_required`/`class_required`. Parse patterns: "max NN yrs", "max age NN", "built after YYYY", "geared/grd/grab req", "max loa NN", "max beam NN", "flag XX / class YY".
2. **Vessel voyage/trading-restriction parsing**: derive structured exclusions from `vessel.restrictions` free text — "no <region> ports", "not prefer <region> voyage", "<region> excl". Distinguish **hard** ("no X") from **soft** ("not prefer X").
3. **Extend `HardFilterInput` + `runHardFilters()`** (`lib/sailing/match-filters.ts`) to read the new fields and BLOCK:
   - vessel age (refYear − built) > cargo.max_vessel_age_yrs
   - cargo.gear_required && vessel gearless && no confirmed shore cranes
   - vessel beam/LOA > cargo.max_beam_m / max_loa_m
   - flag/class mismatch when cargo requires a specific one
   - cargo load OR discharge port in a region the vessel **hard**-excludes (soft preference → strong penalty + red flag, not block)
   - Conservative on missing data: unknown vessel built / beam → do not block (no false knockouts), but surface a "could not verify" note.
4. **Cranes**: NOT a blanket hard block (gearless is fine for bulk minerals). Block only when cargo explicitly requires gear and neither vessel nor port provides it. Otherwise show amber "confirm cranes" instead of green OK for gearless+breakbulk+unknown-port (ERR-2/ERR-6 consistency).

### Layer C — top-N cap (ranking/display)
- After gates + scoring, for each cargo keep the **top-3 by fit**; mark the rest `overflow`/hidden (kept in DB, not surfaced in the main board). Confirm: per-cargo (primary). De-dupe so one vessel doesn't monopolise.

### Regenerate + apply
- Regenerate the demo dataset through the fixed pipeline → verify count drop + zero surviving violations.
- Apply to prod with the established discipline: backup → `--dry` → inspect counts/samples → real write → `wal_checkpoint(TRUNCATE)` → restart → health (Rule #22 / seed-prod-apply mechanics).

## Acceptance criteria
- The 3 reviewed matches change as expected: #2 (no-Ukraine → Odessa) and #3 (no-Europe → Constanța) BLOCKED; #1 (age) BLOCKED **if** its cargo states an age limit (else flagged).
- All 9 audited violations (beam-16-vs-29m, max-25yr-vs-30yr, geared-required-vs-gearless) gone from good matches.
- Each cargo shows ≤3 matches in the main board; total surfaced count drops materially from ~120 "good".
- Unit tests per gate using **real input shapes** (null / number / string / ConfidenceField wrapper), not happy-path only.
- No `CONTACT N` or `[object Object]` in any surfaced field after regeneration.

## Out-of-scope (this round)
- Crane SWL-vs-unit-weight matching (deeper engine work; flagged in ERR-2 as later).
- Ice-class gate (0 occurrences in corpus).
- Re-architecting the LLM match pipeline; legacy `computeScoreBreakdown` stays.
- Non-demo / production-tenant real data.

## Risks
- **Prod-data write** at the end → defense-in-depth (`--dry` first) mandatory.
- **Build-year coverage** 74% → age gate is partial until parsing improves; conservative (don't block on unknown) avoids false knockouts but lets some unknowns through — acceptable, surfaced.
- **Region→port mapping** for voyage exclusions needs a reliable country/region lookup; reuse `port_master` + region-centroids.
- Regeneration changes match IDs → ensure saved/dismissed user states handled (or accept reset in demo).
