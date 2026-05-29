# Dead Code Audit — 2026-05-28

**Project:** quantika-demo (Next.js 16 + TypeScript) · **Branch:** `dw/dead-code-audit-2026-05-28`

**Scope & methodology.** This audit swept the production source tree (`app/`, `lib/`, `components/`, `scripts/`, `hooks/`) plus the env/flag surface (`.env*`, deploy/CI/ops, `process.env` reads), explicitly **excluding** `node_modules/`, `.next/`, and `docs/` (docs counted as documentation, never as importers). 257 raw candidates from 16 finder lanes were narrowed to 170 verified target groups. Every target was put through an **adversarial per-target verification pass**: each of 9 survival vectors (dynamic import, reflection/registry, barrel re-export, server action, test-only-meaningful, Next.js convention, env gating, external integration, type-only) was actively probed with `rg`-based evidence before a verdict was issued. Test references count as usage and cap confidence at MEDIUM. This audit is **READ-ONLY** — nothing was deleted; every item below is a recommendation with its evidence.

A key distinction throughout: many `unused-export` findings are **dead `export` modifiers, not dead code** — the symbol is still consumed internally within its file or by a live function, so the recommendation is `refactor` (drop the `export` keyword) rather than `delete`. These are kept in the MEDIUM/HIGH tables but flagged accordingly.

## Summary

| Confidence | Confirmed-dead verdicts |
|---|---|
| HIGH | 67 |
| MEDIUM | 49 |
| LOW | 0 |
| **Ruled alive (false positives discarded)** | **54** |

- **Total LOC estimated dead (HIGH + MEDIUM confirmed):** ≈ 6,640 LOC
- **Total dead source files (distinct `orphan-file` confirmed-dead paths, excluding env:/flag: pseudo-paths):** 34

The bulk of deletable mass is standalone CLI/eval scripts (progonq runners, eval harnesses, one-shot data tools) and an entirely dead `components/dashboard/*` + `components/mobile/*` cluster. The largest *single* category by count is dead `export` modifiers on RAG adapter option/result types and shadcn/ui boilerplate — low LOC, all `refactor`.

## Top 10 immediate deletions

The ten HIGH-confidence, highest-LOC items (all are full orphan files safe to delete outright):

| Target | Category | LOC | Why |
|---|---|---|---|
| `scripts/eval/run-match-providers-comparison.ts` | orphan-file | 613 | Standalone manual eval CLI; zero exports, `require.main` self-invoke, no package.json/CI/import reference. |
| `scripts/audit-grounding.ts` | orphan-file | 510 | One-shot date-stamped grounding-audit CLI; report already produced, zero references. |
| `lib/knowledge/jwc/adapter.ts` (`refreshJwc`) | orphan-file | 198 | Slug dispatcher target `scripts/knowledge/sources/jwc.ts` does not exist; superseded by `sources/jwc` + `jwc-yaml` adapters (MEDIUM on whole file; JwcZone import HIGH). |
| `scripts/refresh-canal-tariffs.ts` | orphan-file | 194 | Standalone CLI; canal subsystem runs via `lib/economics/canals/*` independently. |
| `scripts/seed-vertex-datastores.ts` | orphan-file | 185 | One-time Vertex datastore migration tool from rolled-back Vertex initiative; zero references. |
| `scripts/progonq/run-explain-deal.ts` | orphan-file | 183 | Self-executing progonq eval runner; only a console hint string in `audit-grounding.ts` mentions it. |
| `scripts/progonq/normalize-cargo-refs.ts` | orphan-file | 180 | One-off temp tool; usage comment points to `/tmp/`, zero exports, never wired in. |
| `scripts/verify-ports.ts` | orphan-file | 168 | Standalone tsx CLI; only a log-string in another orphan references it. |
| `scripts/progonq/run-match.ts` | orphan-file | 207 | Self-executing eval runner; zero references (distinct from `run-match-providers-comparison.ts`). |
| `scripts/progonq/build-ground-truth.ts` | orphan-file | 232 | progonq corpus builder; distinct from the wired `wave-gamma-bake-off` namesake — this one is referenced nowhere. |

---

## HIGH — safe to delete

### Orphan files (delete whole file)

- `app/matches/demo-data.ts` — orphan-file `DEMO_MATCHES` — **HIGH/delete** — ~2 LOC. Evidence: `rg DEMO_MATCHES` → 4 hits, all negative test assertions (`expect(src).not.toMatch(/DEMO_MATCHES/)`); `rg import.*demo-data` → 0. 2-line leftover stub (empty array); live route fetches via `listMatches()`.
- `lib/ais/index.ts` — orphan-file (barrel) — **HIGH/delete** — ~3 LOC. Evidence: bare-barrel import `from '…/lib/ais'` → 0; all 4 test consumers import submodules directly, bypassing the barrel. Barrel re-export chain dead-ends.
- `lib/sample-data/sof-events/index.ts` — orphan-file `loadSofFixtures` + SOF types — **HIGH/delete** — ~64 LOC. Evidence: `rg loadSofFixtures` → 1 (def only); `rg sof-events` → 0 importers; SOF tests import `lib/laytime/sof-parser` instead. Delete dir + 6 fixtures.
- `lib/sample-data/voice-notes/index.ts` — orphan-file `loadVoiceFixtures` — **HIGH/delete** — ~17 LOC. Evidence: `rg loadVoiceFixtures` (excl self) → 0; `rg voice-notes` → 0; only internal `require` on line 15. Delete dir + 4 fixtures.
- `lib/onboarding/activation-tracker.ts` — orphan-file + unused-export `trackQuoteSent` (duplicate findings, same unit) — **HIGH/delete** — ~14 LOC. Evidence: `rg trackQuoteSent` → 1 (def only); planned spec-06 QuoteTab wiring never landed. `markActivated` reached directly elsewhere.
- `components/LandingPageClient.tsx` — orphan-file + unused-export `LandingPageClient` — **HIGH/delete** — ~73 LOC. Evidence: case-insensitive `landingpageclient` → 1 (def only); root route renders `PublicLanding` (PR #527 superseded PR #281).
- `components/connect-gmail-button.tsx` — orphan-file `ConnectGmailButton` — **HIGH/delete** — ~17 LOC. Evidence: only importer is the orphan `LandingPageClient.tsx`; `PublicLanding` does not import it. Delete paired with its upstream orphan.
- `components/onboarding/EmailUploadCTA.tsx` — orphan-file + unused-export `EmailUploadCTA` — **HIGH/delete** — ~73 LOC. Evidence: `rg EmailUploadCTA` → 1 (def only, incl. hidden/gitignored sweep); analytics events `cta_upload_*` fire nowhere else. Superseded by `PublicLanding`.
- `components/dashboard/ActionPanel.tsx` — orphan-file + unused-export `ActionPanel` — **HIGH/delete** — ~130 LOC. Evidence: only barrel `components/dashboard/index.ts` re-exports it; barrel has 0 importers (all siblings imported by direct path).
- `components/dashboard/EmailCard.tsx` — orphan-file + unused-export `EmailCard` — **HIGH/delete** — ~45 LOC. Evidence: imported only by sibling orphans `EmailSection`/`ActionPanel`; whole cluster self-referential, barrel unimported.
- `components/dashboard/EmailSection.tsx` — orphan-file + unused-export `EmailSection` — **HIGH/delete** — ~64 LOC. Evidence: `rg EmailSection` → 2 (def + dead barrel re-export); never rendered.

### Standalone CLI / eval / one-shot scripts (delete whole file)

- `scripts/audit-grounding.ts` — orphan-file — **HIGH/delete** — ~510 LOC. Evidence: `rg audit-grounding` → 1 (own usage comment); absent from package.json (40+ scripts), `.github`, `.sh`; shebang + top-level `main()`, zero exports.
- `scripts/refresh-canal-tariffs.ts` — orphan-file — **HIGH/delete** — ~194 LOC. Evidence: `rg refresh-canal-tariffs` → 1 (own comment); `require.main===module` guard; canal runtime lives in `lib/economics/canals/*`.
- `scripts/seed-vertex-datastores.ts` — orphan-file — **HIGH/delete** — ~185 LOC. Evidence: `rg seed-vertex` → 0 project-wide; not in package.json/CI/runbook; rolled-back Vertex initiative.
- `scripts/verify-ports.ts` — orphan-file — **HIGH/delete** — ~168 LOC. Evidence: `rg verify-ports` → 5 (2 self, 1 log-string in sibling orphan, 2 docs); zero exports, `require.main` guard.
- `scripts/l5c/extract-disagreements.ts` — orphan-file — **HIGH/delete** — ~73 LOC. Evidence: `rg extract-disagreements` → 1 (own comment); input dir `.private/l5c-data/` gone, output already committed.
- `scripts/l5c/merge-pairs.ts` — orphan-file — **HIGH/delete** — ~138 LOC. Evidence: `rg merge-pairs` → 1 (own `Run:` comment); zero exports, side-effecting one-shot.
- `scripts/eval/run-match-providers-comparison.ts` — orphan-file — **HIGH/delete** — ~613 LOC. Evidence: 9 hits all self/docs; zero exports, `require.main` guard; not in package.json/CI/cron.
- `scripts/eval/run-parser.ts` — orphan-file — **HIGH/delete** — ~224 LOC. Evidence: `rg run-parser` → docs + own comment only; imports live modules but is imported by nothing; zero exports.
- `scripts/knowledge/load-market-indices.ts` — orphan-file `loadMarketIndices` — **HIGH/delete** — ~122 LOC. Evidence: `rg` (excl self) → 0; systemd unit ExecStarts the different `cron/refresh-market-indices.ts`; live CSV path is `lib/market/manual-csv-loader.ts`.
- `scripts/knowledge/seeds/seed-charterers.ts` — orphan-file `seedCharterers` — **HIGH/delete** — ~67 LOC. Evidence: `rg seedCharterers` → 2 (self only); no thin wrapper (unlike sibling seeders); 'blue-chip' hits are the domain tier concept.
- `scripts/knowledge/cron/refresh-bimco-rag.ts` — orphan-file — **HIGH/delete** — ~48 LOC. Evidence: no systemd unit (unlike fx-rates/market-indices/sanctions siblings); redundant wrapper around `syncBimcoRag`; regression test only string-matches the *seeder* file.
- `scripts/seed-market-indices.ts` — orphan-file (thin wrapper) — **HIGH/delete** — ~8 LOC. Evidence: `rg scripts/seed-market-indices` → 1 (own usage comment); tests import the `knowledge/seeds` implementation directly.
- `scripts/progonq/run-explain-deal.ts` — orphan-file — **HIGH/delete** — ~183 LOC. Evidence: 5 hits, 4 self + 1 console-hint string in `audit-grounding.ts`; zero exports.
- `scripts/progonq/run-match.ts` — orphan-file — **HIGH/delete** — ~207 LOC. Evidence: `rg progonq/run-match` → 1 (own comment); other `run-match` hits are the unrelated `eval/run-match-providers-comparison.ts`.
- `scripts/progonq/run-parse-recap.ts` — orphan-file — **HIGH/delete** — ~149 LOC. Evidence: `rg run-parse-recap` → 4 (all self); zero docs/tests (unlike siblings `run-parse-cargo`/`run-match`); judge does not import it.
- `scripts/progonq/judge-classify.ts` — orphan-file — **HIGH/delete** — ~146 LOC. Evidence: `rg judge-classify` → 3 (2 self + 1 docs); finder's claimed test importer actually imports `run-classify`, not this; zero exports.
- `scripts/progonq/normalize-cargo-refs.ts` — orphan-file — **HIGH/delete** — ~180 LOC. Evidence: `rg normalize-cargo-refs` → 1 (own comment pointing at `/tmp/`); zero exports; never in canonical pipeline.
- `scripts/progonq/build-progonq-corpus.ts` — orphan-file — **HIGH/delete** — ~166 LOC. Evidence: 3 hits (2 self + 1 design doc); `build:corpus` npm script targets the unrelated `scripts/build-corpus.ts`.
- `scripts/progonq/classify-corpus.ts` — orphan-file — **HIGH/delete** — ~206 LOC. Evidence: 4 hits, all `import type {ClassifiedEmail}` in 2 sibling orphans (build-ground-truth, build-progonq-corpus); `classifyBatch` collision in `app/api/ai/classify/route.ts` is an unrelated local function. Delete cluster together.
- `scripts/progonq/build-ground-truth.ts` — orphan-file — **HIGH/delete** — ~232 LOC. Evidence: `bake-off:ground-truth` and its test resolve to the *wave-gamma-bake-off* namesake; this progonq one is referenced nowhere as importer.

### Dead env vars / feature flags / SQL migrations / scrapers

- `scripts/migrations/008-canal-tariffs.sql` — migration-helper — **HIGH/delete** — ~24 LOC. Evidence: `rg 008-canal-tariffs` → 0 references; real migrations are TS via `lib/migrations/index.ts`; table created inline in `lib/economics/canals/db.ts`. No `.sql` runner exists.
- `scripts/migrations/008-pipedrive-tables.sql` — migration-helper — **HIGH/delete** — ~20 LOC. Evidence: 1 hit (own stale comment pointing to a non-existent TS file); authoritative migration is `lib/migrations/009-pipedrive-tables.ts`.
- `lib/knowledge/sources/imsbc/scraper.ts` — unused-export `ImsbcSection` (line 25) — **HIGH/delete** — ~4 LOC. Evidence: `rg -i ImsbcSection -c` → 1 (def only); explicitly "Legacy interface for backward compatibility"; importers use `scrapeImsbc`/`ScrapedSection`.
- `env:OPENSANCTIONS_API_KEY` (`.env.local.example:30`) — dead-env-var — **HIGH/delete** — ~1 LOC. Evidence: `rg OPENSANCTIONS_API_KEY` in app/lib/components/scripts → 0; integration calls the unauthenticated OpenSanctions tier (no Authorization header). Empty placeholder only.
- `flag:KNOWLEDGE_WAR_RISK_FROM_DB` (`.env.local.example:93`) — dead-feature-flag — **HIGH/delete** — ~5 LOC. Evidence: 16 hits all docs/README/.env; war-risk computed unconditionally from hardcoded `JWC_HRA_ZONES`; the gate is read by zero source. Inert rollback flag for unfinished JWC E3.

### Dead `export` modifiers (refactor — drop `export`, keep symbol)

These are HIGH-confidence that the *export* is unused, but the underlying symbol is still consumed internally, so the action is `refactor` not full delete:

- `lib/knowledge/jwc/adapter.ts` — unused-import `JwcZone` (line 3) — **HIGH/refactor** — ~1 LOC. Type-only import never used in body (`JwcBulletin` on the same line *is* used). Moot if whole file deleted.
- `lib/sailing/readiness-gap.ts` — `parseSpeedKnots`(L79,~8), `classifyVesselByDwt`(L89,~8), `SPOT_IDEAL_MAX_GAP_DAYS`(L36,~1), `VesselInput`(L58,~9) — all **HIGH/refactor**. Each used internally by the live `calculateReadinessGap`; exports consumed only by tests. `pair-analyzer` imports only `calculateReadinessGap`/`detectSpot`.
- `lib/parsing/parse-vessel-helpers.ts` — `extractCiiFromSubject` (L51) — **HIGH/refactor** — ~11 LOC. Called internally at L194 by the live `parseVesselAIResponse`; no external import of the symbol.
- `lib/corpus/build.ts` — `RawMessage` (L11) — **HIGH/refactor** — ~1 LOC. Interface used in-file (RawThread.messages, messageToEmail param); zero external importers.
- `lib/knowledge/embeddings/client.ts` — `TaskType` (L29) — **HIGH/refactor** — ~1 LOC. Type-only, used internally by `embed`'s signature; zero importers including tests.
- `lib/knowledge/embeddings/dry-run.ts` — `DryRunSummary` (L11) — **HIGH/refactor** — ~7 LOC. Used as `logDryRun`'s param type; `pipeline.ts` passes an object literal.
- `lib/knowledge/governance.ts` — `SyncSuccessOpts` (L68) — **HIGH/refactor** — ~8 LOC. Internal param type of `reportSyncSuccess`; callers pass inline literals.
- `lib/knowledge/sources/bimco/adapter.ts` — `SyncBimcoRagResult` (L21) — **HIGH/refactor** — ~3 LOC. Return-type of live `syncBimcoRag`; consumers use inference.
- `lib/knowledge/sources/igc/adapter.ts` — `SyncIgcOptions`(L21,~5), `SyncIgcResult`(L27,~6) — **HIGH/refactor**. Internal option/return types; CLI passes inline objects.
- `lib/knowledge/sources/imsbc/adapter.ts` — `SyncImsbcOptions`(L19,~6), `SyncImsbcResult`(L25,~6) — **HIGH/refactor**. Same pattern; `knowledge:imsbc` consumes via inference.
- `lib/knowledge/sources/jwc/adapter.ts` — `SyncJwcRagOptions`(L20,~4), `SyncJwcRagResult`(L25,~4) — **HIGH/refactor**. Internal types; inline-object callers.
- `lib/knowledge/sources/jwc-yaml/adapter.ts` — `SyncJwcYamlOptions`(L44,~6), `SyncJwcYamlResult`(L50,~5) — **HIGH/refactor**. Internal types; inline-object callers.
- `lib/imo/cii-cache.ts` — `CII_CACHE_TTL_MS` (L5) — **HIGH/refactor** — ~1 LOC. Used internally at L20; zero external importers.
- `lib/sailing/port-distances.ts` — `setFuzzyCorpus` (L1134) — **HIGH/delete** — ~3 LOC. Whole-word `rg` → 1 (def only); never imported; `getFuzzyCorpus` already manages the state. (Truly dead export, not just modifier.)
- `components/dashboard/DashboardFreshMatches.tsx` — `FreshMatchItem` (L4) — **HIGH/refactor** — ~1 LOC. Used in-file by props; page passes structurally-typed inline data.
- `components/dashboard/DashboardTodoSection.tsx` — `TodoCard` (L5) — **HIGH/refactor** — ~6 LOC. Used in-file at L25; barrel doesn't re-export, consumers untyped.
- `components/market/KpiCard.tsx` — `UnavailableState`(L44,~33), `KpiCardProps`(L33,~10) — **HIGH/refactor**. Both used internally; consumers import only `KpiCard`/`KpiData`/`fetchWithTimeout`.
- `components/market/MarketKpiTile.tsx` — `MarketKpiTileDelta`(L8,~5), `MarketKpiTileProps`(L14,~13) — **HIGH/refactor**. Internal prop-shape types; consumers pass inline literals.
- `components/match/ExplainDealModal.tsx` — `Language` (L17) — **HIGH/refactor** — ~1 LOC. Used internally (Props.language, isRtl); zero external importers.
- `components/match/MatchDetailPanel.tsx` — `MatchDetailPanelProps` (L10) — **HIGH/refactor** — ~1 LOC. Annotates 3 in-file functions; consumer builds untyped `panelProps`.
- `components/match/RouteMapButton.tsx` — `RouteMapButtonProps` (L17) — **HIGH/refactor** — ~13 LOC. Used in-file; component itself only test-referenced (separate concern).
- `components/upgrade/UpgradeTierCard.tsx` — `UpgradeTierCardProps` (L8) — **HIGH/refactor** — ~8 LOC. Used at L24; consumer imports only the component value.
- `components/deals/SubsCountdownWidget.tsx` — `SubsCountdownWidgetProps` (L13) — **HIGH/refactor** — ~1 LOC. Used in-file (L29/86); 8 importers all pull the default component, never the type.
- `components/dashboard/WhileYouWereAwayCard.tsx` — `WhileYouWereAwayCardProps` (L12) — **HIGH/delete** — ~8 LOC. Zero references outside its own file, not even the test (test passes inline props). (The component+`WhileYouWereAwayCard` export are MEDIUM/test-only — see below.)
- `components/mobile/FabVoice.tsx` — `FabVoiceState`(L6,~1), `FabVoiceProps`(L8,~13) — **HIGH/delete**. Zero external refs; test re-declares a local `FabVoiceStateLocal` and passes inline props. (File itself is MEDIUM/test-only.)
- `components/ui/button.tsx` — `buttonVariants` (L60) — **HIGH/refactor** — ~1 LOC. Used internally by `Button`'s CVA; zero importers (the `export *` hit is the separate design-system Button).
- `components/ui/badge.tsx` — `badgeVariants` (L52) — **HIGH/refactor** — ~1 LOC. Used internally by `Badge`; zero external importers.
- `components/ui/progress.tsx` — `ProgressLabel`(L57,~9), `ProgressValue`(L67,~12) — **HIGH/delete**. shadcn boilerplate never rendered or imported anywhere.
- `components/ui/card.tsx` — `CardFooter`(L82,~12), `CardAction`(L59,~12), `CardDescription`(L49,~10) — **HIGH/delete**. shadcn boilerplate; importers use only `Card`/`CardHeader`/`CardTitle`/`CardContent`.
- `components/ui/toast/index.ts` — `ToastItem`(L3,~1), `ToastVariant`(L3,~1) — **HIGH/refactor**. Barrel type re-exports with zero consumers; underlying types used internally (toast-container imports `ToastVariant` directly from `./toast-context`).
- `app/api/matches/[id]/route.ts` — unused-import `estimateFreightRate` (L10) — **HIGH/refactor** — ~1 LOC. Imported but never called; handler uses `computeEstimatedTce` (same import line, in use). `estimateFreightRate` stays live in `tce-calculator.ts`.
- `app/processing/page.tsx` — unused-import `PipelineStepGroup` (L7) — **HIGH/refactor** — ~1 LOC. Type-only import, never referenced; `eslint-disable` masked it. `PipelineStep` (same line) is used, so drop only this binding.
- `lib/jobs/process-email.ts` — unused-import `emitMatchCreated` (L1) — **HIGH/refactor** — ~1 LOC. Imported but never called; body uses only `emitJobUpdate`. Function stays live in `event-emitter.ts`.

---

## MEDIUM — review needed

Confirmed dead-for-production, but referenced by meaningful tests, or env/flag-gated with the gate set in no committed environment. Delete the source **together with** its tests, or treat as deferred/dormant infrastructure.

### Orphan files — test-only meaningful (delete file + its test)

- `lib/email/templates/roi-report.ts` — orphan-file + unused-export `generateRoiReportEmail` — **MEDIUM/delete** — ~71 LOC. Only `lib/__tests__/roi-report-email.test.ts` and an RC3 regression test import it; no production sender.
- `lib/knowledge/jwc/adapter.ts` (`refreshJwc`) — orphan-file + unused-export — **MEDIUM/delete** — ~198 LOC. Slug dispatcher cannot resolve `jwc`; only `adapter.test.ts` imports it. Superseded by `sources/jwc` + `jwc-yaml`.
- `lib/knowledge/jwc/parser.ts` (`parseJwcYaml`) — orphan-file — **MEDIUM/refactor** — ~104 LOC. Reached only via the dead `refreshJwc` + `parser.test.ts`; live JWC uses `jwc-yaml/adapter`. Delete with `adapter.ts` + both tests.
- `lib/knowledge/sources/bimco/chunker.ts` (`chunkBimco`) — orphan-file + rag-helper — **MEDIUM/delete** — ~105 LOC. Adapter converts `BIMCO_FIXTURE_CLAUSES` inline and never imports the chunker; only `bimco-chunker.test.ts` (19 refs). Sibling adapters DO wire their chunkers.
- `components/dashboard/TrafficLight.tsx` (`TrafficLight`) — orphan-file — **MEDIUM/delete** — ~20 LOC. Only importer is the orphan `PriorityCard` + its test. Delete with `PriorityCard` and both tests.
- `components/dashboard/MarketIntelligence.tsx` — orphan-file + unused-export — **MEDIUM/delete** — ~55 LOC. Two test files only; dashboard renders an inline `<Link href="/market">` instead.
- `components/dashboard/PriorityCard.tsx` (`PriorityCard`) — orphan-file — **MEDIUM/delete** — ~34 LOC. Only its own test imports it; page builds `priorityCards` data inline and renders `DashboardTodoSection`.
- `components/dashboard/InboxBreakdown.tsx` — orphan-file + unused-export — **MEDIUM/delete** — ~29 LOC. Only `InboxBreakdown.test.tsx`; e2e 'Full Inbox Breakdown' string is a coincidental non-match.
- `components/dashboard/DashboardInboxSection.tsx` — orphan-file + `DashboardInboxSection`(L28) + `InboxCounts`(L4) — **MEDIUM/delete** — ~88 LOC. Only `DashboardSections.test.tsx`; not in barrel, not in page.
- `components/dashboard/RoiSummaryTile.tsx` — orphan-file + unused-export — **MEDIUM/delete** — ~123 LOC. Only test files; dashboard page never imports it; `NEXT_PUBLIC_ROI_GUARANTEE_ENABLED` set nowhere.
- `components/dashboard/WhileYouWereAwayCard.tsx` — orphan-file + `WhileYouWereAwayCard`(L24) — **MEDIUM/delete** — ~46 LOC. Only `tests/dashboard/wywa-card.test.tsx`.
- `components/mobile/BottomSheet.tsx` — orphan-file + `BottomSheetSnapPoint`/`BottomSheetProps` — **MEDIUM/delete** — ~177 LOC. Only jest test; real mobile sheet is `MatchDetailMobileSheet`; e2e `open-match-details` testid never rendered.
- `components/mobile/FabVoice.tsx` — orphan-file — **MEDIUM/delete** — ~152 LOC. Only `FabVoice.test.tsx`; whole `components/mobile/*` set unwired (bottom-nav never built).
- `components/mobile/SwipeCard.tsx` — orphan-file + `SwipeCardProps` — **MEDIUM/delete** — ~84 LOC. Only `SwipeCard.test.tsx`.
- `components/economics/VoyageBreakdownChart.tsx` — orphan-file + unused-export — **MEDIUM/delete** — ~82 LOC. Only `voyage-breakdown-chart.test.tsx`; `EconomicsTab` imports `RouteCompareModal`, not this.
- `components/deadlines/SubsCountdown.tsx` — orphan-file + `SubsCountdownProps` — **MEDIUM/delete** — ~125 LOC. v1 superseded by `components/deals/SubsCountdownWidget.tsx`; only its hydration test imports it.
- `components/agent/ApprovePlanModal.tsx` — orphan-file + `ApprovePlanModal`(L28) + `ApprovePlanModalProps`(L18) — **MEDIUM/delete (props: refactor)** — ~192 LOC. Only co-located test; no agent page mounts the β-11 modal.

### Scripts — test-only / dormant (review before delete)

- `scripts/auto-prequote-cron.ts` — orphan-file — **MEDIUM/refactor** — ~100 LOC. Only `cron-demo.test.ts` imports `runAutoPrequoteCron`; no systemd unit exists (header comment aspirational). `AUTO_PREQUOTE_DEMO` gate set nowhere. Either wire the missing unit or delete with test.
- `scripts/check-deadlines.ts` — orphan-file — **MEDIUM/keep** — ~115 LOC. Beta cron stub; 3 test files exercise `initDb`/the binary; `loadActiveDeadlines` returns `[]` pending issue #180. Keep until #180; delete with tests.
- `scripts/data-integrity-check.ts` — orphan-file — **MEDIUM/refactor** (isDeadConfirmed=false) — ~297 LOC. *Ruled alive* — see Ruled-alive section.
- `scripts/wave-gamma-bake-off/analyze-degraded.ts` — orphan-file — **MEDIUM/delete** — ~401 LOC. Only `__tests__/analyze-degraded.test.ts`; CLI entry `cli.ts` never imports it; siblings have npm scripts, this one doesn't.
- `scripts/migrate-charterers-xss.ts` — orphan-file — **MEDIUM/delete** — ~101 LOC. Completed one-off XSS remediation; only `migrate-charterers-xss.test.ts` spawns the binary; migration runner uses a static TS array, not a `scripts/` scan. Delete with test.
- `scripts/seed-bimco-clauses.ts` — orphan-file — **MEDIUM/delete** — ~28 LOC. Superseded by `cron/refresh-bimco-rag.ts` path; only `RC-bimco-seed.test.ts` reads the file as text (existence assertion). Delete + update that test.
- `scripts/sentinel-scan.ts` — orphan-file — **MEDIUM/keep** — ~137 LOC. Two test files import `main`/`runSentinelScan`; no prod wiring (`SENTINEL_DEALS_DB` set nowhere). Keep, or remove script+tests+docs together if sentinel is dropped.
- `scripts/progonq/run-progonq-match.ts` — orphan-file — **MEDIUM/keep** — ~256 LOC. Zero automated reachability, but is the documented generator for committed baseline fixtures the live regression tests assert against. Keep; wire to an npm script to make liveness explicit.
- `scripts/progonq/run-draft-quote.ts` — orphan-file — **MEDIUM/keep** — ~174 LOC. Manual eval runner; depends on `judge-draft-quote` (not vice-versa); has its own corpus dir. Keep unless draft-quote eval retired.
- `scripts/progonq/judge-explain-deal.ts` — orphan-file — **MEDIUM/keep** — ~376 LOC. CLI dead, but `judge-explain-deal.test.ts` imports runtime fns and `run-explain-deal.ts` type-imports `RunResult`/`ExpectedCriteria`. Keep / refactor as manual-eval tool.
- `scripts/progonq/judge-parse-vessel.ts` — orphan-file — **MEDIUM/refactor** — ~223 LOC. CLI dead, but `judge-parse-vessel.test.ts` imports and asserts on the `FLAG_JUDGE` prompt contract. Keep export or remove script+test together.
- `scripts/progonq/score-fields.ts` (`compareNumericField`) — orphan-file — **MEDIUM/keep** — ~5 LOC. Live importer is the (itself-orphan) `run-parse-cargo.ts` + own test. Tied to the parse-cargo eval cluster.
- `scripts/generate-port-master.ts` — orphan-file — **MEDIUM/keep** — ~230 LOC. Zero automated refs but is the maintained regeneration tool for the committed `data/ports/port-master.json` loaded by production. Keep; anchors a tested 4-file helper cluster.

### Adapters — dead `export` modifiers / legacy paths (test-only)

- `lib/onboarding/demo-seed.ts` — `getSeededCount`(L116), `getSeededEmails`(L125) — **MEDIUM/keep** — ~16 LOC total. Read-back helpers used only by demo-seed tests; `demo_seed_emails` has no prod reader. Keep as test utilities.
- `lib/corpus/loader.ts` — `clearCorpusCache` (L15) — **MEDIUM/keep** — ~3 LOC. Test-support cache reset; prod route imports only `loadCorpus`/`CorpusNotFoundError`.
- `lib/agent/idempotency.ts` — `_resetIdempotencyCache` (L72) — **MEDIUM/keep** — ~5 LOC. Used by 4 agent test suites (beforeEach reset); deliberate test seam.
- `lib/agent/plan-first.ts` — `setStepHandler`(L73), `resetStepHandlers`(L77), `StepHandler`(L46) — **MEDIUM/keep/refactor** — ~13 LOC. Test mocking seams + an internal type; module alive via `executePlan`/`buildPlan`.
- `lib/migrations/runner.ts` — `getMigrationStatus` (L44, also logged as migration-helper dup) — **MEDIUM/keep** — ~11 LOC. Only `migration-runner.test.ts` Test 6 calls it; sibling exports `ensureMigrationsTable`/`getAppliedVersions` are *alive* (see Ruled-alive).
- `lib/migrations/types.ts` — `down` (interface member) — **MEDIUM/keep** — ~1 LOC. No prod rollback tooling; `.down()` exercised by ~30 migration tests asserting reversibility. Contract surface, not deletable in isolation.
- `lib/market/benchmark.ts` — `_clearCacheForTesting` — *(ruled alive, false)* — see Ruled-alive.
- `lib/parsing/lastcargoes-fallback.ts` — `extractLastCargoesFromBody` (L19) — **MEDIUM/delete** — ~41 LOC. Authored with a test but never wired into `parse-vessel-helpers` (sibling fallbacks ARE wired). Delete module + test, or wire it.
- `lib/notifications/dispatch.ts` — `setDispatcher`(L30), `resetDispatcher`(L34) — **MEDIUM/keep** — ~10 LOC. Test injection/teardown seams used by `sentinel.test.ts`; prod imports only `dispatchNotification`.
- `lib/sailing/port-distances.ts` — `_setSearouteJsonForTest`(L1265), `_setLiveSearouteForTest`(L1285) — **MEDIUM/keep** — ~12 LOC. Tier-2/tier-3 searoute test override hooks with many call sites + afterEach resets.
- `lib/utils/format-port-name.ts` — `formatPortName` (L1) — **MEDIUM/delete** — ~13 LOC. Only `format-port-name.test.ts`; no production caller; ROADMAP feature never integrated. Delete module + test.
- `lib/i18n/rtl-detect.ts` — `detectLocale` (L30) — **MEDIUM/keep** — ~13 LOC. Tested (incl. Arabic-Indic-digit regression); sibling `detectTextDirection` is live in `email-body-viewer.tsx`. Keep for the regression contract.
- `lib/mobile/haptics.ts` — `__HAPTIC_PATTERNS__` (L26) — **MEDIUM/refactor** — ~2 LOC. Test introspection re-export of the private `PATTERNS`; sibling `haptic()` is live. Refactor test to spy on `navigator.vibrate`.
- `lib/email-normalize.ts` — `CORPUS_GEN_DATE` (L14) — **MEDIUM/keep** — ~1 LOC. Test-only constant feeding `recomputeDays`; the live importer (`run-classify.ts`) imports other symbols.
- `lib/explain-deal-validator.ts` — `extractSpecNumbers`(L29), `buildPayloadNumberSet`(L59), `extractAllowedLocationTokens`(L208), `StripResult`(L258) — **MEDIUM/refactor** — internal helpers/types reached in prod via `stripInventedContent`; only the export is test-only. `ValidationResult`(L233, **refactor**), `validateExplainDealResponse`(L242, ~16, **delete**), `buildRetryPrompt`(L360, ~19, **delete**) — the latter two are genuinely test-only with no internal prod caller.
- `lib/market/bdi-adapter.ts` — `parseBdiCsv` (L28) — **MEDIUM/refactor** — ~20 LOC. `@deprecated` stooq CSV path; live path uses `parseBdiHtml`; only `bdi-adapter.test.ts`.
- `lib/market/bhsi-adapter.ts` — `parseBhsiHtml` (L37) — **MEDIUM/refactor** — ~26 LOC. Export consumed only by test; function alive via `refreshBhsi` (systemd cron). Drop export or keep for test.
- `lib/market/bci-adapter.ts` — `parseBciHtml` (L35) — **MEDIUM/refactor** — ~25 LOC. Same pattern as bhsi; alive via `refreshBci`.
- `lib/market/drewry-adapter.ts` — `parseWciHtml` (L37) — **MEDIUM/refactor** — ~21 LOC. Same; alive via `refreshDrewryWci` (cron). Export consumed only by the PI2 test.
- `lib/knowledge/flags.ts` — `ftsTableForSource`(L37), `vecTableForSource`(L46) — **MEDIUM/keep** — ~5 LOC each. Prod uses hardcoded table-name literals; only `flags.test.ts` imports (rag tests mock the module). `KnowledgeBackend`(L12, **refactor**) — type used internally by live `knowledgeBackend()`, zero importers.
- `lib/knowledge/embeddings/pipeline.ts` — `EmbedAndStoreOptions` (L27) — **MEDIUM/refactor** — ~7 LOC. Internal param type; all callers pass inline literals; the one test mention is a description string.
- `lib/knowledge/embeddings/retriever-sqlite.ts` — `RankedDoc`(L140), `RrfMergeOptions`(L151) — **MEDIUM/refactor** — ~11 LOC total. Re-exported via `retriever.ts`, consumed only by `retriever-rrf-merge.test.ts`; used internally by `rrfMerge`/`retrieve`.
- `lib/knowledge/governance.ts` — `getSourceStatus` (L279) — **MEDIUM/refactor** — ~4 LOC. State read-back helper used only by 2 governance tests. (`SyncSuccessOpts` is HIGH/refactor above.)
- `lib/knowledge/embeddings/client.ts` — `embed` (L41) — *(ruled alive, false)* — see Ruled-alive.

### Vertex backend + env/flag (dormant infrastructure — gate set nowhere)

- `lib/knowledge/embeddings/retriever-vertex.ts` — ai-vertex-shim `retrieve`(L44) + whole module — **MEDIUM/refactor** — ~172 LOC. Reachable only when `KNOWLEDGE_BACKEND=vertex`, set in zero committed env/deploy/CI; runbook stale; only a 489-line test exercises it. Vertex was rolled back 2026-05-17. Remove with its test + the vertex dispatch branch, pending operator confirmation of the live VPS env.
- `env:VERTEX_ENGINE_IMSBC` (+IGC/JWC/BIMCO siblings) — dead-env-var — **MEDIUM/keep** — ~4 LOC. Read only by the dead vertex retriever; gate never enabled. Intentional dormant flags; do not delete in isolation from the Vertex backend.
- `env:VERTEX_SEARCH_PROJECT` — dead-env-var — **MEDIUM/keep** — ~0 LOC. Same dormant Vertex cluster + the orphan seed script.
- `flag:KNOWLEDGE_BACKEND` (vertex activation value) — dead-feature-flag — **MEDIUM/refactor** — ~3 LOC. The `'vertex'` branch is un-activatable in any deployment; the `'sqlite'` default read is alive in 5 routes. Refactor away the vertex half, keep the flag + default.
- `env:RESEND_API_KEY` — dead-env-var — **MEDIUM/keep** — ~1 LOC. Read by the alive `sendAlertEmail` but the email branch no-ops (key set nowhere; double-gated with `ALERT_EMAIL_TO`). Documented as deferred F8 (awaiting resend.com). Keep.
- `env:NEXT_PUBLIC_DEMO_MODE` (`.env.demo:7`) — dead-env-var — **MEDIUM/delete** — ~1 LOC. Set in `.env.demo` but read by zero code; the demo feature reads server-side `DEMO_MODE` only.

---

## LOW — keep (FYI)

No verdicts were classified as confirmed-dead at LOW confidence — all LOW-confidence verdicts resolved to `isDeadConfirmed=false` and appear in the Ruled-alive section below. (LOW count = 0.)

---

## Ruled alive (false positives discarded)

54 verdicts were demoted to alive after the adversarial pass found a real survival vector. These show the verification caught finder over-reach.

### Build-time data pipeline (manual CLI tooling for committed artifacts)

- `scripts/port-targets.ts` — survives: curated input source-of-truth for `generate-port-master.ts` → `data/ports/port-master.json` (git-tracked, loaded by `lib/sailing/port-master.ts`). Finder's claimed `lib/sailing/port-targets.ts` does not exist.
- `scripts/lib/match-targets.ts` — survives: 2 non-test sibling importers (`generate-port-master.ts`, `llm-enrich.ts`) — finder undercounted to 1; origin of the `SkeletonPort` type.
- `scripts/lib/unlocode-parse.ts` — survives: `parseUnlocodeRow` called at `generate-port-master.ts:80`; 2 type consumers + tests.
- `scripts/lib/llm-enrich.ts` — survives: `enrichPortsBatch` called at `generate-port-master.ts:156/190`; live CLI importer.
- `scripts/demo-seed/build.ts` — survives: documented operator remediation cited in 2 runtime error strings (`lib/demo-mode-validator.ts`, `lib/demo-mode.ts`); regenerates committed `data/demo-seed.db`.
- `scripts/demo-seed/analyze.ts` — survives: exports statically imported+called by `build.ts`; `DEMO_MODE` is a live feature.
- `scripts/data-integrity-check.ts` — survives: spawned by `data-integrity-check.test.ts` (6 behavioral assertions); test-only meaningful contract.

### progonq eval cluster (test-imported runtime helpers)

- `scripts/progonq/run-parse-cargo.ts` — survives: `score-items.test.ts` imports `scoreItems`/`normalizePort`/`extractItems`.
- `scripts/progonq/run-parse-vessel.ts` — survives: `score-vessel.test.ts` imports 4 runtime fns; finder searched only "non-progonq".
- `scripts/progonq/run-classify.ts` — survives: `score-classify.test.ts` imports `scoreClassification`/`scoreNormalized`.
- `scripts/progonq/judge-draft-quote.ts` — survives: type-imported by `run-draft-quote.ts` + tested runtime fns.
- `scripts/progonq/judge-match.ts` — survives: manual eval judge serving the live `run-match` corpus pipeline (kept, low confidence on death).
- `scripts/progonq/judge-parse-cargo.ts` — survives: `judge-parse-cargo-retry.test.ts` imports the resilience-layer exports.
- `scripts/progonq/judge-parse-recap.ts` — survives: intentional manual eval CLI paired with `run-parse-recap`; kept.

### Knowledge / RAG layer (internal callers, barrels, live retriever default)

- `lib/knowledge/embeddings/retriever-test-helper.ts` (×3 verdicts) — survives: `retriever.test.ts` requires `sortAndReturn` (18 call sites). Test-only but live.
- `scripts/knowledge/validate-data-files.ts` — survives: `validateTopPorts`/`checkRegionalDistribution`/`Port` imported by `top-200-ports.test.ts`, run under required CI `npm test`. (Recommend refactoring out the genuinely-dead validators within.)
- `lib/knowledge/embeddings/client.ts` (`embed`) — survives: called internally by live `embedDocuments`/`embedQuery`.
- `lib/knowledge/alerts.ts` (`sendAlertEmail`) — survives: invoked by `fireAlert` (called in prod `governance.ts:143/269`).
- `lib/knowledge/sources/psc/psc-adapter.ts` (`PscRecord`) — survives: return type of live `fetchPscHistory` (used by prod route); finder's `grep -v cii-` mistakenly... (n/a — finder excluded the file's own usage).
- `env:KNOWLEDGE_BACKEND` (×3 verdicts) — survives: read on every prod `retrieve()` via 4 API routes; selects the live `sqlite` default. Only the vertex *value* is dormant.
- `env:VERTEX_USE_ENTERPRISE_EXTRACTIVE` / `flag:VERTEX_USE_ENTERPRISE_EXTRACTIVE` — survives: regression-protective runtime gate (post-2026-05-17 incident) with 4 dedicated tests.
- `flag:VERTEX_ENGINE_IMSBC` — survives: reachable via the vertex dynamic-import + meaningful engine-mapping test contract; dormant, not orphaned.

### Market adapters (internal call via cron)

- `lib/market/bdi-adapter.ts` (`parseBdiHtml`) — survives: called internally by `refreshBdi` (systemd cron + `refresh-market-indices.ts`).

### Migrations / matching / sailing (internal production reach)

- `lib/migrations/runner.ts` (`ensureMigrationsTable`, `getAppliedVersions`) — survive: called by the prod-live `runMigrations`/`getMigrationStatus`.
- `lib/migrations/types.ts` (`MigrationRecord`) — survives: `Pick<MigrationRecord,'version'>` in prod query at `runner.ts:17`.
- `lib/sailing/date-sanity.ts` (`isLaycanValid`, `isOpenDateStale`) — survive: called by `validateDates` → `analyzePair`/`analyzePairs`, reached from 3 prod API routes. Finder's `grep -v date-sanity` masked the in-file callers.
- `lib/sailing/match-scoring.ts` (`idleScorePenalty`, `CONFIDENCE_MULTIPLIERS`) — survive: invoked internally by `applyReadinessScoring`/`computeScoreBreakdown`, imported by the prod matching pipeline.
- `lib/validation/sanctions.ts` (`normalizeFlagToISO2`, `portToCountry`, `countryToBloc`) — survive: all called inside `checkSanctions` (imported by `pair-analyzer.ts`).
- `lib/imo/cii-cache.ts` (`DEFAULT_CACHE_DIR`) — survives: imported+used by `cii-lookup.ts:69` (on the `app/vessel/[id]/page.tsx` path). Finder's `grep -v cii-` excluded the real importer.
- `lib/email-normalize.ts` (`normalizeUrgency`) — survives: called internally by `normalizeRef`, imported by `run-classify.ts`.

### Provider / session / test-seam exports

- `lib/ai-provider.ts` (`buildGeminiSamplingFields`, `buildBedrockSamplingFields`, `buildGeminiHttpOptions`) — survive: called internally at L549/638/516 in the live provider config path (over-exported only).
- `lib/ai-provider.ts` (`callAiVision`/`callAiAudio` openai branches) — survive: reachable fail-loud default arms, test-exercised; removal reintroduces the QA-C2 silent-failure regression.
- `lib/session.ts` (`getSessionCount`) — survives: imported+called by `app/api/health/route.ts` (prod). Finder's over-aggressive grep filter produced a false 0.
- `lib/market/benchmark.ts` (`_clearCacheForTesting`), `lib/validation/equasis-client.ts` (`__resetStubForTests`), `lib/vessel/registry.ts` (`_resetVesselRegistryForTests`) — survive: actively-used test reset/injection seams (deliberate `_`-prefixed hooks).
- `lib/agent/idempotency.ts` (`DEFAULT_TTL_MS`) — survives: internal default-param value for `cacheExecution`/`cacheStep`, reached from `app/api/agent/execute`.

### UI components / popovers (live imports)

- `components/ui/toast/toast-context.tsx` (`useToastItems`), `components/ui/toast` (`useToast`) — survive: `useToastItems` drives `ToastContainer` (mounted globally via `AppShell` → root layout); `useToast` called in `MatchesClient`/`processing` pages.
- `components/ui/PageSkeleton.tsx` (`PageSkeleton`) — survives: imported by 18 `loading.tsx` convention files + `matches/page.tsx`.
- `components/ui/card.tsx` (`Card`), `components/ui/button.tsx` (`Button`), `components/ui/badge.tsx` (`Badge`), `components/ui/progress.tsx` (`Progress`) — survive: statically imported by 4–8 production files each (Progress is test-only/MEDIUM-keep but not deletable as-is).
- `components/source-quote-popover.tsx` (`getContextSnippet`) — survives: called internally by `SourceQuotePopover` (reached via `clickable-field.tsx`); export is the test seam.

### Env vars / feature flags (set out-of-repo / live gates)

- `env:EXPLAIN_DEAL_ENABLED` / `flag:EXPLAIN_DEAL_ENABLED` — survive: live request-time server gate; ROADMAP records it set `=true` on prod 2026-05-19. Prod env is the gitignored `.env.local`.
- `env:MATCHES_ENABLED` — survives: live gate in 6 prod files; ROADMAP records `=true` on prod 2026-05-19; sibling flags follow the same pattern.
- `env:ROUTE_MAP_ENABLED` — survives: runtime gate in `generate-route-map/route.ts`; operator-settable optional feature (dormant, not dead).
- `env:ROUTE_MAP_GCS_BUCKET` — survives: live optional-config knob branching data-URL vs GCS upload inside the prod route handler.
- `env:IGC_SOURCE_URL` / `env:IMSBC_SOURCE_URL` — survive: read by `syncIgc`/`syncImsbc` backing the live `knowledge:igc`/`knowledge:imsbc` npm scripts; documentation gap (absent from `.env.local.example`), not dead code.
- `env:EMAIL_PARSE_R4_ENABLED` — survives: request-time gate in `getClassifyPrompt` (barrel-exported, called in `POST /api/ai/classify`); operator-toggleable via `.env.local`.
- `env:ALERT_EMAIL_TO` — survives: reachable read on the `fireAlert`→`sendAlertEmail` prod path; gate set nowhere in-repo but the feature is deferred-on-purpose.
- `env:OPENAI_API_KEY` — survives: read at `seed-port-da.ts:101`, executed on every deploy via `deploy-vps.sh:32`; optional LLM gap-fill.

---

## Methodology & limitations

- **Adversarial verification per target.** Each finding was independently re-checked against all 9 survival vectors with concrete `rg` queries (counts recorded in each verdict's evidence). This caught 54 false positives — notably finders that excluded a symbol's own declaring file with `grep -v <basename>` and thereby missed internal call sites (`date-sanity`, `cii-cache`, `session.ts`, `match-targets`, `llm-enrich`), and finders that treated absence from `.env.local.example` as proof an env var is never set (the real prod env is the gitignored `.env.local`, applied via `pm2 restart --update-env`).
- **`unused-export` ≠ dead code.** A large share of HIGH findings are dead `export` *modifiers* on symbols still consumed internally (RAG adapter option/result types, `*Props` interfaces, shadcn CVA helpers). These carry `recommendation: refactor` (drop `export`), not `delete`; the LOC saved is ~1 per modifier. The big LOC wins are the standalone CLI/eval scripts and the dead dashboard/mobile component clusters.
- **Coverage caveats.** Large modules (`lib/ai-provider.ts`, `lib/sailing/*`, `lib/knowledge/**`) were sampled at the export level rather than line-by-line; only the flagged exports were adjudicated, so absence from this report is not proof a symbol is alive. The progonq/eval and port-master toolchains are deliberately manual-invocation tools absent from `package.json`/CI by design — several are kept despite zero automated reachability because they regenerate committed artifacts or back regression-test fixtures; operator confirmation is advised before deleting any "keep"-flagged script.
- **Migrations & prod-applied DDL.** The two `scripts/migrations/*.sql` files are safe to delete only because the real migration runner is the static TS array in `lib/migrations/index.ts` and these SQL files are loaded by nothing. **General rule: a migration that has been applied in production must never be deleted even if code-unused** — its historical record matters for the schema-version chain. The two flagged `.sql` files are duplicates/leftovers, not applied migrations.
- **Test deletions.** Every MEDIUM "delete" recommendation for a test-only orphan implies deleting the accompanying test file(s) in the same change; deleting source alone would break the suite.
- **Vertex backend.** The entire `retriever-vertex.ts` + `VERTEX_*` env surface + `KNOWLEDGE_BACKEND=vertex` branch is dormant (rolled back 2026-05-17) but intact and test-covered. Treat as one removable unit if Vertex is permanently retired; do not delete piecemeal.