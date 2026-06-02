# Matching Hard-Gates (engine) Implementation Plan — Layer B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (full TDD per task: write failing test with REAL input shapes → red → minimal impl → green → commit). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Enforce stated vessel/cargo hard constraints (max age, voyage/trading exclusions, gear-required, max beam/LOA, flag) as knockouts in `runHardFilters()`, so commercially/physically impossible pairs never surface as matches.

**Architecture:** Add structured restriction fields to the cargo parse schema + prompt; add the corresponding inputs to `HardFilterInput`; add one focused `check*()` per constraint to `lib/sailing/match-filters.ts`; wire them into `runHardFilters()`; populate the new inputs in the caller `lib/matching/pair-analyzer.ts`. Conservative on missing data — never block on unknowns.

**Tech Stack:** TypeScript, Gemini structured-output schema (`@google/genai`), Vitest/Jest (match existing `__tests__` runner), SQLite demo data.

**Spec:** `docs/superpowers/specs/2026-06-02-matching-gates-cap-clean-data-design.md` (Layer B).

**Scope (this plan = Layer B only).** Subsequent plans: Layer A (clean demo data), Layer C (top-3 cap), Regen+prod-apply. Do NOT touch those here.

---

### Task 1: Structured restriction fields in cargo schema + type + prompt

**Files:**
- Modify: `lib/schemas/parse-cargo.ts` (add to `cargoItemSchema.properties`)
- Modify: `lib/types.ts` (`ParsedCargo` — add fields)
- Modify: `lib/prompts/parse-cargo.ts` (extraction instructions + examples)
- Modify: `app/api/parser/parse-cargo/route.ts` (map raw → ParsedCargo; reuse existing toConfidence/number coercion)
- Test: `lib/__tests__/parse-cargo-restrictions.test.ts` (new)

New fields (all nullable): `max_vessel_age_yrs: number`, `gear_required: boolean`, `max_loa_m: number`, `max_beam_m: number`, `flag_required: string`, `class_required: string`.

- [ ] Write failing tests: given raw cargo objects with restriction text, the mapper produces the structured fields. Use REAL shapes seen in corpus:
  - `"MAX 25 years"` → `max_vessel_age_yrs: 25`
  - `"max age 20yrs"` → `max_vessel_age_yrs: 20`
  - `"Vsl shd be geared"` / `"NEED GEARED VSLS"` / `"GRD/Grab fitted vsl req."` → `gear_required: true`
  - `"max loa 145 mtr"` → `max_loa_m: 145`; `"max beam 16mtr"` → `max_beam_m: 16`
  - `"FLAG HK; CLASS CCS"` → `flag_required: "HK"`, `class_required: "CCS"`
  - no restriction text → all null (and `gear_required` null, NOT false)
- [ ] Run → red.
- [ ] Implement: schema entries (NUMBER/BOOLEAN/STRING nullable), `ParsedCargo` fields, prompt section instructing extraction of these patterns into the new fields (keep also writing the raw phrase into `cargo_description`/`special_requirements` as today — additive, do not remove), route mapping.
- [ ] Run → green.
- [ ] Commit: `feat(match): parse structured cargo vessel-restriction fields (age/gear/loa/beam/flag)`

### Task 2: `checkVesselAge` hard-filter

**Files:**
- Modify: `lib/sailing/match-filters.ts` (new `checkVesselAge`; extend `HardFilterInput` with `vesselBuilt: number | null`, `refYear: number | null`, `cargoMaxVesselAgeYrs: number | null`; wire into `runHardFilters` + `HardFilterResult.checks.vesselAge`)
- Modify: `lib/matching/pair-analyzer.ts` (populate the 3 new inputs from vessel.built, refYear already in scope, cargo.maxVesselAgeYrs)
- Test: `lib/sailing/__tests__/match-filters-age.test.ts` (new)

Rule: block when `cargoMaxVesselAgeYrs != null && vesselBuilt != null && refYear != null && (refYear - vesselBuilt) > cargoMaxVesselAgeYrs`. Conservative: any input null → pass.

- [ ] Write failing tests (REAL shapes): limit 25 + built 1996 + refYear 2026 (age 30) → `pass:false`, reason names age+limit; limit 25 + built 2008 (age 18) → pass; limit 25 + built null → pass (conservative); limit null + built 1990 → pass.
- [ ] Run → red. → Implement → Run → green.
- [ ] Commit: `feat(match): hard-filter vessel age vs cargo max-age requirement`

### Task 3: `checkVesselDimensions` (beam / LOA) hard-filter

**Files:** Modify `lib/sailing/match-filters.ts` (`checkVesselDimensions`; inputs `vesselBeam`, `vesselLoa`, `cargoMaxBeamM`, `cargoMaxLoaM`); `pair-analyzer.ts`; Test: `match-filters-dimensions.test.ts`.

Rule: block when `cargoMaxBeamM != null && vesselBeam != null && vesselBeam > cargoMaxBeamM` (same for LOA). Conservative on null.

- [ ] Tests: maxBeam 16 + vesselBeam 29 → block; maxBeam 16 + beam 15 → pass; maxLoa 145 + loa 160 → block; nulls → pass.
- [ ] red → impl → green → Commit: `feat(match): hard-filter vessel beam/LOA vs cargo max`

### Task 4: `checkGearRequired` hard-filter

**Files:** Modify `lib/sailing/match-filters.ts` (`checkGearRequired`; input `cargoGearRequired: boolean | null`, reuse `geared`, `originPort`, `destinationPort` + `portHasShoreCranes`); `pair-analyzer.ts`; Test: `match-filters-gear.test.ts`.

Rule: block when `cargoGearRequired === true && geared === false && shore cranes NOT confirmed at load AND disch` (`portHasShoreCranes` !== true for both). Otherwise pass. (Distinct from existing `checkCrane`, which is port-infra only.)

- [ ] Tests: gear-required + gearless + no port cranes → block; gear-required + geared=true → pass; gear-required + gearless + load port cranes=true → pass; gear-required null → pass.
- [ ] red → impl → green → Commit: `feat(match): hard-filter cargo gear-required vs gearless+no-cranes`

### Task 5: `checkVoyageRestriction` (vessel trading exclusions)

**Files:**
- Create: `lib/sailing/voyage-restriction.ts` — `parseVoyageExclusions(restrictions: string[]): {region: string; hard: boolean}[]` (patterns: `no <region> ports`, `<region> excl`, `not prefer <region> voyage`, `no <region> voyage`; `hard` = true for "no/excl", false for "not prefer/prefer not"); `regionMatchesPort(region, port): boolean` (map region→country/centroid using existing `port_master` + `region-centroids` + a small EU/Europe + Ukraine/Black-Sea lookup).
- Modify: `lib/sailing/match-filters.ts` (`checkVoyageRestriction`; input `vesselRestrictions` already present + `originPort`/`destinationPort`)
- Modify: `lib/matching/pair-analyzer.ts`
- Test: `lib/sailing/__tests__/voyage-restriction.test.ts` (new)

Rule: for each HARD exclusion, if `originPort` OR `destinationPort` matches the excluded region → block. SOFT exclusions → do NOT block here (handled as score penalty + flag in Layer-aware scoring/UI; out of scope for this plan beyond returning a `soft` signal the caller can surface).

- [ ] Tests (REAL strings from corpus): `["no european ports for now"]` + disch `"Constanța"` (Romania) → block; `["not prefer ukraine voyage for just now"]` + load `"Odessa"` → NOT blocked here (soft), returns soft-flag; `["all africa pg india try"]` only (no exclusion) → pass; exclusion region not on route → pass; empty restrictions → pass.
- [ ] red → impl → green → Commit: `feat(match): parse + hard-filter vessel voyage/trading exclusions`

### Task 6: `checkFlagClass` hard-filter

**Files:** Modify `lib/sailing/match-filters.ts` (`checkFlagClass`; inputs `cargoFlagRequired`, `cargoClassRequired`, `vesselFlag`, `vesselClassSociety`); `pair-analyzer.ts`; Test: `match-filters-flagclass.test.ts`.

Rule: block when `cargoFlagRequired != null && vesselFlag != null && normalize(vesselFlag) !== normalize(cargoFlagRequired)`. Conservative on null. (Class society: same pattern, but allow if unknown.)

- [ ] Tests: flag req "HK" + vessel "Panama" → block; flag req "HK" + vessel "HK"/"Hong Kong" (normalized) → pass; null → pass.
- [ ] red → impl → green → Commit: `feat(match): hard-filter flag/class requirement`

### Task 7: Wire all checks into `runHardFilters` + caller

**Files:** Modify `lib/sailing/match-filters.ts` (extend `HardFilterResult.checks` with `vesselAge, dimensions, gearRequired, voyage, flagClass`; push their reasons into `failures`); `lib/matching/pair-analyzer.ts` (populate every new input on the `HardFilterInput` it builds); Test: extend existing `runHardFilters` test.

- [ ] Test: a single input exercising all new checks aggregates failures correctly; all-pass input still passes.
- [ ] red → impl → green → Commit: `feat(match): wire new hard-gates into runHardFilters`

### Task 8: Integration — reviewed matches + audited violations are blocked

**Files:** Test only: `lib/sailing/__tests__/match-gates-integration.test.ts` (new). No new prod code (if a test fails, fix the responsible gate, not the test — RC1).

- [ ] Tests reproducing the real cases: (a) vessel "no european ports" + cargo disch Constanța → `runHardFilters().pass === false`; (b) cargo "max 25 years" + vessel built 1996 → blocked; (c) cargo "max beam 16m" + vessel beam 29m → blocked; (d) bulk-minerals + gearless + bulk terminal → still passes (no false knockout); (e) the SEAGULL-72 Odessa case (soft ukraine) → not hard-blocked, soft-flagged.
- [ ] red (where impl incomplete) → ensure green via the gates from Tasks 2-6 → Commit: `test(match): integration gates for reviewed+audited violations`

---

## Self-review (writing-plans)
- **Spec coverage (Layer B):** age ✓(T2), voyage ✓(T5), gear ✓(T4), beam/LOA ✓(T3), flag/class ✓(T6), structured parse ✓(T1), wiring ✓(T7), acceptance for reviewed+audited ✓(T8). Cranes-as-amber-UI = Layer C/UI (out of scope here, noted).
- **Conservative-on-missing** stated in every gate (no false knockouts) — matches spec risk note.
- **Real input shapes** (null/number/string/ConfidenceField, corpus strings) required in each test — matches RC #747 lesson.
- **Out of scope confirmed:** data cleanup (Layer A), top-3 cap (Layer C), regen/prod. Soft-preference scoring beyond a returned flag.

## Subsequent plans (not this file)
- `Layer A` — anonymizer field-safety, `[object Object]` fix, vessel built-year coverage, date-rebase consistency, vague-region (marmara).
- `Layer C` — top-3-per-cargo cap + overflow-hidden + gearless amber UI.
- `Regen + prod` — regenerate demo dataset, `--dry`-first prod apply (Rule #22).
