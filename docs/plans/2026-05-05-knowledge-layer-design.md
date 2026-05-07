# Knowledge Layer для Quantika Demo — Design Document

**Дата**: 2026-05-05
**Статус**: Approved (брейнсторм завершён, готовится implementation plan)
**Горизонт**: 2-3 месяца до пилота
**Автор**: Виталий + Claude (brainstorming session)

---

## 1. Цель и контекст

Quantika Demo переходит из формата «полированное демо» в production-grade инструмент для freight forwarders. Первый пилот — через 2-3 месяца. На пилоте все источники данных должны быть «настоящими»: устаревшие или сфабрикованные цифры (war-risk 0.075% для Red Sea, demo-фикстуры вместо OFAC, ручной ввод distances) разрушат доверие сразу.

**Knowledge Layer** — фундамент для работы со всеми регуляторными, рыночными и справочными данными приложения с единым governance-контуром.

### Источники данных (8 штук)

| #   | Источник                              | Категория  | Refresh cadence          |
| --- | ------------------------------------- | ---------- | ------------------------ |
| 1   | OFAC + EU Consolidated Sanctions      | sanctions  | daily (auto)             |
| 2   | Distance Tables (searoute-py + cache) | reference  | yearly                   |
| 3   | JWC Listed Areas (war risk zones)     | regulatory | quarterly (manual)       |
| 4   | ECA Zones (MARPOL Annex VI)           | regulatory | rare (one-shot)          |
| 5   | Panama Canal Tariffs                  | regulatory | yearly (manual)          |
| 6   | UN/LOCODE (port directory)            | reference  | bi-annual                |
| 7   | IMSBC Code (для RAG)                  | regulatory | bi-annual amendments     |
| 8   | IGC Grain Code (для RAG)              | regulatory | bi-annual amendments     |
| 9   | Baltic Indices (TradingEconomics)     | market     | weekly (manual или auto) |
| 10  | (Опционально) HandyBulk route fixings | market     | weekly                   |

### Бюджет на data feeds: $0/мес

Все «платные» источники имеют бесплатные легитимные альтернативы (см. research-агенты от 2026-05-05):

- AtoBviaC ($200/мес) → **searoute-py** (Apache-2.0)
- Baltic API ($500/мес) → **TradingEconomics free tier**
- IGC PDF ($50) → **IMO MSC.23(59) с публичного CDN**

Vertex AI embeddings — из `quantika-demo-2026` GenAI App Builder credit ($900 до 2027-04-15).

---

## 2. Архитектура верхнего уровня

```
CONSUMERS (без изменений)
ai/match · voyage/tce · compare-routes · sanctions · war_risk · port-da · L5C · MPP
        │
        │ читают через узкие хелперы
        ▼
ACCESS LAYER (тонкий, ~200 строк)
• getDistance(origin, dest, route?)
• retrieveRagChunks(query, source_filter)
• isSanctioned(name)
• getPortInfo(locode), getWarRiskRate(zone), ...
• citation metadata для UI
        │
        ├──► DOMAIN TABLES (structured rows)
        │    port_distances, port_master, ofac_entities, war_risk_zones,
        │    port_da_estimates, bunker_prices, baltic_indices, eca_zones,
        │    cargo_profiles, l5c_matrix
        │
        └──► sqlite-vec + FTS5 (vector chunks)
             imsbc_chunks (+vec, +fts), igc_chunks, jwc_chunks, advisories
             Vertex AI embeddings (text-multilingual-embedding-002)
        │
        ▼
GOVERNANCE: knowledge_sources (meta-table)
freshness · version · status · refresh_command
→ /admin/knowledge dashboard
→ daily cron только для sanctions
→ manual triggers npm run knowledge:refresh <slug>
```

### Принципы

1. **Endpoints не знают про Knowledge Layer напрямую** — зовут хелперы из `lib/knowledge/index.ts`.
2. **Каждый адаптер свободен** реализоваться как удобно. Главное — после успешного refresh вызвать `markSourceFresh('source-slug', metadata)`.
3. **searoute-py живёт отдельным Python-сервисом** на VPS (FastAPI, 1 endpoint, systemd). Next.js зовёт через internal HTTP. Cache в SQLite `port_distances`.
4. **Vector store — sqlite-vec** рядом с основной `quantika.db`. Embeddings через Vertex AI `text-multilingual-embedding-002`.
5. **Governance meta-table — единственная точка** для dashboard, alerts, freshness-проверок. Не для бизнес-логики.

---

## 3. Schema: `knowledge_sources` meta-table

```sql
CREATE TABLE knowledge_sources (
  -- Identity
  slug              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL,            -- 'structured_rows' | 'vector_chunks' | 'mixed'
  category          TEXT NOT NULL,            -- 'regulatory' | 'market' | 'reference' | 'sanctions' | 'geo'

  -- Provenance
  source_url        TEXT,
  license           TEXT,
  upstream_version  TEXT,
  fetched_at        DATETIME,
  parsed_at         DATETIME,

  -- Freshness
  last_synced_at    DATETIME,
  stale_threshold_days INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'unknown',
  last_error        TEXT,
  consecutive_failures INTEGER DEFAULT 0,

  -- Operations
  refresh_command   TEXT,
  refresh_mode      TEXT NOT NULL,            -- 'auto-daily' | 'auto-weekly' | 'manual' | 'one-shot'
  freshness_check_sql TEXT,

  -- Storage hints
  primary_table     TEXT,
  vector_table      TEXT,
  row_count         INTEGER,

  -- Multi-tenant ready
  tenant_scope      TEXT DEFAULT 'global',

  -- Metadata
  metadata          JSON,

  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ksources_status ON knowledge_sources(status);
CREATE INDEX idx_ksources_category ON knowledge_sources(category);

CREATE TABLE knowledge_sync_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source_slug       TEXT NOT NULL REFERENCES knowledge_sources(slug),
  started_at        DATETIME NOT NULL,
  finished_at       DATETIME,
  status            TEXT NOT NULL,
  rows_changed      INTEGER,
  duration_ms       INTEGER,
  error_message     TEXT,
  metadata          JSON
);

CREATE INDEX idx_synclog_source_started ON knowledge_sync_log(source_slug, started_at DESC);
```

### Контракт адаптера

```ts
// lib/knowledge/governance.ts
export async function reportSyncStarted(slug: string): Promise<number>;
export async function reportSyncSuccess(
  syncLogId: number,
  opts: {
    rowsChanged?: number;
    upstreamVersion?: string;
    metadata?: object;
  }
): Promise<void>;
export async function reportSyncFailure(syncLogId: number, error: Error): Promise<void>;
```

Никакого общего interface'а у адаптеров нет — есть три функции которые они должны вызвать. Под этим контрактом — свобода.

### Stale thresholds (по умолчанию)

| slug               | refresh_mode | threshold |
| ------------------ | ------------ | --------- |
| ofac, eu-sanctions | auto-daily   | 2 дня     |
| baltic-indices     | manual       | 14 дней   |
| jwc                | manual       | 100 дней  |
| panama-tariffs     | manual       | 365 дней  |
| imsbc, igc         | one-shot     | 800 дней  |
| eca                | one-shot     | 1500 дней |
| unlocode           | manual       | 200 дней  |
| distances          | one-shot     | 365 дней  |

---

## 4. Per-source breakdown

### 4.1 IMSBC Code (vector_chunks)

- **Source**: IMO MSC.268 + amendments. Публичный PDF + HTML на `imorules.com`
- **Storage**: `imsbc_chunks` + `imsbc_vec` (FLOAT[768]) + `imsbc_fts` (FTS5)
- **Ingestion**: HTML scraper по разделам → chunks с metadata → batch embedding → insert
- **Refresh**: one-shot. Re-run при amendment.
- **Consumers**: `ai/match`, L5C, `cargo-profiles.json` enrichment
- **Effort**: ~2-3 дня

### 4.2 IGC Grain Code (vector_chunks)

- **Source**: IMO MSC.23(59) + MSC.552(108) с CDN IMO + HTML imorules.com
- **Storage**: `igc_chunks` + `igc_vec` + `igc_fts`
- **Refresh**: one-shot
- **Consumers**: `ai/match` для grain, `cargo-profiles.json` enrichment (`doa_required`, `min_gm_meters`)
- **Effort**: ~1.5 дня

### 4.3 JWC Listed Areas (mixed: structured + vector)

- **Source**: Lloyd's Market Association quarterly PDF
- **Storage**:
  - **Structured**: `war_risk_zones(zone_id, name, polygon_geojson, transit_rate_pct, hold_rate_pct, jwc_version, effective_from, effective_to)`
  - **Vector**: `jwc_chunks` + `jwc_vec` для контекста recommendation
- **Refresh**: manual quarterly
- **Consumers**: `lib/economics/war-risk.ts`, `compare-routes`
- **Effort**: ~2 дня

### 4.4 OFAC SDN + EU Consolidated (structured_rows, sanctions)

- **Source**: OFAC `sdn.xml` + EU EUR-Lex consolidated XML
- **Storage**: `ofac_entities`, `eu_sanctions_entities`, view `sanction_corpus_view`
- **Refresh**: **auto-daily cron** — единственный auto-режим
- **Consumers**: `lib/sanctions/sentinel.ts` (заменить fixtures)
- **Effort**: ~2 дня

### 4.5 UN/LOCODE (structured_rows)

- **Source**: UNECE bi-annual CSV
- **Storage**: расширение существующего `port_master` с пометкой `source = 'unlocode'`
- **Refresh**: manual 2x/год
- **Consumers**: `lib/ports/resolve.ts` (coverage 120 → 6-8K портов)
- **Effort**: ~1.5 дня

### 4.6 Distance Tables (structured_rows + Python service)

- **Source**: searoute-py (Apache-2.0) + UNLOCODE координаты + waypoints
- **Storage**: `port_distances(origin_locode, dest_locode, route_via, distance_nm, calculated_at, calculator_version)`
- **Service**: Python FastAPI на VPS, systemd
- **Initial seed**: top-200 портов × 3 routes = ~60K rows, ~5 MB
- **Consumers**: `voyage/tce` (опциональный `distanceNm`!), `compare-routes`
- **Effort**: ~3 дня
- **UX win**: пользователь больше не вводит мили вручную при наличии LOCODE

### 4.7 Baltic Indices (structured_rows + light vector)

- **Source**: TradingEconomics free tier (BDI/BCI/BSI/BHSI) + опц. HandyBulk для route fixings
- **Storage**: `baltic_indices(date, index_code, value, source)`, опц. `route_fixings`
- **Refresh**: weekly cron или manual
- **Consumers**: `market_benchmarks`, UI hints
- **Effort**: ~0.5-2 дня (composite — 0.5; route fixings через LLM extraction — 1.5)

### 4.8 ECA Zones + Panama Tariffs (structured_rows)

- **ECA**: MARPOL Annex VI public. `eca_zones(id, name, polygon_geojson, fuel_sulphur_max_pct, effective_from)`. Интеграция в TCE bunker calc. ~1 день.
- **Panama**: ACP public PDF tariff. Расширить `lib/economics/canals/panama.ts` или вынести в `canal_tariffs`. ~0.5 дня.

---

## 5. Vector store + embedding pipeline

### Архитектура

```
lib/knowledge/embeddings/
├── client.ts          # Vertex AI wrapper (единственное место вызовов)
├── pipeline.ts        # generic embed + insert
├── retriever.ts       # hybrid search (FTS5 + vec + RRF)
└── chunks.ts          # типы Chunk, ChunkMetadata

lib/knowledge/<source>/
├── parser.ts          # source-specific HTML/PDF → Chunk[]
├── adapter.ts         # вызывает pipeline.embedAndStore(chunks, '<slug>')
└── seed.ts            # CLI entry: npm run knowledge:refresh <slug>
```

### Vertex AI client

- **Model**: `text-multilingual-embedding-002` (768 dim, мультиязычный — IMSBC EN + UI RU)
- **Task types**: `RETRIEVAL_DOCUMENT` при индексации, `RETRIEVAL_QUERY` при поиске (асимметричные эмбеддинги)
- **Batch**: 250 текстов / запрос (Vertex hard limit), `autoTruncate: false` для логирования обрезанных chunks

### Hybrid retriever

```ts
retrieve(opts: {
  query: string;
  sources?: string[];       // фильтр по slug
  top_k?: number;           // default 5
  hybrid?: boolean;         // default true: FTS5 + vec + RRF (k=60)
  rerank?: boolean;         // default false; Phase 3 — Vertex Ranking API
}): Promise<RetrievedChunk[]>
```

### Chunking conventions

- Один chunk = одна semantic unit (раздел/статья/Schedule×section)
- Целевой размер 200-600 токенов; hard cap 2000
- Без overlap при semantic chunking
- Метаданные ОБЯЗАТЕЛЬНО: `source_slug`, `section`
- Cross-references → `metadata.references`

### Citation pattern

LLM получает chunks с inline-метаданными:

```
[Source: IMSBC, Schedule: IRON ORE FINES, Section: Stowage, page 142]
Iron ore fines shall be carried in...
```

System prompt: `Cite sources inline using [Source: <slug>, <section>] and list all sources at the end.`

UI рендерит ответ с разворачивающимися источниками.

**Критично**: пост-проверка citations — если LLM пишет `[Source: IMSBC §X.Y]`, валидируем что секция реально была в retrieved chunks. Если нет — стрипаем citation или флагаем (защита от галлюцинаций номеров секций).

### Eval

- **30-50 golden Q→A пар** на каждый RAG-источник (`tests/golden/<source>.json`)
- **Recall@5 ≥ 0.80**, **MRR ≥ 0.65**
- **30% запросов на русском** к английскому корпусу (cross-lingual sanity)
- **Regression smoke** в CI: 5 базовых вопросов всегда находят правильный chunk
- `npm run knowledge:eval <source>` — перед merge'ем изменений parser/embedding

### Cost

- IMSBC initial index: $0.012 разово
- IGC initial: $0.003
- JWC initial: $0.001
- Query (10K req/мес): $0.02/мес
- Reranking (Phase 3, опц.): $0.40/мес
- **Итого**: $0.02-0.05/мес. Vertex credit покроет годами.

### Failure modes

- Vertex API недоступен при индексации → пайплайн прерывается, `reportSyncFailure`, manual retry
- Vertex API недоступен при запросе → fallback на FTS5-only (худшее качество, но не падаем)
- Embedding model deprecated → `re-index --model new-model` migration helper

---

## 6. Operations & Dashboard

### Daily cron — только для sanctions

```
systemd timer: */1 day at 04:00 UTC + RandomizedDelaySec=30min
```

Скрипт:

1. Fetch OFAC SDN + EU XML с retry
2. Diff vs previous → log added/removed
3. Upsert `ofac_entities` + `eu_sanctions_entities`
4. `reportSyncSuccess` или `reportSyncFailure`
5. **2 consecutive failures → email + Sentry**
6. Heartbeat endpoint `/api/admin/cron-heartbeat?cron=sanctions` — > 36h без update = CRITICAL

### Manual triggers

```
npm run knowledge:status                # таблица всех источников
npm run knowledge:refresh <slug>        # полный refresh одного
npm run knowledge:refresh-all           # disaster recovery
npm run knowledge:eval <slug>           # golden tests для RAG
npm run knowledge:check <slug>          # freshness_check_sql + row_count
```

### Dashboard `/admin/knowledge`

Один view query:

```sql
SELECT slug, name, category, status, refresh_mode, last_synced_at,
  CAST(julianday('now') - julianday(last_synced_at) AS INTEGER) AS days_since_sync,
  stale_threshold_days,
  CASE
    WHEN last_synced_at IS NULL THEN 'never_synced'
    WHEN julianday('now') - julianday(last_synced_at) > stale_threshold_days THEN 'overdue'
    WHEN consecutive_failures >= 3 THEN 'failing'
    ELSE 'ok'
  END AS health_signal,
  row_count, refresh_command, last_error
FROM knowledge_sources
ORDER BY CASE health_signal WHEN 'failing' THEN 0 WHEN 'overdue' THEN 1 ELSE 2 END, category;
```

Кормит UI (admin route, защищён существующей admin-auth), `GET /api/admin/knowledge-status` (JSON для алертов), `GET /api/health/knowledge` (без auth, для UptimeRobot).

### Алерты — 3 канала

| Событие                               | Severity | Канал               |
| ------------------------------------- | -------- | ------------------- |
| Sanctions cron failed 2× подряд       | CRITICAL | email + Sentry      |
| Любой источник overdue > 2× threshold | WARNING  | weekly digest email |
| Manual refresh failed                 | INFO     | UI message          |
| Cron heartbeat missing > 36ч          | CRITICAL | Sentry              |
| Vertex API auth/quota error           | ERROR    | Sentry              |

### Assistant-driven maintenance loop (Phase 3)

`/loop` skill раз в неделю:

1. Читает `/api/admin/knowledge-status`
2. Если что-то overdue → запускает `npm run knowledge:refresh <slug>`
3. Refresh успешен → молчит; failed → пишет issue/notify

### Что НЕ делаем

- ❌ Generic queue/worker (Bull, BullMQ) — overkill
- ❌ Web UI редактирования — admin задачи через CLI
- ❌ Versioning/rollback в таблицах — backup БД nightly вместо
- ❌ Multi-region replication — single VPS

---

## 7. Phasing & Rollout

### Phase 1 — Foundation + Critical Sources (4 недели)

**Цель**: фундамент + всё юридически/математически критичное.

1. `knowledge_sources` + `knowledge_sync_log` + governance helpers (~2 дня)
2. `/admin/knowledge` dashboard + healthcheck (~1.5 дня)
3. **OFAC + EU sanctions** + daily cron + alerts (~2 дня)
4. **Distances**: searoute-py service + initial seed + миграция `voyage/tce` (~3 дня)
5. **JWC structured zones** + war-risk.ts с реальными ставками (~1.5 дня)
6. **ECA zones** + интеграция в TCE bunker calc (~1 день)
7. **Panama tariffs** обновление (~0.5 дня)
8. Vertex AI embedding client + generic pipeline (без использования) (~1.5 дня)

**Acceptance**:

- Dashboard работает, 5 источников зарегистрированы
- OFAC daily cron 7 дней подряд без интервенции
- TCE без user input для distances при наличии LOCODE
- Red Sea war-risk обновлён до 0.5-1.5% с цитированием JWC version
- Зелёные tests + новые для каждого модуля
- Ни один существующий endpoint не сломан

### Phase 2 — RAG Knowledge & Coverage (3 недели)

**Цель**: vector store + RAG-источники + расширение географии.

1. **IMSBC**: parser → chunks → embed → integration в `ai/match` (RAG заменяет static glossary) (~2.5 дня)
2. **IGC**: parser → chunks → embed → integration для grain + cargo-profiles enrichment (~1.5 дня)
3. **JWC RAG**: bulletins → chunks → embed → integration в `compare-routes` (~1 день)
4. **UNLOCODE expansion**: import + улучшение `lib/ports/resolve.ts` (~1.5 дня)
5. **Baltic indices via TradingEconomics**: free-tier API + weekly cron + UI hint (~0.5 дня)
6. Hybrid search (FTS5 + vec + RRF) активация
7. **Eval golden test sets** для всех 3 RAG (~1.5 дня)
8. **Citation UI** в LLM ответах (~1 день)

**Acceptance**:

- `ai/match` использует IMSBC retrieval, prompt сжат на ~30%
- Recall@5 ≥ 0.80 на golden tests
- `compare-routes` returns explanation с цитированными JWC bulletins
- Port resolution coverage ≥ 95% (vs ~70% до)
- Все RAG-источники в dashboard

### Phase 3 — Polish & Optional (2 недели)

1. **HandyBulk route fixings** scraper + LLM extraction → `route_fixings` (~1.5 дня, опц.)
2. **Vertex AI Ranking API** reranking top-20→top-3 на critical endpoints (~1 день)
3. **Assistant-driven weekly maintenance loop** (~1 день)
4. **Multi-source RAG** combined retrieval IMSBC+IGC+JWC (~1 день)
5. **Documentation**: ADR, runbooks, monitoring guide (~1.5 дня)
6. **Test-skill independent QA pass** в clean session перед production (~2 дня)

**Acceptance**:

- Reranking даёт +5% precision@3 (или признаём что не нужен)
- Loop-mode 2 недели без интервенции
- Adversarial QA: 0 CRITICAL/HIGH findings
- Документация полная

### Календарь (~9 недель)

```
Week 1-2: Phase 1.1-1.4 (governance + sanctions + distances)
Week 3:   Phase 1.5-1.8 (JWC + ECA + Panama + embed infra)
Week 4:   Phase 2.1-2.3 (IMSBC + IGC + JWC RAG)
Week 5:   Phase 2.4-2.6 (UNLOCODE + Baltic + hybrid)
Week 6:   Phase 2.7-2.8 (eval + citation UI)
Week 7:   Phase 3.1-3.4 (rerank + loop + multi-source)
Week 8:   Phase 3.5-3.6 (docs + adversarial QA) + buffer
Week 9:   buffer
```

### Параллелизация (sleep ~30%)

Через `wave-pipeline` skill с **уменьшенным параллелизмом** (max 2-3 спеки одновременно вместо 5+). После governance — distances/sanctions/JWC/ECA/Panama независимы. После embedding pipeline — IMSBC/IGC/JWC-RAG независимы.

### Rollback

- **Phase 1**: feature flags `KNOWLEDGE_LAYER_DISTANCES_ENABLED=false`, `KNOWLEDGE_LAYER_SANCTIONS_REAL=false` → fallback на existing
- **Phase 2**: `RAG_ENABLED=false` → match prompt возвращается к static glossary
- **Phase 3**: pure additions → revert PR

Все legacy таблицы остаются нетронутыми. Knowledge Layer добавляется рядом, не заменяет.

---

## 8. Риски

### Технические

1. **Vertex AI quota / latency на индексации** — 600 req/min free tier. Mitigation: rate-limit + retry with backoff.
2. **searoute-py точность 90-94%** — для топ-20 routes manual sanity check vs known миль. Worst case: feature flag `DISTANCE_OVERRIDE_USER_INPUT=true`.
3. **PDF parsing JWC/MARPOL хрупкий** — parser возвращает `confidence`, низкий → manual review. Golden tests на JWC v2024 и v2025.
4. **Sanctions API rate limit / downtime** — keep-last-good. Если fetch failed → previous corpus остаётся, status='stale'. >3 дня = CRITICAL.
5. **Vertex AI cost surprise** — `dry_run` mode в seed-скриптах + budget alert в GCP проекте $50/день hard cap.

### Продуктовые

6. **RAG молча ухудшает ответы** — A/B на 20-30 реальных запросах после Phase 2. Метрика: blind preference test, не «совпадает с golden».
7. **Точные citations создают новый риск доверия** — pre-validation citations в пост-процессинге.
8. **War-risk 0.075% → 1.5% сломает user expectations** — changelog для пилотных + опц. «было/стало» в UI пару недель.

### Operational

9. **Two-Agent Model обязателен** — adversarial QA в clean session после каждой Phase, иначе авторские LLM-тесты дают false confidence.
10. **Cron silent death** — heartbeat-endpoint, >36ч = CRITICAL, systemd `OnFailure=` → email.

### Open Questions

- **Q1.** Historical versions регуляторных документов — `valid_from/valid_to` где осмысленно. Решить в Phase 2.
- **Q2.** Cross-lingual retrieval — 30% golden queries на русском. Recall@5 ≥ 0.75.
- **Q3.** Cargo-profiles enrichment auto vs manual review — generates patches → manual review → commit. Не auto-merge.
- **Q4.** Когда добавлять источники сверх 8 — каждый новый = issue с `category` + ROI обоснование. Не «на всякий случай».

---

## 9. Что НЕ входит в Knowledge Layer

- Логика TCE/match/compare-routes — остаётся в endpoints
- LLM prompts — вызывают Knowledge Layer для retrieval, но сами prompts отдельно
- User-generated данные (sessions, audit_events, deals)

## 10. Existing tables, регистрируемые в `knowledge_sources` для governance (без новых adapters)

- `bunker_prices` — manual refresh
- `eua_prices` — manual refresh
- `port_da_estimates` — manual refresh, in-house data
- `cargo_profiles` (JSON) — становится живым через IMSBC enrichment

---

## 11. Decisions log

| #   | Решение                                              | Reasoning                                                                      |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| D1  | Production-grade pilot, все 8 источников «настоящие» | Без этого пилот развалится при первой проверке форвардером                     |
| D2  | $0/мес на data feeds                                 | Все «платные» альтернативы покрыты бесплатными legitimate sources              |
| D3  | Подход 3: governance meta-table + free-form адаптеры | Между минимализмом и full abstraction; даёт dashboard без жёсткого interface'а |
| D4  | sqlite-vec вместо Vertex AI Vector Search / Pinecone | Single VPS, минимум depencencies, ~5 MB на все RAG-источники                   |
| D5  | searoute-py через Python microservice                | Apache-2.0, точность 90-94%, бесплатно. Не блокируем Node event loop.          |
| D6  | text-multilingual-embedding-002                      | EN + RU + AR + ZH покрытие, дешевле gemini-embedding-001 в 7.5×                |
| D7  | Hybrid search (FTS5 + vec + RRF) с Phase 2           | Regulatory термины (IMO class 4.2) требуют exact match                         |
| D8  | Daily cron только для sanctions                      | Legal risk если просрочено; всё остальное manual + dashboard                   |
| D9  | Multi-tenant schema-ready, не используется           | Дёшево заложить сейчас, не больно потом                                        |
| D10 | Wave-pipeline с уменьшенным параллелизмом (2-3)      | Безопасность mergeей > скорость. Reviewer cognitive load.                      |
| D11 | Без pause-чекпоинтов между фазами                    | Гоним до конца, исправляем по ходу                                             |

---

## 12. Next steps

1. **Этот документ → commit в branch `design/knowledge-layer-2026-05-05`**
2. **`writing-plans` skill** генерирует детальный implementation plan по Phase 1
3. **`wave-pipeline` или `task-division`** раскладывает Phase 1 на параллельные спеки
4. **Старт Phase 1** — governance meta-table + dashboard как первый PR (фундамент для всех остальных)
