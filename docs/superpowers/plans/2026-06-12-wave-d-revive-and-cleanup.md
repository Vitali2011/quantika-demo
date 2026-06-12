# Wave D — Revive (vessel passport, lastcargoes, ROI report) + Dead-Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit section D: revive three dead-but-valuable pieces (real vessel passport on the vessel page; lastcargoes regex-fallback feeding hold-cleanliness; ROI-report surface) and delete ~20 verified-dead items (~1,400 LOC incl. tests).

**Architecture:** Revivals wire existing complete code to existing live data sources — no new engines. Deletions are mechanical with per-item grep-verification of zero live importers (A.6 discipline). jwc-RAG removal is surgical: jwc entries leave shared allowed-lists, bimco entries stay (live clause search).

**Tech Stack:** Next.js 16 + React 19, TypeScript, better-sqlite3, Jest. Branch: `feat/wave-d-revive-cleanup` from main ≥`7499056d`.

**Founder decisions (2026-06-12):** оживить паспорт судна + мелкий пакет (lastcargoes, roi-report); мобильное трио, inbox-кластер, activation-tracker, EmailUploadCTA, ApprovePlanModal — удалить; delete-список резать в этой волне; qa-walker смоук γ-страниц в составе волны.

---

## Verified ground truth (file:line, проверено 2026-06-12 на main 7499056d)

**Revive-цели:**

- `lib/counterparty.ts:8-18` — тип `VesselPassport` (imo, flag{country,parisMou}, class{society,isIacs}, pi{club,isIg}, sanctions, shadowFleet, cii?, psc?{detentions3y}, age?); `:23-73` `getVesselPassport(imo)` — фейковые константы (Bahamas/DNV/Gard/age 10), 0 прод-вызовов.
- Живые источники для паспорта: `ParsedVessel` (lib/types.ts:252-304): `imo`, `flag`, `built`, `classSociety`, `pandi`, `lastCargoes`; хелперы уже импортированы в counterparty.ts: `isIacs` (./sanctions/iacs-members), `isIgClub` (./sanctions/pi-ig-clubs), `getParisMouClassification` (./sanctions/paris-mou), `checkVesselSanctions` (./sanctions/opensanctions — локальный, без сети); `getDetentionCount`/`getDetentionHistory` (lib/market/psc-repository.ts); `lookupCii(imo, {callLlm})` (lib/imo/cii-lookup.ts:68 — ⚠️ без callLlm-стаба уходит в LLM; кэш `.cache/cii` читается ДО датасета).
- Страница судна: `app/vessel/[id]/page.tsx` (1-243) — спеки/рестрикции/last cargoes/матчи; CII уже рендерится `:116-123` через `components/vessel/CiiRatingBadge.tsx`, PSC-ссылка `:125` через `components/vessel/PscHistoryLink.tsx` (гейт NEXT_PUBLIC_PSC_DETENTION_ENABLED). Естественная точка монтажа паспорта — после Specs-карточки (~:186).
- `lib/parsing/lastcargoes-fallback.ts:1-42` — готовый `extractLastCargoesFromBody(body): string | null` (паттерны L/C, last cargoes, P/C, just completed…), 0 вызовов. Маппинг поля: `lib/parsing/parse-vessel-helpers.ts` (`lastCargoes: ...item.last_cargoes...`). Потребители движка: `lib/matching/hold-cleanliness.ts:18` (**no-op без lastCargoes**), `lib/sailing/fit-breakdown.ts:301` (pedigree-скоринг). Бэкфилл-паттерн: `scripts/demo-seed/backfill-charterer.ts` (--dry дефолт, --apply, идемпотентный, result_json items patch).
- `lib/email/templates/roi-report.ts:1-72` — `generateRoiReportEmail(summary: RoiSummary): {subject, body}` (валидация Number.isFinite, готовый plain-text). `RoiSummary` в `lib/analytics/roi-metrics.ts` (+CohortData, RoiMetricsRow — читать файл при имплементации). Email-send поверхности в демо НЕТ — surface = страница-превью.
- `app/page.tsx` рендерит `PublicLanding` — НЕ LandingPageClient и НЕ EmailUploadCTA (оба мертвы, подтверждено).

**Delete-цели (пути + тесты):**

- `lib/knowledge/jwc/{parser,adapter}.ts` (~300 LOC, заменён sources/jwc\*; тестов нет).
- `lib/economics/split-bunker.ts` + `lib/economics/__tests__/split-bunker.test.ts` (заменён bunker-lift/bunker-comparison).
- `components/LandingPageClient.tsx`, `components/connect-gmail-button.tsx` (импортёр только друг друга).
- `app/matches/demo-data.ts` (3 LOC пустышка), `lib/utils/format-port-name.ts` + его тест, `lib/ais/index.ts` (barrel; прямые импорты lib/ais/cache живут — проверить grep'ом).
- `lib/sailing/match-scoring.ts:119-129` — `case 'CONTAINER'` внутри `case 'FCL': case 'LCL':` блока; типа 'CONTAINER' в CargoType НЕТ — удалить только строку `case 'CONTAINER':` (FCL/LCL ветка остаётся!).
- `components/match/MatchDetailPanel.tsx:17-26` — 5 @deprecated пропсов; фикстуры их передают: `components/match/__tests__/MatchDetailPanel.test.tsx`, `fit-bracket-render.test.tsx` (правка фикстур санкционирована).
- `components/mobile/{BottomSheet,FabVoice,SwipeCard}.tsx` + `tests/components/mobile/*` (3) + `lib/sample-data/voice-notes/` + `tests/e2e/mobile.spec.ts` (если тестирует только mobile-компоненты — удалить; если есть generic-вьюпорт чеки — выпилить только mobile-компонентные).
- `components/dashboard/`: ActionPanel, DashboardInboxSection, EmailCard, EmailSection, InboxBreakdown, MarketIntelligence, PriorityCard, TrafficLight + их тесты (`components/dashboard/__tests__/{PriorityCard,MarketIntelligence,TrafficLight,InboxBreakdown,DashboardSections}.test.tsx` — DashboardSections проверить: если тестирует и ЖИВЫЕ секции — чистить точечно). Barrel `components/dashboard/index.ts` экспортирует EmailCard/EmailSection/ActionPanel — удалить файл barrel, если импортёров barrel нет (живые компоненты страница импортирует напрямую — проверить).
- `lib/onboarding/activation-tracker.ts`, `components/onboarding/EmailUploadCTA.tsx`, `components/agent/ApprovePlanModal.tsx` + `components/agent/__tests__/ApprovePlanModal.test.tsx`.
- `.env.local.example`: `:41 OPENSANCTIONS_API_KEY=`, `:129 KNOWLEDGE_WAR_RISK_FROM_DB=false`, `:153-154 MULTI_CURRENCY_V2_ENABLED + NEXT_PUBLIC_…` (0 чтений в коде — перепроверено).
- **jwc-RAG (хирургически, bimco НЕ трогать):** `lib/knowledge/embeddings/pipeline.ts:53-54` ALLOWED_VEC/FTS_TABLES; `retriever-sqlite.ts:1-2` те же списки; `retriever-vertex.ts` список + `jwc_vec: process.env.VERTEX_ENGINE_JWC`; `lib/knowledge/bootstrap.ts` `vector_table: 'jwc_vec'` запись; `scripts/demo-seed/regenerate-matches.ts` RAG-copy список таблиц (`jwc_vec`, `jwc_fts` строки — лог «jwc_vec=7»); адаптеры `lib/knowledge/sources/jwc/` и `lib/knowledge/sources/jwc-yaml/` — удалить ТОЛЬКО если их единственная роль — сидинг jwc_vec/fts (war-risk читает YAML через `lib/economics/war-risk-rates.ts` НАПРЯМУЮ — проверить grep'ом, что war-risk*.ts не импортирует sources/jwc*). Миграция 018 (создание таблиц) остаётся — append-only.
- `.claude/rules/retriever.md` упоминает jwc_vec в allowlist — обновить строку правила.

**Конвейер/конвенции:** 4 тест-каталога; полный `npm test` локально запрещён; rtk-префиксы; tests/regression гонять с `--testPathIgnorePatterns "/node_modules/"`; финальная диагностика — сырой вывод; merge-гейты `~/.claude/skills/orchestrator-day/scripts/{value-check-emit.sh,testskill-emit.sh}` + merge отдельным Bash-вызовом; прод-write только по формуле; реген --dry first.

## Sanctioned spec changes (только эти; каждый rewrite — коммент `audit D`)

1. Тесты удаляемых модулей удаляются вместе с модулями (полный список выше).
2. Фикстуры MatchDetailPanel-тестов теряют 5 deprecated-пропсов (поведенческие ожидания не меняются).
3. Тесты, пинящие allowed-списки RAG-таблиц с jwc (pipeline/retriever) — переписать на список без jwc (bimco остаётся).
4. `getVesselPassport` меняет сигнатуру и перестаёт возвращать фейковые константы — его тест `lib/__tests__/counterparty-passport.test.ts` переписать на новую реальную сборку.
5. Парсер судна получает lastcargoes-fallback — тесты нормализатора могут получить НОВЫЕ кейсы; существующие ожидания не трогать.
6. Любой другой падающий тест = BLOCKED, эскалация контроллеру.

---

### Task 1: чистка пакета «код» (jwc-старый, split-bunker, мелочь, env)

**Files:** Delete: `lib/knowledge/jwc/`, `lib/economics/split-bunker.ts` + test, `app/matches/demo-data.ts`, `lib/utils/format-port-name.ts` + test, `lib/ais/index.ts`. Modify: `lib/sailing/match-scoring.ts` (строка `case 'CONTAINER':`), `components/match/MatchDetailPanel.tsx` + 2 тест-фикстуры, `.env.local.example` (4 флага).

- [ ] Step 1: для КАЖДОЙ delete-цели grep живых импортёров (`rtk grep -rn "<module>" --include="*.ts*" lib app components scripts middleware.ts | grep -v "<сам модуль>" | grep -v __tests__`). Найден живой импортёр → НЕ удалять, доложить DONE_WITH_CONCERNS. Особо: `lib/ais` barrel — если есть `from '@/lib/ais'` (не /cache, не /datalastic) — barrel живой, пропустить.
- [ ] Step 2: `git rm` целей + тестов; `case 'CONTAINER':` — удалить одну строку (FCL/LCL остаются); deprecated-пропсы — удалить из интерфейса + из всех вызовов в 2 тестах (`// audit D: deprecated props removed`).
- [ ] Step 3: `.env.local.example` — удалить 4 строки флагов (+их комментарии).
- [ ] Step 4: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0; `rtk npx jest lib/economics lib/utils lib/sailing components/match --silent` → зелено.
- [ ] Step 5: Commit `chore(dead-code): drop replaced jwc parser, split-bunker, placeholder modules + dead env flags (audit D)`.

### Task 2: чистка пакета «UI-сироты» (mobile, dashboard-inbox, onboarding)

**Files:** Delete: `components/mobile/` (3), `tests/components/mobile/` (3), `lib/sample-data/voice-notes/`, `components/dashboard/{ActionPanel,DashboardInboxSection,EmailCard,EmailSection,InboxBreakdown,MarketIntelligence,PriorityCard,TrafficLight}.tsx` + их тесты + barrel `index.ts` (если без импортёров), `components/LandingPageClient.tsx`, `components/connect-gmail-button.tsx`, `lib/onboarding/activation-tracker.ts`, `components/onboarding/EmailUploadCTA.tsx`, `components/agent/ApprovePlanModal.tsx` + test. Review: `tests/e2e/mobile.spec.ts` (целиком или точечно).

- [ ] Step 1: grep-верификация каждого (как T1 Step 1). Дашборд: подтвердить, что `app/dashboard/page.tsx` импортирует живые 4 (KpiStrip/TodoSection/FreshMatches/MorningHeader) НАПРЯМУЮ, не через barrel.
- [ ] Step 2: `git rm`; `DashboardSections.test.tsx` — читать: тестирует только удаляемые секции → удалить; смешанный → вырезать только мёртвые describe.
- [ ] Step 3: `tests/e2e/mobile.spec.ts` — читать: только BottomSheet/FabVoice/SwipeCard сценарии → удалить файл; есть generic mobile-viewport чеки живых страниц → оставить их, вырезать мёртвое.
- [ ] Step 4: tsc + `rtk npx jest components app/dashboard tests/components --silent 2>/dev/null; rtk npx jest components --silent` → зелено.
- [ ] Step 5: Commit `chore(dead-ui): drop unmounted mobile trio, dashboard inbox cluster, onboarding orphans (audit D, founder decision)`.

### Task 3: jwc-RAG расцепка (bimco остаётся)

**Files:** Modify: `lib/knowledge/embeddings/pipeline.ts`, `retriever-sqlite.ts`, `retriever-vertex.ts`, `lib/knowledge/bootstrap.ts`, `scripts/demo-seed/regenerate-matches.ts` (RAG-copy список), `.claude/rules/retriever.md`. Delete (условно): `lib/knowledge/sources/jwc/`, `lib/knowledge/sources/jwc-yaml/` + их тесты.

- [ ] Step 1: ФАКТ — `rtk grep -rn "sources/jwc" lib/economics lib/ --include="*.ts" | grep -v "sources/jwc"` и `rtk grep -rn "war-risk" lib/knowledge/sources/jwc* 2>/dev/null`: war-risk-rates.ts обязан читать YAML напрямую, НЕ через sources/jwc\*. Если адаптеры импортируются war-risk'ом — адаптеры ОСТАВИТЬ, удалить только RAG-части. Также `rtk grep -rn "refresh-jwc\|syncJwc" scripts/` — крон-скрипты jwc-RAG в delete.
- [ ] Step 2: failing test — обновить тест(ы) пинящие ALLOWED_VEC_TABLES (найти: `rtk grep -rln "jwc_vec" lib __tests__ tests`): ожидание = `['imsbc_vec','igc_vec','bimco_vec']` (+fts аналогично), коммент `audit D`.
- [ ] Step 3: вырезать `'jwc_vec'`/`'jwc_fts'` из всех списков (pipeline:53-54, retriever-sqlite:1-2, retriever-vertex + `VERTEX_ENGINE_JWC` строка), запись из bootstrap.ts, строки из regen RAG-copy. bimco\_\* НЕ трогать. Удалить адаптеры по результату Step 1.
- [ ] Step 4: tsc + `rtk npx jest lib/knowledge scripts/demo-seed --silent` зелено; smoke: `npx tsx scripts/demo-seed/regenerate-matches.ts --dry 2>&1 | grep "RAG tables"` — jwc отсутствует, bimco на месте.
- [ ] Step 5: `.claude/rules/retriever.md` — allowlist-строку обновить (`imsbc_vec/fts, igc_vec/fts, bimco_vec/fts`). Commit `chore(rag): decouple dead jwc_vec from RAG pipeline — war-risk reads YAML directly (audit D)`.

### Task 4: оживить lastcargoes-fallback

**Files:** Modify: `lib/parsing/parse-vessel-helpers.ts` (или call-site нормализатора — где доступен body), Create: `scripts/demo-seed/backfill-lastcargoes.ts`, тесты рядом с parse-vessel тестами + scripts/**tests**.

- [ ] Step 1: ФАКТ — `rtk grep -rn "parseVesselAIResponse\|parse-vessel-helpers" lib app scripts --include="*.ts" -l`: где body в скоупе при вызове нормализатора. Решение по точке врезки: предпочтительно в самом нормализаторе, если сигнатура позволяет передать body опциональным параметром; иначе — fallback на call-sites.
- [ ] Step 2: failing tests: (a) нормализатор: item без `last_cargoes` + body с «L/C: coal, grain, urea» → `lastCargoes === 'coal, grain, urea'`; item С `last_cargoes` → fallback НЕ перезаписывает; body без паттернов → null; (b) backfill-скрипт transform: vessel-item без lastCargoes получает из body; существующее значение не трогается; повторный прогон 0 изменений.
- [ ] Step 3: имплементация — вызов `extractLastCargoesFromBody` только когда поле пустое (`// audit D: regex fallback feeds hold-cleanliness + pedigree scoring`); backfill-скрипт по образцу backfill-charterer.ts (parse_type='vessel', --dry дефолт).
- [ ] Step 4: локальный smoke: `npx tsx scripts/demo-seed/backfill-lastcargoes.ts` (dry) → доложить числа покрытия (сколько судов получат lastCargoes); `--apply` на локальную data/demo-seed.db; `rtk npx jest lib/parsing lib/matching scripts --silent` зелено.
- [ ] Step 5: Commit `feat(parser): lastcargoes regex fallback + demo backfill — feeds hold-cleanliness (audit D revive)`.

### Task 5: оживить паспорт судна

**Files:** Modify: `lib/counterparty.ts` (реальная сборка), `app/vessel/[id]/page.tsx` (панель после Specs), Create: `components/vessel/VesselPassportPanel.tsx`, тесты `lib/__tests__/counterparty-passport.test.ts` (rewrite санкционирован) + компонентный тест.

- [ ] Step 1: читать `lib/__tests__/counterparty-passport.test.ts` (старые пины) + `lib/sanctions/*` сигнатуры фактом.
- [ ] Step 2: failing tests новой сборки:

```ts
// buildVesselPassport(db, vessel, refYear) — sync, без сети/LLM:
// flag из vessel.flag + getParisMouClassification; class из vessel.classSociety + isIacs;
// pi из vessel.pandi + isIgClub; sanctions = checkVesselSanctions(vessel.imo) (локальный);
// psc.detentions3y = imo && hasInspectionData ? getDetentionCount(...) : undefined (паттерн A.2!);
// age = vessel.built ? refYear - vessel.built : undefined; cii НЕ резолвится тут (страница уже имеет CiiRatingBadge-данные).
// null-поля → честные undefined/null, НИКАКИХ дефолтов-фейков.
it('builds passport from parsed fields + local registries', ...);
it('vessel without imo → sanctions/psc omitted, no crash', ...);
it('no PSC rows → detentions3y undefined (not 0)', ...);
```

- [ ] Step 3: имплементация `buildVesselPassport` (старый `getVesselPassport` удалить; тип VesselPassport адаптировать: поля optional там, где данных может не быть). UI-панель: карточка «Vessel passport» после Specs — строки flag+ParisMoU-бейдж, class+IACS-галка, P&I+IG-галка, age, sanctions-статус, detentions3y (или «no PSC data»); рендер строк только при наличии данных. Серверный компонент (db доступен в page.tsx — посмотреть, как страница получает данные).
- [ ] Step 4: tsc + `rtk npx jest lib/__tests__/counterparty-passport.test.ts components/vessel app/vessel --silent 2>/dev/null || rtk npx jest lib components --silent` зелено.
- [ ] Step 5: Commit `feat(vessel): real vessel passport panel from parsed data + local registries (audit D revive)`.

### Task 6: оживить ROI-report поверхность

**Files:** Read: `lib/analytics/roi-metrics.ts` (как считается RoiSummary, от каких данных). Create: `app/reports/roi/page.tsx` (минимальная страница-превью) или кнопка+модал на дашборде — выбрать по факту того, что считает roi-metrics. Тест на страницу/рендер.

- [ ] Step 1: ФАКТ — читать roi-metrics.ts целиком: вход (matches? quotes? период), есть ли функция готовая `computeRoiSummary(db,...)`. Если метрики требуют отсутствующих данных (например, sent-quotes история пуста) — собрать из того, что есть, и честно лейблить «за период с данными».
- [ ] Step 2: failing test: страница/компонент рендерит subject + body из generateRoiReportEmail на данных фикстуры; невалидные числа → понятная ошибка, не краш.
- [ ] Step 3: минимальная поверхность: серверная страница `/reports/roi` (в More-навигацию НЕ добавлять без необходимости — достаточно ссылки с дашборда «ROI report»), `<pre>`-рендер plain-text письма + subject заголовком. Никаких send-механизмов.
- [ ] Step 4: tsc + targeted jest зелено.
- [ ] Step 5: Commit `feat(reports): ROI report preview page wired to roi-metrics (audit D revive)`.

### Task 7: sweep + cold QA + merge + deploy + γ-смоук + прод-применение

(Контроллер сам.)

- [ ] Батареи 4 конвенций (как волна A; полный npm test — нет).
- [ ] Cold test-skill (fresh agent, diff main..HEAD, .test-review/) → followups → effective APPROVE.
- [ ] Гейты (value-check-emit oracle prod-select; testskill-emit) → push → PR → CI → squash merge (отдельные вызовы).
- [ ] Deploy watch → smoke / + /vessel/<id> (паспорт) + бандл-grep (VesselPassportPanel, backfill-lastcargoes отсутствие jwc_vec в regen-логе).
- [ ] **qa-walker смоук γ-страниц** (решение фаундера): /laytime, /clauses, /market, /psc, /charterers глазами брокера — находки в followup-фиксы этой же волны при возможности.
- [ ] Прод-данные ПО ФОРМУЛЕ (спросить с --dry числами): backfill-lastcargoes --dry → числа → apply; реген --dry (hold-cleanliness расширится → доска может сдвинуться) → числа → apply.
- [ ] Память (project_quantika_logic_audit_2026_06_12.md раздел D → статус; ошибка аудита про bimco_fts — зафиксировать), MEMORY.md, финальная сводка по CLAUDE.md-стилю.

---

## Self-Review

- Coverage: revive ×3 (T4/T5/T6), delete-список целиком (T1/T2/T3), γ-смоук + прод (T7). Решения фаундера все отражены. ✓
- Placeholders: «читать файл фактом» оставлено только там, где код переменный и grep/чтение прописаны шагом (T3 Step 1, T4 Step 1, T6 Step 1). ✓
- Surgical: bimco\_\* явно помечен KEEP в каждом jwc-шаге; FCL/LCL ветка сохраняется при удалении CONTAINER; живые dashboard-4 не трогаются. ✓
- Риски: (1) e2e/mobile.spec + DashboardSections.test — смешанное содержимое, прописано «вырезать точечно»; (2) sources/jwc-адаптеры могут быть импортированы war-risk — Step 1 гейтит удаление; (3) backfill-lastcargoes меняет вход hold-cleanliness → реген сдвинет доску — числа через --dry до формулы.
