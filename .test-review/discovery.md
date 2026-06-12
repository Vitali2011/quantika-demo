# Discovery: feat/wave-d-revive-cleanup

Branch: feat/wave-d-revive-cleanup
HEAD: 7bb062ec
Date: 2026-06-12
Base: 7499056d (merge-base with main, verified)
Commits: 8 — "docs(plan): wave D" ... "fix(vessel): built>=1900 sanity floor for passport age"
Diff: 87 files, +904 / −6633

## Changed Files (grouped)

### Revive — vessel passport (T5)
- `lib/counterparty.ts` (M, +129/−129): `getVesselPassport(imo)` (fake constants, async, cached) DELETED; `buildVesselPassport(db, vessel, refYear)` ADDED (sync, real data). `VesselPassport` fields all became optional; `pi.club` `string|null`→`string`. New imports: `hasInspectionData`/`getDetentionCount` (psc-repository); removed: shadow-fleet, opensanctions imports.
- `components/vessel/VesselPassportPanel.tsx` (A, 87): presentational card; renders null when no fields.
- `app/vessel/[id]/page.tsx` (M, +11): `getStore().getDatabase()`, `refYear = new Date().getFullYear()`, `passports = vessels.map(...)`, panel mounted after Specs.
- `lib/__tests__/counterparty-passport.test.ts` (M, rewrite — sanctioned §4): 8 tests on in-memory db + migration028.
- `components/vessel/__tests__/VesselPassportPanel.test.tsx` (A, 66).

### Revive — lastcargoes fallback (T4)
- `lib/parsing/parse-vessel-helpers.ts` (M, +3/−1): `parseVesselAIResponse(raw, emailId, subject?, emailBody?)` — in lastCargoes IIFE: `if (!lc) return emailBody ? extractLastCargoesFromBody(emailBody) : null;` (emailBody param pre-existed for built-fallback).
- `app/api/ai/parse-vessel/route.ts` (M, +1/−1): now passes `email.body` as 4th arg.
- `scripts/demo-seed/backfill-lastcargoes.ts` (A, 120): --dry default, --apply; joins emails via account_id+gmail_message_id; readonly db handle in dry mode.
- `scripts/demo-seed/lastcargoes-patch.ts` (A, 40): `patchResultJsonLastCargoes` — root shape array-or-bare-object; patches items where lastCargoes null/undefined.
- `scripts/demo-seed/__tests__/backfill-lastcargoes.test.ts` (A, 58), `lib/__tests__/parse-vessel-lastcargoes.test.ts` (A, 46).

### Revive — ROI report (T6)
- `app/reports/roi/page.tsx` (A, 74): session gate (cookies session_id → getSession), `getStore().getDb()` → `getRoiSummary(db, 99, 90)` → `safeGenerateRoiReport`, try/catch → "ROI report unavailable" body. No-session → "No ROI data" + upload CTA.
- `lib/email/templates/roi-report.ts` (M, +18): `safeGenerateRoiReport` non-throwing wrapper added; `generateRoiReportEmail` untouched.
- `app/dashboard/page.tsx` (M, +12): Link card to /reports/roi ("ROI report / 90-day savings summary preview").
- `lib/__tests__/roi-report-preview.test.ts` (A, 52).

### Deletion pack 1 (09e024da)
- `lib/knowledge/jwc/{adapter,parser}.ts`, `lib/economics/split-bunker.ts` + test, `app/matches/demo-data.ts`, `lib/utils/format-port-name.ts` + test, `lib/ais/index.ts` (barrel), 4 env-flag lines in `.env.local.example` (OPENSANCTIONS_API_KEY, KNOWLEDGE_WAR_RISK_FROM_DB, MULTI_CURRENCY_V2_ENABLED + NEXT_PUBLIC_), `case 'CONTAINER':` single line in `lib/sailing/match-scoring.ts` (FCL/LCL kept), 5 @deprecated props in MatchDetailPanel + 2 test fixtures.

### Deletion pack 2 (8d81190c)
- mobile trio + `lib/mobile/haptics.ts` + `tests/components/mobile/*` + `tests/e2e/mobile.spec.ts` + voice-notes; dashboard inbox cluster (8 components) + their tests + barrel `components/dashboard/index.ts`; `__tests__/components/dashboard-market-intelligence.test.tsx`; MarketIntelligence describe excised from `__tests__/market-snapshot-label.test.tsx`; DashboardInboxSection describe excised from `DashboardSections.test.tsx`; LandingPageClient, connect-gmail-button, activation-tracker, EmailUploadCTA, ApprovePlanModal + test.

### jwc legacy scraper seeder (f1159c36, RESCOPED)
- `lib/knowledge/sources/jwc/{adapter,scraper,chunker,types}.ts` + `scripts/knowledge-jwc-embed.ts` + npm script `knowledge:jwc` + 14 tests (incl. 5 spec19 RC1/RC5/RC6 scraper-sanitizer suites, jwc-chunker, jwc-rag-scraper, adapter-truncation, tests/regression/test_jwc_id_path_collision).
- KEPT (verified on HEAD): jwc_vec/jwc_fts in ALLOWED lists (pipeline.ts:80-81, retriever-sqlite.ts:25-26, retriever-vertex.ts:20 + VERTEX_ENGINE_JWC:31), bootstrap.ts jwc entry (vector_table jwc_vec), regenerate-matches.ts RAG-copy lists (:127-128), compare-routes route untouched, `lib/knowledge/sources/jwc-yaml/` + `scripts/knowledge-jwc-yaml-seed.ts` + npm `knowledge:jwc-yaml`, `.claude/rules/retriever.md` untouched.

## Stated Scope

Source: `docs/superpowers/plans/2026-06-12-wave-d-revive-and-cleanup.md` (incl. Task 3 RESCOPE addendum).
In scope: revive ×3 (passport T5, lastcargoes T4, ROI T6) + delete-list (T1/T2) + jwc legacy seeder only (T3 rescoped).
Out of scope / KEEP: bimco_*, jwc RAG layer (allowed-lists, bootstrap, regen copy, retriever.md), FCL/LCL branch, live dashboard-4 components, migration 018.
Sanctioned spec changes §1-6: tests of deleted modules deleted; MatchDetailPanel fixtures lose 5 props; jwc-pinned allowlist tests (moot after rescope); counterparty-passport.test rewrite; new lastcargoes parser cases without touching existing expectations; any other failing test = BLOCKED.

## Specs Covered — invariants (verbatim-extracted)

- Passport: «null-поля → честные undefined/null, НИКАКИХ дефолтов-фейков»; «psc.detentions3y = imo && hasInspectionData ? getDetentionCount(...) : undefined (паттерн A.2!)»; «age = vessel.built ? refYear - vessel.built : undefined»; sync, no network/LLM; cii NOT resolved here; built>=1900 floor (followup commit).
- Lastcargoes: «вызов extractLastCargoesFromBody только когда поле пустое»; «item С last_cargoes → fallback НЕ перезаписывает»; backfill «существующее значение не трогается; повторный прогон 0 изменений»; --dry default.
- ROI: «невалидные числа → понятная ошибка, не краш»; «честно лейблить»; no send mechanisms; link from dashboard (sanctioned by plan — «достаточно ссылки с дашборда»).
- Deletions: per-item grep of zero live importers (A.6 discipline); jwc surgical KEEP-list above.

## Project Rules (inventory for Phase 2)

- `.claude/rules/retriever.md` — path scope `lib/knowledge/embeddings/retriever*`: NOT in diff (verified — no embeddings files changed). Rule mentions jwc_vec allowlist; allowlist unchanged on HEAD ⇒ rule still accurate. Intersection = verify-only.
- `.claude/rules/ai-provider.md` — `lib/ai-provider.ts` not in diff. parse-vessel route touched 1 line (arg pass-through), no LLM-call changes.
- `.claude/rules/admin-api.md` — no admin routes in diff. New route `app/reports/roi` is a page, not /api/admin.

## Existing Test Coverage (relevant baseline)

- `app/api/ai/__tests__/parse-vessel.test.ts` — existing parseVesselAIResponse expectations (must be untouched per §5).
- `lib/__tests__/parse-vessel-built.test.ts` — emailBody param pre-existing (built fallback).
- `__tests__/dashboard/no-roi-tile.test.tsx` — guard: dashboard must not import RoiSummaryTile / ROI_GUARANTEE_ENABLED; tile + /api/analytics/roi deleted; data layer survives. New dashboard Link does not violate the literal assertions.
- `lib/__tests__/roi-metrics.test.ts`, `roi-metrics-migration.test.ts`, `roi-report-email.test.ts` — untouched.
- Baseline run: deferred to Phase 3 Step 1 (targeted suites only — full npm test forbidden by project convention).

## Mechanical reference-sweep results (raw facts)

- getVesselPassport / format-port-name / split-bunker module / demo-data / activation-tracker / EmailUploadCTA / ApprovePlanModal / LandingPageClient / connect-gmail-button: ZERO surviving references (only a comment in the rewritten test).
- mobile/haptics/voice-notes/BottomSheet/FabVoice/SwipeCard/InboxBreakdown/MarketIntelligence/PriorityCard/TrafficLight/ActionPanel/EmailCard/EmailSection: ZERO surviving references.
- `splitBunkerSavings` consumer survives: `lib/explain-deal-validator.ts:123` + type field `lib/types.ts:66` — producer module deleted; need producer-history check (pre-existing-dead vs introduced-dead).
- `from '@/lib/ais'` barrel imports: ZERO. `@/components/dashboard` barrel imports: ZERO.
- Deleted lib jwc modules: remaining "knowledge/jwc" hits are all `data/knowledge/jwc/*.yaml` DATA paths (war-risk-rates, validate-data-files, 3 tests) — different namespace, intact.
- `scripts/knowledge/refresh.ts:27` slug 'jwc' → dynamic `./sources/jwc` — `scripts/knowledge/sources/` never contained jwc (git log empty) ⇒ pre-existing stub, documented in RESCOPE addendum.
- `jest.config.mjs:15` still ignores `/tests/e2e/mobile\.spec\.ts$` — file deleted this PR (stale config line).
- `parseVesselAIResponse` callers: route.ts ✓body, `scripts/build-sample-data.ts:246` ✓body, `scripts/demo-seed/parse-llm-direct.ts:147` ✓body, `scripts/progonq/run-match.ts:75` — NO body passed (4th arg absent).
- New `process.env` reads in diff: NONE (only plan-doc text). Dead-flag reads (OPENSANCTIONS_API_KEY, KNOWLEDGE_WAR_RISK_FROM_DB, MULTI_CURRENCY_V2*): ZERO in code.
- `getStore().getDb()` (line 95) and `.getDatabase()` (line 204) both return `this.db` — same handle, naming drift only.
- Migrations 028 (psc-history) + 030 (roi_metrics) both in `allMigrations`, run at session-store boot ⇒ tables exist on the page DB.
- MatchDetailPanel live caller: `app/match/[id]/page.tsx` only.
- `knowledge:jwc` npm script removed; no other package.json script references deleted files.

## Red Flags (for Phase 2)

- `scripts/progonq/run-match.ts:75` — only parseVesselAIResponse caller not passing body (possible half-landed fallback wiring; check if body is in scope there).
- `patchResultJsonLastCargoes` root-shape assumption (array | bare item) — if any historical result_json root is `{items:[...]}` wrapper, patch writes lastCargoes onto the WRAPPER. Local frozen demo-seed.db available for shape census.
- Multi-vessel email: one body-wide L/C string applied to every item lacking lastCargoes (live + backfill consistent, but mis-attribution risk in multi-vessel emails — spec-sanctioned per T4 Step 2 test).
- lastCargoes IIFE: fallback fires only on `!lc` BEFORE object/array unwrap; `{value: null}` or `[]` roots skip the fallback (returns null/'' without trying body).
- `buildVesselPassport` called in page render loop — any throw (db edge) = page 500; psc lookup gated on `vessel.imo` truthiness + hasInspectionData.
- VesselPassportPanel renders `sanctions`/`shadowFleet` rows but builder NEVER sets them (dead-feed candidate — intentional per code comment; verify no other producer).
- jest.config stale ignore line for deleted mobile.spec.
- `refYear = new Date().getFullYear()` vs frozen demo data (built 2008 → age drifts with wall clock; honest by design?).
- ROI page renders honest zero ("No voyages recorded") per template test; roi_metrics seeded only via scripts/seed-roi-metrics.ts — empty on a fresh session ⇒ zero-body path is the COMMON path.
- no-roi-tile guard passes literally; new Link is a navigation card, not a tile with numbers — spirit question to classify in Phase 2.
