# Matching: Clean Demo Data Implementation Plan — Layer A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task (full TDD per task: failing test on REAL data shapes → red → minimal impl → green → commit). Checkbox (`- [ ]`) steps.

**Goal:** Fix the demo-data pipeline so the engine is fed clean inputs — no broker-name leaks into structured fields, no `[object Object]` serialization, vessel build-year captured, consistent date-rebasing, vague-sea coverage.

**Architecture:** Targeted fixes in the demo-seed pipeline + parsers + vague-region detector. Each fix is unit-testable WITHOUT a full regeneration (the regeneration itself is a later step). Conservative: changes are additive/corrective, must not break existing green tests.

**Tech Stack:** TypeScript, `scripts/demo-seed/*`, `lib/parsing/*`, `lib/sailing/vague-region-detector.ts`, Jest.

**Spec:** `docs/superpowers/specs/2026-06-02-matching-gates-cap-clean-data-design.md` (Layer A). **Audit:** `~/orchestrator-state/quantika-demo/restriction-audit-2026-06-02.md`.

**Scope (Layer A only).** Do NOT touch Layer B (merged), Layer C (cap), or run the full regen/prod-apply — those are separate. Build + test the fixes; the regeneration that consumes them is a later plan.

---

### Task 0: Locate exact sites (investigation, no code)
- [ ] Grep/read to pin exact locations, record in PR description:
  - anonymizer broker→`CONTACT N` replacement: `scripts/demo-seed/seed-all.ts:~40-71` (confirmed) — find where it touches body vs structured fields.
  - `[object Object]` serialization: where ConfidenceField arrays are written to `lib/sample-data/demo-parsed-cargoes.json` / specialRequirements (seed build serialization). `grep -rn "object Object\|specialRequirements\|JSON.stringify" scripts/demo-seed/`.
  - vessel `built` extraction: `lib/prompts/parse-vessel.ts` + `lib/parsing/parse-vessel-helpers.ts`.
  - date-rebasing: `grep -rln "rebase\|freshen\|openDate\|laycan" scripts/demo-seed/`.
- [ ] Commit nothing (investigation only); proceed.

### Task 1: Anonymizer must not leak `CONTACT N` into structured position/port fields

**Files:** Modify `scripts/demo-seed/seed-all.ts`; Test: `scripts/demo-seed/__tests__/anonymizer-fields.test.ts` (new).

Rule: broker-name → `CONTACT N` replacement applies to body/sender text ONLY, never to parsed structured fields (`openPosition`, `originPort`, `destinationPort`). Either anonymize per-field with a whitelist, or run anonymization BEFORE structured parse and exclude port/position tokens.

- [ ] Write failing test (REAL shape from corpus): given a vessel email line `"open CONTACT 3 22/26august"` where `CONTACT 3` is an anonymized broker token AND subject `"open marmara sea"`, the parsed `openPosition` must NOT be `"CONTACT 3"` — it must resolve to the real region (`marmara`) or be flagged unknown, never a `CONTACT N` token.
- [ ] Also: a structured field value matching `/^CONTACT \d+$/` must be treated as invalid position (cleared/flagged), not stored as a location.
- [ ] red → impl → green → Commit: `fix(demo-seed): anonymizer no longer leaks CONTACT N into position/port fields`

### Task 2: Fix `[object Object]` serialization of ConfidenceField arrays

**Files:** Modify the serialization site found in Task 0 (likely `scripts/demo-seed/build.ts` or a serialize helper); Test: `scripts/demo-seed/__tests__/serialize-confidence.test.ts` (new).

Rule: when a field holds a ConfidenceField (object `{value, confidence, source_text}`) or an array of them, serialize to readable text (the `.value`s joined), never `String(obj)` → `"[object Object]"`.

- [ ] Write failing test (REAL shape): `serialize({value:"MAX 25 years",confidence:"interpreted"})` → `"MAX 25 years"`; array `[{value:"a"},{value:"b"}]` → `"a; b"`; plain string passthrough; null → null. Assert NO output equals `"[object Object]"`.
- [ ] red → impl → green → Commit: `fix(demo-seed): serialize ConfidenceField arrays to text, not [object Object]`

### Task 3: Capture vessel `built` year wherever stated

**Files:** Modify `lib/prompts/parse-vessel.ts` (+ helpers if needed); Test: `lib/__tests__/parse-vessel-built.test.ts` (new).

Rule: extract `built` from real phrasings. Current coverage 74% — raise toward 100% where the email states it.

- [ ] Write failing tests (REAL strings): `"blt 1997"` → 1997; `"built 2008-08 china"` → 2008; `"blt 2008  china"` → 2008; `"BLT 1996"` → 1996; absent → null (do not invent).
- [ ] red → impl (prompt instruction + parse regex) → green → Commit: `fix(parse-vessel): capture built year from blt/built phrasings`

### Task 4: Consistent date-rebasing (preserve ranges; handle survey/drydock)

**Files:** Modify the rebasing site found in Task 0; Test: `scripts/demo-seed/__tests__/date-rebase.test.ts` (new).

Rule: rebasing to "now" must (a) preserve a date RANGE as a range (e.g. `22/26 august` stays a 4-day window, not collapsed to one date), (b) NOT leave survey/drydock dates (`ss`, `dd`) unrebased while the open/position date is rebased — either rebase them by the same offset or do not surface them.

- [ ] Write failing tests: a 5-day open window rebased → still spans ~5 days; `dd 06/2026` with position rebased to 2026-05 → drydock date offset consistently (or excluded from surfaced fields), NOT left creating a "due-drydock-at-laycan" artifact.
- [ ] red → impl → green → Commit: `fix(demo-seed): consistent date-rebase — preserve ranges + survey dates`

### Task 5: Vague-region coverage — Marmara + sea-centroid-only = approximate

**Files:** Modify `lib/sailing/vague-region-detector.ts` (add to `SEA_NAMES`); confirm interaction with `region-centroids.ts`; Test: `lib/sailing/__tests__/vague-region-marmara.test.ts` (new) + extend existing detector test.

Rule: `"marmara"` / `"sea of marmara"` / `"marmara sea"` → vague (add to `SEA_NAMES`). A position resolved ONLY via a sea-centroid (no specific port) must be treated as approximate (do not present `ideal` timing / exact ballast as if from a precise point).

- [ ] Write failing tests: `isVagueRegion("Marmara Sea")` → `vague:true` with `pattern:"sea name"`; `isVagueRegion("Sea of Marmara")` → vague; a real port (e.g. `"Nemrut Bay"`) → `vague:false`.
- [ ] red → impl → green → Commit: `fix(match): add Marmara to vague-sea list + flag sea-centroid-only positions approximate`

---

## Self-review (writing-plans)
- **Spec coverage (Layer A):** anonymizer ✓(T1), [object Object] ✓(T2), built-year ✓(T3), date-rebase ✓(T4), vague Marmara ✓(T5). Task 0 locates unknown exact sites (honest — subagent investigates, then TDD).
- **Real shapes:** corpus strings (`"open CONTACT 3..."`, `"blt 1997"`, `"22/26 august"`, `"Marmara Sea"`) required in tests.
- **Out of scope:** Layer B (merged), Layer C (cap), full regen + prod-apply (later plan). No `data/*.db` writes here — code + unit tests only.

## Subsequent plans
- `Layer C` — top-3-per-cargo cap + overflow-hidden + gearless amber UI.
- `Regen + prod` — regenerate demo dataset through fixed A+B+C pipeline, `--dry`-first prod apply (Rule #22). Verify count drop + zero surviving violations + reviewed/audited matches resolved.
