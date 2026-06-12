# Findings: feat/wave-a-phantom-features

Branch: feat/wave-a-phantom-features
HEAD: 534e72a5
**Phase 3 completed:** 2026-06-12
**Attack plan executed:** 10 items (6 HIGH, 4 MEDIUM) — all executed
**Sub-agents dispatched:** 0 (no Task tool in this session — orchestrator executed all four groups itself, severity order preserved)
**Browser freshness (Step 1.5):** N/A — no browser/E2E attacks run; all UI evidence is RTL/jsdom + source-binding reads, no running-app claims made.

## Tests Added (48 tests, all green on HEAD)

- `tests/regression/wave-a-fueleu-economics.test.ts` — 24 tests: bit-identity vs main@40966379 (dynamic import of the merge-base compute-tce, 9-case input matrix × flag-unset/flag-false), flag-string strictness, share-rule edges, compliant-fuel sign, latent fuelType crash. Fixture: `tests/regression/wave-a-fixtures/compute-tce-main-40966379.ts` (auto-extracted, @ts-nocheck).
- `tests/regression/wave-a-fueleu-ui-provenance.test.tsx` — 7 tests: legacy persisted breakdown (no fueleu key) renders safely, fueleu row binding + single-count total, EconomicsTab source binding (data-driven, no env gate, includeEuETS feed).
- `tests/regression/wave-a-psc-charterer-crosspath.test.ts` — 11 tests: checked-clean "0 detentions" preserved, lookback-window edge, fit-drift direction, charterer penalty end-to-end (−4 exact through analyzePairs), name-mismatch silence, resolver ambiguity/Cyrillic edges, seeder UNIQUE(name) crash repro, fixture consistency.
- `tests/regression/wave-a-sorting-comparator.test.tsx` — 6 tests: comparator antisymmetry property (300 random pairs × 9 keys × 2 dirs, seeded PRNG), generic null-sink tail invariant, both-null fit guard (b268b2e8), dropdown→laycan behavioral + footer label, aria-sort provenance (single active header), DEFAULT_DIR totality.

## Failures Found

### FINDING-001 [MEDIUM]
**Title**: seed-charterers crashes on pre-existing same-name/different-id row; --dry-run cannot predict it
**File**: `scripts/demo-seed/seed-charterers.ts::seedCharterersWithDb` + `lib/market/charterers-repository.ts::upsertCharterer`
**Repro**: `tests/regression/wave-a-psc-charterer-crosspath.test.ts :: seedCharterersWithDb throws UNIQUE(name) when "Huaya" exists under another id`
**Failure**:
```
Pre-state: charterers row (id='ui-12345', name='Huaya') — e.g. created via /charterers UI (NewChartererModal)
seedCharterersWithDb(db) → SqliteError: UNIQUE constraint failed: charterers.name
```
upsertCharterer is `ON CONFLICT(id) DO UPDATE` but migration 026 has `name TEXT NOT NULL UNIQUE`; the DELETE step only clears demo-marker rows, so a founder-created same-name row survives and the INSERT hits the name constraint. `--dry-run` returns BEFORE opening the DB (prints the fixture only), so the planned prod protocol "--dry → числа → apply" gives zero warning of this crash.
**Severity**: MEDIUM — loud crash, no corruption; NOTE: DELETE runs before the throw and there is NO transaction → a failed run leaves demo rows removed but fixture not inserted (partially-applied until rerun).
**Pre-existing on main**: upsertCharterer is pre-existing; the SEEDER and its prod-apply protocol are introduced by this PR → the operational sharp edge is introduced. Does not block (no data loss; rerun after manual cleanup converges).
**Fix hint**: wrap DELETE+upserts in a transaction AND pre-delete by normalized name (or upsert keyed by name); make --dry-run open the DB readonly and print the actual would-delete/would-insert/conflict diff.

### FINDING-002 [LOW]
**Title**: latent crash path — computeTce throws on unknown fuelType inside the enabled FuelEU branch
**File**: `lib/economics/compute-tce.ts:232-238` (via `lib/economics/fueleu.ts:76-77` throw)
**Repro**: `tests/regression/wave-a-fueleu-economics.test.ts :: computeTce throws when flag on + EU leg + garbage fuelType`
**Failure**: `computeTce({...eu, fuelType: 'lsmgo-0.1'})` with FUELEU_ENABLED=true → `Error: Unknown fuel type: lsmgo-0.1`. Flag off → same input harmless.
**Severity**: LOW — `TceInputs.fuelType` has NO producer anywhere today (grep: route, stored-match-economics, canonical-tce-inputs — none set it; always defaults 'vlsfo'). Becomes a 500-shaped landmine the day someone wires a fuel-type selector.
**Pre-existing on main**: No — field and branch introduced here. Not blocking (unreachable today, documented by regression test).
**Fix hint**: validate/fallback inside the branch: `FUEL_GHG_INTENSITY[inputs.fuelType] ? inputs.fuelType : 'vlsfo'`, or try/catch the calculateFuelEu call like the ECA block above does.

### FINDING-003 [LOW]
**Title**: resolver tie semantics — duplicate normalized names resolve to alphabetically-first row, not worst/best tier
**File**: `lib/matching/charterer-tier.ts:18-27` (listCharterers ORDER BY name ASC, BINARY collation)
**Repro**: `wave-a-psc-charterer-crosspath.test.ts :: ambiguity` — rows 'HUAYA.'(blue-chip) + 'huaya'(weak) → 'Huaya' resolves blue-chip ('HUAYA.' < 'huaya' in binary order, uppercase first).
**Severity**: LOW — spec is silent on ties; UNIQUE(name) makes exact dupes impossible, only normalized-collision aliases hit this. Deterministic but surprising (letter case decides the tier).
**Pre-existing on main**: No — resolver introduced here. Not blocking.
**Fix hint**: if aliases ever get seeded, prefer worst-tier-wins or reject normalized duplicates in the seeder (fixture consistency test added covers the shipped fixture).

### FINDING-004 [LOW]
**Title**: non-Latin chartererName silently neutral; parser-extracted long forms don't match seeded short names
**File**: `lib/matching/charterer-tier.ts::normalizeName` (`[^a-z0-9]+` after toLowerCase strips ALL non-ASCII)
**Repro**: `wave-a-psc-charterer-crosspath.test.ts` — 'Хуая' → needle '' → null even when an identical DB row exists; 'Huaya Maritime' (live-LLM-parse plausible form) ≠ seeded 'Huaya' → null.
**Severity**: LOW — demo corpus is Latin and the backfill uses the same regex as the fixture sweep (corpus-consistent: local replay shows exactly 1 binding, 'huaya', which DOES match). Live Gmail parses post-deploy may extract longer forms → silent neutral fit (no penalty), which is the documented fallback, not a wrong number.
**Pre-existing on main**: No — introduced here. Not blocking.
**Fix hint**: follow-up — alias column or normalized-prefix match; keep neutral fallback.

### FINDING-005 [LOW] (test-bug, mine — visible per skill rule)
**Title**: -0 vs 0 in my antisymmetry assertion
**Note**: `compareMatches` legitimately returns `-0` for equal rows (`(b-a)*flip`); `Object.is(-0, 0)` is false so my first assertion draft failed. This is a bug in the TEST, not the PR — Array.sort treats -0 as 0. Fixed in `wave-a-sorting-comparator.test.tsx` (sign normalization), left on record as a false-positive trail.

## Blocked Items

- (none) — all 10 attack plan items executed.

## Items That Passed (attack succeeded, no bug found)

- **A.5 bit-identity (sanctioned §3)**: 9-case matrix (EU/non-EU/intra-EU, ETS-priced, war-risk route, zero consumption/duration, exclude-war-risk branch, odd-number rounding) — flag-unset AND flag='false' outputs numerically identical to main@40966379 computeTce; only `fueleu_usd`/`applicable.fueleu` keys added. Flag strictness: 'TRUE', '1', ' true ', 'yes' do NOT enable.
- **A.5 share rule**: originEu-only (destEu undefined) gets 0.5 share; `originEu+destEu=false` ≡ originEu-only; intra-EU = 2× one-end (implementer's exact-×2 case holds for their even fixture; general half-share verified within $1 rounding). Compliant fuel (lng) → 0, never negative; monotonic in consumption.
- **A.5 UI provenance/liveness**: CalculationWaterfall with LEGACY breakdown (no fueleu keys) → no crash, no row, no NaN, totals intact; fueleu_usd>0 → dedicated '-$7,345' row, displayed total binds breakdown.total_costs_usd exactly once (no UI double-count); fueleu_usd=0 → no row. EconomicsTab: gate AND value both bind `voyageBreakdown.fueleu_usd`; NO `NEXT_PUBLIC_FUELEU`/`process.env.FUELEU` in the component; fetch passes `includeEuETS: true` → route sets originEu/destEu → feed is LIVE (no dead-feed).
- **A.2 semantics**: checked-clean (rows, 0 detained) still shows "0 detentions"; detained-outside-window shows windowed "0 detentions" (documented semantics); no-data vessel fit ≤ checked-clean fit (removing the fake 'ok' factor never raises fit). Implementer's no-data/detained cases confirmed.
- **A.2 data**: all 5 new PSC fixture IMOs (8887296, 9166510, 9191101, 9125085, 9238363) present in the demo fleet (local db vessel parse — old 5 IMOs were indeed phantom); cii.json 17 records, all unique, fixture5 ⊆ cii; PSC fixture ids unique.
- **A.1 end-to-end**: cargo.chartererName='Huaya' through analyzePairs → `fitBreakdown.chartererPenalty === 4`, fit exactly 4.0 below the anonymous pair; blue-chip → 0. UI feed chain live: MatchDetailPanel → UtilisationChartererDisclosure parses fit_breakdown JSON → renders "Charterer tier penalty −4" when >0. regenerate-matches casts result_json items wholesale (`it as unknown as ParsedCargo`) → backfilled chartererName survives into the engine on the regen path.
- **A.1 backfill replay (real corpus)**: `backfill-charterer` dry on the post-apply working copy: 87 cargo rows, 1 already-set ('huaya'), 0 would-patch, 0 missing-email → idempotent; --dry opens DB readonly (write stmt not even prepared). All 87 result_json roots are arrays → the bare-object/`{items:}` shape concern unreachable in this corpus (convention matches regenerate-matches' own `Array.isArray(raw) ? raw : [raw]`).
- **A.1 parser contract**: charterer_name present in ALL THREE places (prompt instruction, Gemini responseSchema `lib/schemas/parse-cargo.ts`, RawCargoItem) + ParsedCargo.chartererName — ai-provider rule's "schema must carry the field" satisfied; mapping trims, nulls whitespace-only/absent/non-string.
- **Sorting**: comparator antisymmetric + self-zero + NaN-free over 300 random pairs × 9 keys × 2 dirs (with nulls); null rows form contiguous tail for every column/direction; both-null fit rows safe (b268b2e8 verified); dropdown laycan → earliest-first + "ranked by Laycan" footer; aria-sort lights exactly one header and toggles desc→asc; DEFAULT_DIR total over SortBy. Protected `__tests__/matches-sort.test.tsx` (#350/#528) green on HEAD.
- **A.6 blast radius**: `tsc --noEmit` exit 0; zero code references to check-deadlines/lib-deadlines/SubsCountdown/queries-dispatches outside docs+one JSON narrative+one comment; demo-scenarios route only serves JSON (no import of deleted script); migration 011 still registered in `lib/migrations/index.ts`; package.json/ops/.github clean.
- **Repins sanctioned**: all 10 repinned test files map to sanctioned §1–§5; economics fixtures only ADD `fueleu_usd: 0`/`applicable.fueleu: false` — no expected number changed anywhere.
- **Baseline**: 158 suites / 1355 tests green across all touched areas on HEAD (lib/matching, lib/market, lib/economics, lib/schemas, matches+parser+psc-api batch, scripts/demo-seed, components).

## Pre-existing Issues (informational, not gate-relevant)

- **Sibling fit-writers ignore PSC/charterer factors**: `scripts/demo-seed/patch-fit.ts:375` and `scripts/demo-seed/real-matches.ts` call computeFitBreakdown WITHOUT detentionCount/chartererTier. Pre-existing on main (they never passed these; on main analyzePairs gave fake-0 to EVERY vessel, so the structural divergence existed for every pair — this PR actually REDUCES it: no-data vessels now agree across paths). Residual: for the 5 seeded IMOs / named-charterer cargos, running patch-fit would strip the vetting/charterer deltas. The active prod regen path (regenerate-matches → analyzePairs) is consistent. Follow-up: align or retire those tools before next use.
- `applicable.ets` gates on calculator-applicability while `applicable.fueleu` gates on USD>0 — minor semantic inconsistency, no observable impact (UI gates on >0 anyway).
- Stale doc crumbs: `lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json` narrative still cites deleted `scripts/check-deadlines.ts`; `app/matches/MatchesClient.tsx:131` comment cites SubsCountdown. Cosmetic.

## Coverage Gaps (what we couldn't test)

- Live LLM parse of charterer_name (prompt effectiveness): dev LLM is down (2026-06-11); contract verified at schema/normalizer level only. Prompt phrasing untested against real model output.
- Browser E2E of /matches sorting on a built app: not run (jsdom behavioral only). Post-deploy smoke should click two headers.
- Prod env/data application (flags, seeds on outreach-vps): outside the merge boundary by definition → Deploy Gate.
- localeCompare collation is environment-dependent for exotic vessel names (jsdom ICU vs prod node ICU) — cosmetic ordering only, not asserted.
