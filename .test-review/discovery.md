# Discovery: feat/wave-a-phantom-features

Branch: feat/wave-a-phantom-features
HEAD: 534e72a5
Date: 2026-06-12
Commits: 12 — "docs(plan): wave A — phantom features + matches column sorting" ... "test(matches): repin header-shape tests to headerCols config form (sorting feature, sanctioned wave-A §5)"
Diff base: 40966379 (merge-base with main, confirmed)

## Changed Files (68 files, +2369/-2810)

### A.6 — deadlines no-op deletion (commit ead34725 + bb1be0b8)
- Deleted: `scripts/check-deadlines.ts`, `lib/deadlines/` (cta.ts, escalation-policy.ts, subs-guardian.ts), `lib/db/queries/dispatches.ts`, `components/deadlines/SubsCountdown.tsx`, `components/deals/SubsCountdownWidget.tsx`, plus ~14 test files (`__tests__/deadlines/*`, `__tests__/cron/deadline-idempotency*`, `tests/deadlines/*`, `tests/regression/*gamma-08*`, `tests/regression/test_check_deadlines_auto_exec.test.ts`, `scripts/__tests__/check-deadlines-demo.test.ts`, SubsCountdown component tests, `__tests__/regression/RC-subs-countdown-import.test.tsx`)
- Modified: `__tests__/regression/hydration-418.test.tsx` (removed #404 SubsCountdownWidget SSR block), `docs/wave-beta/CRON.md`, `docs/runbooks/wave-gamma-flag-activation.md`, `.env.local.example` (SUBS_TIMER_V2 flags removed)

### A.1 — charterer tier activation (bb5bcde4, f7bb5c83, eeda9ce0)
- `lib/types.ts`: ParsedCargo + `chartererName?: string | null`
- `lib/parsing/parse-cargo-ai.ts`: RawCargoItem + `charterer_name`; parseCargoAIResponse maps trim-or-null
- `lib/prompts/parse-cargo.ts`: prompt field instruction added
- `lib/schemas/parse-cargo.ts`: Gemini responseSchema + `charterer_name: {STRING, nullable}`
- `lib/matching/charterer-tier.ts`: resolveChartererTier now live — normalizeName (lowercase, non-alnum→space, trim) lookup over listCharterers(db)
- New: `scripts/demo-seed/seed-charterers.ts` (CHARTERER_FIXTURE 3 rows: GRAIN TRADER A=blue-chip, GRAIN TRADER B=second, Huaya=weak+require_lc; DELETE-by-notes-marker + upsert; --dry-run; --db)
- New: `scripts/demo-seed/charterer-extract.ts` (2 regexes + STOPWORDS + cleanCapturedName + extractChartererNames + patchResultJson)
- New: `scripts/demo-seed/backfill-charterer.ts` (--dry default / --apply; joins emails by account_id+gmail_message_id; patches result_json items lacking chartererName)
- New tests: `lib/matching/__tests__/charterer-tier.test.ts`, `__tests__/parsing/parse-cargo-charterer.test.ts`, `scripts/demo-seed/__tests__/charterer-extract.test.ts`, `scripts/demo-seed/__tests__/seed-charterers.test.ts`, `lib/schemas/__tests__/parse-cargo.test.ts` (+13)

### A.2 — honest PSC no-data (3a81b074)
- `lib/market/psc-repository.ts`: new `hasInspectionData(db, imo)` (COUNT(*) all rows, empty-imo guard)
- `lib/matching/pair-analyzer.ts:733`: detentionCount gated by `db && imo && hasInspectionData(db, imo)`; else undefined (was: `db && imo` → 0)
- `lib/knowledge/sources/psc/fixture.ts`: 5 IMOs replaced (9322180→8887296, 9478999→9166510, 9512345→9191101, 9156789→9125085, 9734567→9238363); 16 records, same structure
- `lib/sample-data/imo/cii.json`: reformatted + 5 new IMO records appended (old 12 kept, total 17)
- New test: `lib/matching/__tests__/psc-no-data-neutral.test.ts`; repins: `lib/market/__tests__/psc-repository.test.ts` (+2 tests), `lib/matching/__tests__/vetting-wiring.test.ts` (IMO repins + live-resolver rewrite), `__tests__/api/vessels-psc-history.test.ts` (IMO repins)

### A.5 — FuelEU cost line (ac22018d)
- `lib/economics/compute-tce.ts`: new optional TceInputs.fuelType; FuelEU block gated `process.env.FUELEU_ENABLED === 'true' && anyEuEnd && duration>0 && consumption>0`; share intra-EU=1 / one-end=0.5; `fueleuUsd = Math.round(fe.penaltyUsd * share)`; added to totalCosts AND both dailyNetVoyage branches; breakdown fields `fueleu_usd`, `applicable.fueleu`
- `lib/economics/voyage-calculator.ts`: TCEBreakdown interface + `fueleu_usd: number` (REQUIRED) + `applicable.fueleu: boolean` (REQUIRED)
- `components/match/EconomicsTab.tsx`: fueleu-section tile, renders when `voyageBreakdown.fueleu_usd > 0`
- `components/economics/CalculationWaterfall.tsx`: destructures fueleu_usd; cost-fueleu row when `> 0`
- `.env.local.example`: FUELEU_ENABLED description rewritten (γ-11 → audit A.5)
- New test: `lib/economics/__tests__/compute-tce-fueleu.test.ts` (83 lines); fixture repins (+fueleu_usd:0/+applicable.fueleu:false) in CalculationWaterfall tests ×2, EconomicsTab tests ×2, voyage-breakdown-chart test

### Sorting (1e44432e, b268b2e8, 534e72a5)
- `app/matches/MatchesClient.tsx`: SortBy extended (+cargo_type, vessel_name, route, dwt, laycan); SortDir; DEFAULT_DIR; exported compareMatches (null-sink-to-end; fit/score: fit_percent??score with null guards, score tie-break); sortDir state + mode-switch reset; headerCols {label, key} config per mode; th → button with data-testid `th-sort-<key>`, aria-sort, ↓/↑ indicator; dropdown +5 options with DEFAULT_DIR on change
- New test: `__tests__/matches-sort-headers.test.tsx`; repins: `__tests__/matches-table-layout.test.tsx`, `__tests__/mode-aware-content.test.ts` (string-array regex → headerCols extraction)
- NOT in diff (protected): `__tests__/matches-sort.test.tsx` (#350/#528 source-regex pins — dropdown testids + `.sort(` in filtered block)

### Infra
- `scripts/__tests__/data-integrity-check.test.ts`: walk-up tsx resolver (32d0a10b)

## Stated Scope

Source: `docs/superpowers/plans/2026-06-12-wave-a-phantom-features.md`
In scope: A.1 (parser field + live resolver + seed + backfill), A.2 (honest no-data + fleet-aligned fixture), A.5 (FuelEU behind FUELEU_ENABLED), A.6 (delete deadlines no-op), /matches column sorting.
Out of scope (founder decision, "не трогать"): A.3 equasis-stub, A.4 jwc_vec/bimco, A.7 getVesselPassport, MULTI_CURRENCY_V2.

## Specs Covered (invariants, verbatim-relevant)

From the plan §Sanctioned + tasks:
1. (A.2) Vessels with no psc_detention_history rows get `detentionCount: undefined` (neutral), NOT "0 detentions". Vessels WITH rows get the real windowed count (0 allowed = "checked, clean").
2. (A.1) resolveChartererTier: normalized-name lookup; null when no chartererName / unknown name / empty needle.
3. (A.5) `TCEBreakdown` gains `fueleu_usd` + `applicable.fueleu`; **when `FUELEU_ENABLED !== 'true'` behavior must be BIT-IDENTICAL to old** — any broken old snapshot = implementation bug, not a snapshot to update.
4. (A.5) Scope rule: 100% energy intra-EU, 50% one-EU-end. Plan test asserts intra == oneEnd × 2.
5. (A.6) Full deletion of check-deadlines + lib/deadlines + their tests; keep migration 011 registered.
6. (Sorting) Existing 4 dropdown options + their data-testid preserved; `.sort(` stays in filtered block (#350); null/undefined sink to END regardless of direction; per-column DEFAULT_DIR (numeric/date desc-first except laycan asc; text asc).
7. Any OTHER failing test = BLOCKED; rewriting expectations to fit implementation forbidden.
8. (Plan T5 Step 6) `app/api/voyage/tce/route.ts` intentionally unchanged — FuelEU rides originEu/destEu set only when includeEuETS. No NEXT_PUBLIC_FUELEU_ENABLED reads in code (tile is data-driven).
9. (Plan T3) seed-charterers idempotent (DELETE by notes marker + upsert); backfill idempotent (skip non-null chartererName, second --apply = 0 changes); backfill --dry default.

## Key bindings/feeds traced in discovery (facts for Phase 2)

- ONLY production caller of getDetentionCount/hasInspectionData/resolveChartererTier: `lib/matching/pair-analyzer.ts:733-736` (analyzePairs). analyzePairs callers: `lib/matching/compute-matches.ts:74`, `app/api/ai/match/route.ts:131`, `scripts/demo-seed/regenerate-matches.ts:581`, research/golden scripts.
- SIBLING fit paths NOT via analyzePairs: `scripts/demo-seed/patch-fit.ts:375` and `scripts/demo-seed/real-matches.ts` call computeFitBreakdown directly and pass NO detentionCount/chartererTier (greps confirm zero occurrences in those files).
- FuelEU UI feed: EconomicsTab fetches /api/voyage/tce with `includeEuETS: true` hardwired (line 359) → route sets originEu/destEu (route.ts:413-414) → live path feeds fueleu_usd. Stored path: `lib/matching/stored-match-economics.ts:190` derives originEu/destEu via deriveEtsCoverage → stored TCE also flag-sensitive.
- `TceInputs.fuelType` has NO producer anywhere (always defaults 'vlsfo'); `calculateFuelEu` THROWS on unknown fuelType (fueleu.ts:76-77).
- StoredMatch (lib/matching/matches-repository.ts): `created_at: number`, `laycan_start: number | null`, `vessel_dwt/tce_usd_per_day: number | null`, `cargo_type/vessel_name/load_port/discharge_port: string | null` — comparator arithmetic type-consistent at TS level.
- A.6 leftover references: `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json` narrative still cites `scripts/check-deadlines.ts`; `app/matches/MatchesClient.tsx:131` comment cites SubsCountdown. Code references: none found (grep lib/ app/ components/ scripts/ package.json ops/ .github/).
- FUELEU_ENABLED readers: only `lib/economics/compute-tce.ts:232`. NEXT_PUBLIC_FUELEU_ENABLED: zero code readers (env example only).

## Project Rules (inventory for Phase 2)

- `.claude/rules/ai-provider.md` — INTERSECTS: diff touches `lib/schemas/parse-cargo.ts` (Gemini responseSchema) + `lib/prompts/parse-cargo.ts`; rule's Gemini structured-output anti-pattern is directly relevant (schema must carry the new field — it does; verify schema↔prompt↔normalizer parity).
- `.claude/rules/admin-api.md` — no intersection (no app/api/admin, no middleware changes).
- `.claude/rules/retriever.md` — no intersection (lib/knowledge/sources/psc is not embeddings/retriever scope).

## Existing Test Coverage (Baseline, run on HEAD 534e72a5)

- `npx jest lib/matching lib/market lib/economics lib/schemas --silent`: 85 suites / 793 tests — BASELINE OK
- matches+parser+psc-api file batch (7 suites incl. protected matches-sort.test.tsx): 94 tests — BASELINE OK
- `scripts/demo-seed scripts/__tests__/data-integrity-check components/economics components/match`: 66 suites / 468 tests — BASELINE OK
- Known: 8 pre-existing red regression suites on main (per controller brief) — not re-run here; tests/regression needs `--testPathIgnorePatterns "/node_modules/"`; full `npm test` FORBIDDEN (kills worker).

## Local data note

`data/demo-seed.db` is a WORKING COPY already mutated by this branch's seed scripts (charterers=3, psc=16 rows, 1 backfilled chartererName) — its state = post-apply target shape (controller brief). Reading allowed.

## Red Flags (raw, no classification)

- `TCEBreakdown.fueleu_usd` added as REQUIRED (not optional) — legacy persisted breakdowns (worksheet_json in demo-seed.db) lack the field; UI reads `voyageBreakdown.fueleu_usd > 0` (undefined-safe at runtime, but any consumer doing arithmetic/validation on the field is suspect).
- `compareMatches` freshness branch has no null guard (`b.created_at - a.created_at`) — created_at typed non-null; verify DB reality.
- Plan's intra-EU test invariant `intra == oneEnd*2` interacts with `Math.round(penalty*share)` — rounding order could violate exact ×2 for odd cents.
- patch-fit.ts / real-matches.ts compute fitBreakdown without detentionCount/chartererTier — divergent sibling write paths for fit_percent.
- seed-charterers `upsertCharterer` conflict semantics unverified (name UNIQUE per migration 026 — collision with pre-existing same-name row with different id?).
- `patchResultJson` assumes root = array | single-item-object; if any result_json root is `{items:[...]}`, the root object itself gets chartererName injected (shape corruption).
- backfill-charterer extracts ONE name per email (first match) and applies to ALL items in the email lacking chartererName — multi-cargo emails with different charterers per item get first charterer applied to every item.
- charterer-extract CHARTERER_ACCOUNT_RE bare-"account X" form could false-positive on CP boilerplate not in STOPWORDS.
- cii.json grew 5 records; consumers of cii.json unverified (duplicate IMO check, shape check).
- demo-scenario 13 JSON narrative references deleted scripts/check-deadlines.ts (doc-level; check if a scenario runner executes it).
