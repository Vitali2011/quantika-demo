# RAG Shipping Refs Expansion — Design Spec

**Date:** 2026-05-21
**Author:** orchestrator-day session (Vitali2011)
**Workspace:** quantika-demo on mikanovich@dev-vps overflow (`quantika-demo-mik` alias)
**Status:** approved, ready for `superpowers:writing-plans` → `subagent-driven-development`
**Roadmap entry:** ROADMAP v2 Lane C, task C1 (RAG sources expansion BIMCO+IGC)

---

## Контекст

Quantika Demo использует RAG для shipping AI (парсеры email-фрахтов, judge eval). Текущие sources: `bimco` (GENCON 2022, HEAVYCON, PROJECTCON), `igc` (International Grain Code), `imsbc`, `psc`, `jwc`, `eca`. Архитектура: TypeScript adapter pattern с structured chunks, Vertex AI 768-dim embeddings, vec0+FTS5 hybrid retrieval, per-source tables (`{slug}_vec`/`{slug}_fts`).

C1 — расширить shipping reference coverage для лучшего парсинга специальных терминов (типы чартеров, gas code требования).

## Business Decisions (одобрено в brainstorm 2026-05-21)

| # | Decision | Rationale |
|---|---|---|
| Q1 | IGC = **оба** Grain (extend existing) + Gas (new adapter) | Разные regulatory regimes, оба нужны для shipping demo |
| Q2 | Content style hybrid: **structured clauses** для NYPE 1946 + SHELLVOY (legally open); **summary** для BALTIME + CONGENBILL (paywalled) | Точный retrieval где можно, legal safety где нельзя |
| Q3 | IGC-Gas — **отдельная таблица** `igc_gas_vec` + migration 030 | Consistency с existing per-source table pattern |
| Approach | **3 sub-PRs sequential** | Targeted review, easy rollback, auto-deploy handles 3 deploys без overhead |

**Copyright policy (cross-cutting):** legally-open sources only — IMO public domain для IGC; pre-1928 charters (NYPE 1946) и Shell.com public templates (SHELLVOY) для structured. Wikipedia + academic summaries для recent paywalled (BALTIME, CONGENBILL). Если adapter обнаружит что нужный документ доступен ТОЛЬКО через paywall — skip + write reason в `QUESTIONS.md`.

---

## Architecture

3 sub-specs → 3 worktrees → 3 PRs sequential.

| Sub-spec | Worktree | Branch | Migration | Est size |
|---|---|---|---|---|
| **C1a** BIMCO +4 charters | `.worktrees/c1a-bimco-extend` | `feat/c1a-bimco-charters` | no | ~6 files (M-tier) |
| **C1b** IGC-Grain chapters extend | `.worktrees/c1b-igc-grain-extend` | `feat/c1b-igc-grain-chapters` | no | ~3-4 files (S/M-tier, conditional) |
| **C1c** IGC-Gas new adapter + migration | `.worktrees/c1c-igc-gas-new` | `feat/c1c-igc-gas-adapter` | yes (030) | ~10 files (M/L-tier) |

Deploy order: C1a → C1b → C1c (migration 030 last so prod не получит broken state между PR'ами).

---

## Sub-spec C1a: BIMCO +4 charters

> **Revised 2026-05-21 after code archeology:** initial draft assumed per-charter fixture files; реальная архитектура — single `fixture.ts` со всеми clauses + `CharterPartyType` literal union в `types.ts`. Existing fixtures = mock-style summaries (~30-60 слов, 7 total: GENCON 2022:3, HEAVYCON:2, PROJECTCON:2), not full charter texts. C1a добавляет entries в existing файлы (не создаёт новые), и добавляемые NYPE/SHELLVOY clauses тоже идут как **mock-style summaries** для consistency (10-15 ключевых clauses каждый, не полный текст ~30-40), чтобы соблюдать существующий fixture-stiль и не раздуть один файл.

### Components

| File | Type | Description |
|---|---|---|
| `lib/knowledge/sources/bimco/types.ts` | update | Extend `CharterPartyType` literal union: add `'NYPE 1946' \| 'SHELLVOY 6' \| 'BALTIME' \| 'CONGENBILL'` (4 new) |
| `lib/knowledge/sources/bimco/fixture.ts` | update | Append entries в `BIMCO_FIXTURE_CLAUSES` array: NYPE 1946 (10-15 mock-style clauses), SHELLVOY 6 (10-15), BALTIME (1 summary chunk), CONGENBILL (1 summary chunk) — total ~22-32 new entries |
| `lib/knowledge/sources/bimco/chunker.ts` | update | Extend `VALID_CHARTER_PARTIES` const array на те же 4 значения (синхронизировать с types.ts) |
| `__tests__/lib/knowledge/sources/bimco/bimco-adapter.test.ts` | update | TC-BA-09 — заменить `expect(result.stored).toBe(7)` на динамический расчёт (`BIMCO_FIXTURE_CLAUSES.length`); add 2-3 new TC validating presence of NYPE/SHELLVOY/BALTIME/CONGENBILL entries via charterParty filter |

**Не создаются:** new fixture files, new test file, new adapter, new index.ts. Все 4 файла — update existing.

### Data flow

1. `syncBimcoRag(db)` → читает существующий `BIMCO_FIXTURE_CLAUSES` (now ~29-39 entries вместо 7) → maps to Chunk[] → `embedAndStore` via Vertex 768-dim → existing `bimco_vec` + `bimco_fts` tables (no migration)
2. Smoke retrieval: query `"NYPE time charter withdrawal"` → hit `bimco_fts` (FTS5 BM25) → returns entries с `charterParty: 'NYPE 1946'` в metadata
3. Test mode: TC-BA-10/11 (FTS populated, metadata JSON) уже проверяют structure; новые TC проверяют что отдельные charterParty values присутствуют

### Acceptance

- `types.ts` + `fixture.ts` + `chunker.ts` compile + типы синхронизированы (CharterPartyType ↔ VALID_CHARTER_PARTIES)
- `bimco-adapter.test.ts` все TC проходят (TC-BA-09 updated, новые passing)
- `npm run knowledge:refresh bimco` (или эквивалентный cron путь) — exit 0, governance reportSyncSuccess
- Smoke FTS query (через debug script или e2e test) для каждой из 4 charterParty: ≥1 hit

### Tag: `[code-only]`

---

## Sub-spec C1b: IGC-Grain extend

### Conditional scope

**Subagent FIRST audits**: какие chapters уже в `igc-grain.fixture.ts`. Compare против reference TOC из imorules.com Grain Code.

| Audit result | Action |
|---|---|
| Coverage уже полная (все ключевые chapters present) | Сворачиваемся до "add coverage regression test only" (Tier S) |
| Gaps exist | Update scraper config + re-scrape + regenerate fixture |

### Components (if gaps)

| File | Type | Description |
|---|---|---|
| `lib/knowledge/sources/igc/scraper.ts` | update | Add missing chapter IDs to scrape list |
| `lib/knowledge/sources/igc/igc-grain.fixture.ts` | regenerate | Re-run scraper output |
| `lib/knowledge/sources/igc/__tests__/coverage.test.ts` | NEW test | Assert N chapters present (regression guard) |

### Data flow

1. Run scraper → fresh fixture
2. `npm run knowledge:igc` → re-embed → existing `igc_vec` / `igc_fts`
3. Smoke: query `"grain trimming stress requirements"` → returns relevant chapter chunks

### Tag: `[code-only]`

---

## Sub-spec C1c: IGC-Gas new adapter + migration 030

### Components

| File | Type | Description |
|---|---|---|
| `lib/migrations/030-igc-gas-rag.ts` | NEW migration | Creates `igc_gas_vec` (vec0 768-dim) + `igc_gas_fts` (FTS5); CREATE TABLE IF NOT EXISTS (idempotent) |
| `lib/knowledge/sources/igc-gas/index.ts` | NEW | Adapter entry, exports `chunks` + `metadata` |
| `lib/knowledge/sources/igc-gas/chapters.fixture.ts` | NEW fixture | Ch 1 General + Ch 18 Operating Requirements + Ch 19 Cargo Summary; sections within each chapter as separate chunks (~15-25 total); source: imo.org public docs |
| `scripts/knowledge/cron/refresh-igc-gas-rag.ts` | NEW cron | Mirror `refresh-bimco-rag.ts` pattern (reportSyncStarted → embedAndStore → reportSyncSuccess/Failure) |
| `scripts/knowledge-igc-gas-embed.ts` | NEW script | First-time bootstrap embedding |
| `package.json` | update | `+ "knowledge:igc-gas": "npx tsx scripts/knowledge-igc-gas-embed.ts"` |
| `lib/knowledge/embeddings/retriever-sqlite.ts` | update | Add `'igc_gas_vec'` + `'igc_gas_fts'` к allowed tables array |
| `lib/knowledge/sources/governance.ts` (or registry equiv) | update | `registerSource({slug: 'igc-gas', name: 'IGC Code (Gas Carriers)', kind: 'vector_chunks'})` |
| `scripts/knowledge/cron/__tests__/refresh-igc-gas-rag.test.ts` | NEW test | E2E governance + persistence (mirror existing bimco test) |
| `lib/knowledge/sources/igc-gas/__tests__/fixture.test.ts` | NEW test | Chunk structure + metadata validity |

### Data flow

1. Migration 030 runs on deploy → tables created (idempotent)
2. `npm run knowledge:igc-gas` → reads fixture → Vertex embed → `igc_gas_vec` / `igc_gas_fts`
3. Governance registers source → `/api/admin/knowledge-status` shows new row
4. Retriever query with `vectorTable: 'igc_gas_vec'` returns chunks
5. Smoke: query `"LNG cargo containment IGC chapter 18"` → relevant chapter chunks

### Acceptance

- Migration 030 applies on fresh db (idempotency test)
- `npm run knowledge:igc-gas` completes без ошибок, populates ≥10 chunks
- Cron test passes (mocks Vertex)
- `/api/admin/knowledge-status` returns new `igc-gas` source с health_signal='ok' after seed
- Smoke retrieval test returns ≥1 chunk for "LNG containment" query

### Tag: `[deploy-affects]` (migration + governance touch)

---

## Cross-cutting concerns

### Testing strategy

- **Per sub-spec:** unit tests на fixture structure + cron e2e (mocks Vertex)
- **Cross-cutting smoke** (после всех 3 PR merged + deploy): 4 retrieval queries покрывают все 4 source tables:

| Query | Expected hit | Sub-spec |
|---|---|---|
| `"NYPE time charter withdrawal clause"` | bimco_vec | C1a |
| `"SHELLVOY voyage charter laytime"` | bimco_vec | C1a |
| `"grain stowage trimming bulk cargo"` | igc_vec | C1b |
| `"LNG cargo containment IGC chapter 18"` | igc_gas_vec | C1c |

### Error handling

- **Adapters:** graceful degradation — scraper fail → log + skip update, не падать. Don't break embedding pipeline if 1 source неудался.
- **Migration 030:** idempotent (CREATE TABLE IF NOT EXISTS); safe rollback by drop tables manually (no data loss in dev).
- **Governance:** `reportSyncFailure` on each refresh failure → shows up в `/api/admin/knowledge-status` health_signal.

### Governance entries

| Sub-spec | Governance change |
|---|---|
| C1a | Updates `bimco` row_count после next refresh (no schema change) |
| C1b | Updates `igc` row_count после next refresh (no schema change) |
| C1c | **Adds** new `igc-gas` row entirely (registerSource в migration или cron first run) |

### Deploy coordination

- C1a merge → auto-deploy (no migration, safe)
- C1b merge → auto-deploy (no migration, safe)
- C1c merge → auto-deploy → migration 030 runs as part of deploy.yml seed → tables created → first cron run populates

If C1c merged ПЕРЕД C1a/C1b — нет breakage (sub-specs независимы), но мы соблюдаем sequential для cleaner review.

---

## References (для subagent reading)

- **Adapter pattern:** `lib/knowledge/sources/bimco/gencon-2022.fixture.ts` (existing template)
- **Retriever dispatcher:** `lib/knowledge/embeddings/retriever.ts`
- **Embedding pipeline:** `lib/knowledge/embeddings/pipeline.ts` (`embedAndStore`)
- **Migration template:** `lib/migrations/029-bimco-rag.ts`
- **Cron template:** `scripts/knowledge/cron/refresh-bimco-rag.ts`
- **Cron test template:** `scripts/knowledge/cron/__tests__/refresh-sanctions.test.ts`
- **Admin status endpoint:** `app/api/admin/knowledge-status/route.ts`
- **Allowed tables list:** `lib/knowledge/embeddings/retriever-sqlite.ts`

---

## Next steps (post-approval)

1. Commit this spec as separate **design PR** `docs(superpowers): C1 RAG shipping expansion design spec [code-only]` — single file, fast review
2. После merge — `superpowers:writing-plans` для C1a → produces `docs/plans/2026-05-21-c1a-bimco-charters.md`
3. Dispatch C1a через `subagent-driven-development` (через harness-tracked dispatch.sh + fire-and-forget + CronCreate wake)
4. После C1a PASS + merge → `writing-plans` для C1b → dispatch C1b
5. После C1b PASS + merge → `writing-plans` для C1c → dispatch C1c (last, migration-bearing)
6. После всех 3 merged + deployed → manual cross-cutting smoke (4 retrieval queries)

---

## Out of scope для всей C1

- ❌ Buying BIMCO commercial license
- ❌ Scraping paywalled bimco.org PDFs
- ❌ Changing retriever core architecture (vec0/FTS5 RRF)
- ❌ Replacing Vertex embeddings provider
- ❌ Adding new prompt instructions referencing new sources (separate task — wait until retrieval verified)
- ❌ Cron schedule additions для new sources (manual first-run bootstrap only; cron sched добавляется в отдельной D-lane task)
