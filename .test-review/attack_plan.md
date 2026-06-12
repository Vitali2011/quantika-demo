# Attack Plan: feat/wave-a-phantom-features

Branch: feat/wave-a-phantom-features
HEAD: 534e72a5
**Generated:** 2026-06-12
**Diff base:** 40966379..HEAD (12 commits, 68 files)

## Changed Files → Classes

- `lib/matching/charterer-tier.ts` (normalizeName + lookup): **normalizer + validator** → property-based (HIGH)
- `scripts/demo-seed/charterer-extract.ts` (2 regexes + cleanCapturedName + patchResultJson): **parser + normalizer + data-contract** → property-based + adversarial corpus (HIGH)
- `scripts/demo-seed/seed-charterers.ts` / `backfill-charterer.ts`: **data-contract** → idempotency / --dry replay / shape-through-consumer / upsert-conflict (HIGH)
- `lib/parsing/parse-cargo-ai.ts` + `lib/schemas/parse-cargo.ts` + `lib/prompts/parse-cargo.ts`: **parser + project-rule ai-provider** → contract tests + schema↔prompt↔normalizer parity (HIGH)
- `lib/market/psc-repository.ts` (hasInspectionData) + `lib/matching/pair-analyzer.ts:733`: **cross-path-consistency + conditional-ui-liveness** (HIGH)
- `lib/knowledge/sources/psc/fixture.ts` + `lib/sample-data/imo/cii.json`: **data-contract** → fleet-intersection + duplicate/shape checks (MEDIUM)
- `lib/economics/compute-tce.ts` + `voyage-calculator.ts`: **env-parity (flag) + derived-value (totalCosts/dailyTce)** → bit-identical-flag-off + share/rounding properties (HIGH)
- `components/match/EconomicsTab.tsx` + `components/economics/CalculationWaterfall.tsx`: **displayed-value-provenance + conditional-ui-liveness** (HIGH — trust: a cost line) 
- `app/matches/MatchesClient.tsx`: **ui-route + comparator (derived ordering)** → property-based comparator + wiring + protected-pin re-run (HIGH)
- A.6 deletions: **blast-radius** → tsc + grep + runtime-reference sweep (MEDIUM)
- `.env.local.example`: **env-parity** → documented/bake-time/default-off (MEDIUM)
- Test repins (10 files): **sanctioned-check** → verify each maps to §1–§5, no expectation drift beyond sanction (MEDIUM)

## Ordered Attack Sequence

1. **HIGH — FuelEU flag-off bit-identity + math** (`compute-tce.ts`): flag-off deep-equality vs main behavior (numbers identical, only new keys added); share rule one-end=0.5/intra=1 incl. `originEu=true,destEu=undefined`; rounding ×2 invariant claim; duration/consumption guards; review new test quality (env leak between tests).
2. **HIGH — FuelEU displayed-value-provenance / liveness**: tile binds `breakdown.fueleu_usd` (exact field); legacy persisted breakdown WITHOUT the field (cast `as TCEBreakdown`) renders no tile, no NaN, waterfall total stays consistent; trace feed end-to-end: EconomicsTab fetch(includeEuETS:true) → route originEu/destEu → computeTce flag branch; stored path (stored-match-economics deriveEtsCoverage) flag-sensitivity documented for Deploy Gate; `TceInputs.fuelType` dead-input note; data-integrity-check interplay with worksheet_json lacking fueleu_usd.
3. **HIGH — PSC no-data semantics, cross-path** (`pair-analyzer` + siblings): unit semantics no-rows→undefined / rows-clean→0 / detained→count; lookback edge (old rows only → hasInspectionData true → "0 detentions" shown — is that honest per spec?); sibling writers of fit_percent (patch-fit.ts, real-matches.ts) never pass detentionCount/chartererTier — assess half-landed divergence vs pre-existing; vetting UI surface: neutral factor text + bracketData absence.
4. **HIGH — charterer resolver + extraction properties**: normalizeName idempotency/charset (Cyrillic, diacritics: "Møller" vs "Moller" mismatch class), ambiguous duplicate normalized names (first-wins nondeterminism — listCharterers order), tier resolution wired through analyzePairs to chartererPenalty and the UtilisationChartererDisclosure feed (`fb.chartererPenalty`); seeded-name↔corpus parity ("Huaya" vs parser-extracted "Huaya Maritime" → silent no-match risk).
5. **HIGH — seeds/backfill data-contract**: seed idempotency (2× converge), upsert collision with pre-existing same NAME different id (UNIQUE constraint), DELETE-marker scope (non-marker rows survive); backfill --dry writes nothing (readonly handle), --apply 2× = 0 patches, root-shape preservation (array vs bare object vs `{items:[...]}` reality in local db), multi-item/multi-charterer email semantics, shape-through-consumer: patched result_json parses through regenerate-matches' own reader.
6. **HIGH — sorting comparator + wiring**: property: comparator consistency (sign-antisymmetry a/b swap; null-sink invariant both dirs; no NaN for null fields), per-column correctness, fit/score null-guard followup (b268b2e8) actually fixes synthetic rows; header click toggles + mode reset + dropdown DEFAULT_DIR; protected `__tests__/matches-sort.test.tsx` stays green; `aria-sort` only on active col.
7. **MEDIUM — A.6 blast-radius**: `tsc --noEmit` clean; no runtime/script/cron/package.json references to deleted modules; migration 011 still registered (verified in Phase 2 — confirm in findings); demo-scenario 13 narrative stale ref (cosmetic note).
8. **MEDIUM — env-parity**: FUELEU_ENABLED runtime-only (server) → restart needed, no rebuild; NEXT_PUBLIC_FUELEU_ENABLED zero readers (doc-only — flag in Deploy Gate); CHARTERER_CREDIT_ENABLED not gating scoring (per plan — confirm no accidental gate added); SUBS_TIMER_V2 readers all gone; `.env.local.example` parity.
9. **MEDIUM — fixture/cii data-contract**: new fixture IMOs ∈ demo fleet (local db parsed_results vessels); cii.json no duplicate IMOs, consumer reads (ciiRating lookup) tolerate 17 records; PSC fixture ids unique.
10. **MEDIUM — sanctioned-check of 10 repinned test files**: each rewrite traces to §1–§5; no unsanctioned expectation change (esp. economics fixtures only ADD fueleu fields, never change expected numbers).

## Cross-Cutting Classes Applied

- **cross-path-consistency**: detentionCount/chartererTier producers (#3, #4) — value changed in analyzePairs; enumerate ALL fit_percent writers: analyzePairs (compute-matches, ai/match route, regenerate-matches) + patch-fit + real-matches. Blast-radius rule applies: PR changes how detention factor is produced → every fit producer in scope.
- **displayed-value-provenance**: FuelEU tile/waterfall binding + total consistency (#2); sort indicator binding `sortBy`/`sortDir` → aria-sort + footer label (#6).
- **conditional-ui-liveness**: FuelEU tile (`fueleu_usd > 0`) — feed live only when server flag on AND EU leg AND route sets originEu/destEu (#2); charterer penalty line (`chartererPenalty > 0` in UtilisationChartererDisclosure) — feed live only after seed+backfill+regen (#4); "0 detentions" bracketData now only with data (#3).

## Project Rules Applied

- `.claude/rules/ai-provider.md` → Gemini structured-output: `charterer_name` added to responseSchema (lib/schemas/parse-cargo.ts) — attack: schema↔RawCargoItem↔prompt parity test; missing-field-in-schema would silently drop the value (history: Gemini wraps/drops without schema). Item in #4/SA-1.
- `.claude/rules/admin-api.md` → intersects nothing in this diff.
- `.claude/rules/retriever.md` → intersects nothing in this diff.

## Sub-agent dispatch (Phase 3, ≤4 parallel)

- **SA-1 charterer-data**: items 4 (extraction/resolver properties), 5 (seeds/backfill), parser contract + schema parity.
- **SA-2 economics**: items 1, 2 (FuelEU math + provenance + env interplay), part of 8.
- **SA-3 matching/PSC**: item 3 (+fit drift quantification, sibling-path assessment, vetting UI surface), item 9.
- **SA-4 sorting+sweeps**: items 6, 7, 8, 10.

## Skipped (why)

- `docs/**`, plan doc: docs-only.
- `scripts/__tests__/data-integrity-check.test.ts` walk-up resolver: test-infra, LOW — covered by baseline run (green) + meta-check in #2 (script's breakdown expectations).
- Deleted test files: covered by #7 blast-radius + sanctioned §4.

## Coverage Notes

- No auth/html-sanitizer/db-migration/concurrent signals in this diff.
- No browser E2E planned: no dev server required; all UI checks via RTL/jsdom + source binding reads → Step 1.5 freshness N/A (no running-app evidence will be cited).
- llm-caller: prompt change is additive instruction text; no snapshot infrastructure for prompts exists — parity test covers the contract instead.
