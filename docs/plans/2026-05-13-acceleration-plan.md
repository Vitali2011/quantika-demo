# Quantika Demo Acceleration — Implementation Plan

> **For Claude (orchestrator):** This is a playbook. Each Task = handover-prompt to copy-paste into a new session. Track progress in `docs/plans/2026-05-13-acceleration-status.md` (создаётся при первом обновлении).
> **For executors:** if you received one of these prompts in a new session, follow it as-is. After completion — report back to orchestrator in format specified at the end of each task.

**Goal:** Довести `demo.quantika.org` до prod-ready состояния через 3 параллельных потока + финальную волну δ.

**Architecture:** Orchestrator-only main session + spawn новых сессий per task. Каждая задача самодостаточна, имеет DoD и формат отчёта.

**Tech Stack:** Next.js 16 + TypeScript 5, Gemini 2.5 (Vertex AI), Bedrock Claude, SQLite + FTS5+vec, Playwright, Jest, dev-pipeline-deep / wave-pipeline-deep / vps skills.

**Design doc:** [docs/plans/2026-05-13-acceleration-design.md](2026-05-13-acceleration-design.md)

---

## Roadmap

```
День 1   ─ Task 0 (commit design)
         ─ Task 1.1 (eval parse-cargo) + Task 2.A (quick-wins) + Task 3.1 (walkthrough)  ← параллельно
День 2-3 ─ Task 3.2 triage → производные задачи
         ─ Task 1.3 pin Gemini, Task 2.B Charterers, Task 2.D UX cleanup
         ─ Task 3.3a–3.3c первые Playwright тесты
День 4-7 ─ Task 2.C PSC, Task 1.4–1.6 parse-vessel/classify eval
         ─ Task 3.3d–3.3h оставшиеся Playwright
День 8+  ─ Task 4.0 Wave δ kickoff
```

---

## Task 0: Commit design doc (1 минута, до старта)

**Context for executor:** Дизайн-док лежит как untracked файл в `~/work/quantika-demo/docs/plans/2026-05-13-acceleration-design.md`. Предыдущая попытка коммита упала из-за чужих staged-изменений и pre-commit таймаута. Нужно закоммитить только design-doc, ничего больше.

**Files:**

- Add: `docs/plans/2026-05-13-acceleration-design.md`
- Add: `docs/plans/2026-05-13-acceleration-plan.md` (этот файл)

**Steps:**

```bash
cd ~/work/quantika-demo
# 1. Создать чистую ветку от main
git fetch origin
git checkout -b docs/acceleration-plan-2026-05-13 origin/main

# 2. Скопировать оба файла с feat/parse-cargo-semi-stable-r17 (если их там нет — пересоздать)
git checkout feat/parse-cargo-semi-stable-r17 -- docs/plans/2026-05-13-acceleration-design.md docs/plans/2026-05-13-acceleration-plan.md

# 3. Staged ТОЛЬКО эти два файла
git add docs/plans/2026-05-13-acceleration-design.md docs/plans/2026-05-13-acceleration-plan.md
git status   # должно быть ровно 2 файла staged, ничего больше

# 4. Commit (pre-commit hook прогонит prettier+eslint — это OK, должен пройти за <30s)
git commit -m "docs(acceleration): design + implementation plan

3 параллельных потока + волна δ. Orchestrator-only execution
через handover-промпты."

# 5. Push + PR
git push -u origin docs/acceleration-plan-2026-05-13
gh pr create --title "docs: acceleration plan 2026-05-13" \
  --body "Дизайн + implementation playbook для доведения demo.quantika.org до prod-ready."
```

**DoD:** PR создан, CI зелёный, merge-ready.

**Report to orchestrator:** PR URL + статус CI.

---

## Поток 1 — Парсеры

### Task 1.1: parse-cargo eval R-current (30-60 мин)

**Goal:** измерить реальный score parse-cargo после R15+R16 на свежем Gemini. 4 прогона для variance.

**Skill to use:** `/vps` (SSH session, не код-сессия)

**Handover prompt:**

```
Подключись к outreach-vps (185.249.225.169) через ssh и выполни:

1. cd /root/quantika-demo
2. git fetch && git checkout main && git pull
3. Убедись что .env.local на VPS актуален (Gemini env vars, ANTHROPIC_API_KEY для judge)
4. Прогнать parse-cargo eval 4 раза подряд:
   for i in a b c d; do
     npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts \
       --corpus .progonq/corpus/etms-parse-cargo \
       --output .progonq/results/etms-parse-cargo-R-current-$i.json \
       --judge sonnet
   done
5. Собрать сводку:
   for f in .progonq/results/etms-parse-cargo-R-current-*.json; do
     echo "$f: $(jq -r '.summary.semantic_score' $f)"
   done
6. Скопировать все 4 файла обратно на Mac разработчика:
   scp outreach-vps:/root/quantika-demo/.progonq/results/etms-parse-cargo-R-current-*.json \
       ~/work/quantika-demo/.progonq/results/

Доложить:
- Score каждого прогона (a/b/c/d)
- Медиана
- Variance band (min-max)
- Список scenario, которые FAIL во всех 4 прогонах (стабильные fails)
- Список scenario, которые FAIL в 1-2/4 (LLM noise)
```

**DoD:** 4 JSON-результата на Mac + сводка в чат orchestrator.

**Decision gate (я в orchestrator-сессии):**

- median ≥ 94/95 → закрыть Поток 1 на этом, прыгнуть к Task 1.3
- median 90-93 → запустить Task 1.2 (targeted corpus/prompt round)
- median < 90 → запустить Task 1.2-ретро (deeper analysis)

---

### Task 1.2: Targeted parse-cargo round (если нужно, 1-2 спеки)

**Goal:** добить score до ≥94/95 фиксом стабильных fails.

**Skill to use:** `dev-pipeline-deep`

**Handover prompt template** (orchestrator заполняет конкретные scenario):

```
Skill: dev-pipeline-deep

Цель: поднять parse-cargo eval с {median} до ≥94/95.

Стабильные fails (4/4 во всех прогонах):
{list из Task 1.1 report}

Для каждого fail сделать:
1. Прочитать сценарий в .progonq/corpus/etms-parse-cargo/scenario-XXX.json
2. Сравнить reference_output с model output из 4 прогонов
3. Решить: corpus annotation bug ИЛИ prompt/schema bug
4. Если corpus → исправить scenario JSON (+test)
5. Если prompt → исправить lib/prompts/parse-cargo.ts или schema

Запустить локальный прогон для verify:
  npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts \
    --corpus .progonq/corpus/etms-parse-cargo \
    --output .progonq/results/etms-parse-cargo-fix-local.json

После того как локальный прогон ≥94/95 — открыть PR.

Branch: progonq/parse-cargo-{round-id}
```

**DoD:** PR смержен в main, на VPS прогон даёт median ≥94/95.

---

### Task 1.3: Pin Gemini version (1 спека)

**Goal:** защита от drift — фиксировать `gemini-2.5-pro` и `gemini-2.5-flash` model IDs с явными суффиксами (если Google публикует stable variants), либо warn-on-drift механизм.

**Skill to use:** `dev-pipeline-deep`

**Handover prompt:**

```
Skill: dev-pipeline-deep

Cели:
1. В lib/ai-provider.ts защититься от Gemini model drift.
2. Проверить через docs.cloud.google.com какие stable model IDs доступны для:
   - gemini-2.5-pro (есть ли datestamped variant типа gemini-2.5-pro-002?)
   - gemini-2.5-flash
3. Если stable variants есть → переключиться на них (через env var override + default fallback)
4. Если нет → добавить version-warning log при инициализации (записывать model_version от API в audit_table)
5. Покрыть тестом lib/__tests__/ai-provider.test.ts

Branch: feat/pin-gemini-version
```

**DoD:** PR смержен, future drift детектируется через ai_audit log.

---

### Task 1.4-1.5: Eval-корпуса parse-vessel + classify (2-3 спеки каждый)

**Goal:** воспроизвести успешный паттерн parse-cargo eval (corpus + run-\* + judge) для parse-vessel и classify.

**Skill to use:** `dev-pipeline-deep`

**Handover prompt (parse-vessel):**

```
Skill: dev-pipeline-deep

Создать eval pipeline для parse-vessel по аналогии с parse-cargo (.progonq/corpus/etms-parse-cargo + scripts/progonq/run-parse-cargo.ts + judge-parse-cargo.ts).

Steps:
1. Создать .progonq/corpus/etms-parse-vessel/ — собрать 50-80 сценариев из:
   - lib/sample-data/etms-emails.json (vessel-классификация письма)
   - real Gmail import dump если есть
2. Аннотировать reference_output для каждого scenario (ParsedVessel structure из lib/types.ts)
3. Создать scripts/progonq/run-parse-vessel.ts по образцу run-parse-cargo.ts
4. Создать scripts/progonq/judge-parse-vessel.ts с rubric'ом для:
   - vessel name match
   - DWT/DWCC tolerance
   - position equivalence
   - open dates window
5. Локальный прогон через Sonnet judge должен пройти baseline
6. Документация: docs/progonq/parse-vessel-eval.md

Branch: feat/eval-parse-vessel
```

**Handover prompt (classify):** аналогично, для classify-endpoint, корпус 80-100 сценариев (cargo / vessel / fixture / mixed / spam).

**DoD каждого:** PR смержен, локальный baseline run работает.

---

### Task 1.6: VPS eval parse-vessel + classify

**Goal:** прогнать новые корпуса на VPS, 4 прогона каждый, получить медианы.

**Skill to use:** `/vps`

**Handover prompt:** аналогично Task 1.1, но для parse-vessel и classify.

**DoD:** обе медианы ≥90/95.

**Decision gate:** если <90 → targeted round (Task 1.2-pattern для соответствующего парсера).

---

## Поток 2 — Скрытые страницы + UX

### Task 2.A: Quick-win bundle (XS+S+S, 1 день)

**Goal:** включить `/laytime`, `/clauses`, `/market` за один заход.

**Skill to use:** `dev-pipeline-deep`

**Handover prompt:**

```
Skill: dev-pipeline-deep

Цель: включить 3 готовые страницы — /laytime, /clauses, /market.

Контекст: бэкенд готов для всех трёх (audit это подтвердил). Нужен только seed данных + флаги.

Steps:
1. Прочитать docs/plans/2026-05-13-acceleration-design.md секция «Группа A»
2. Местный fix в scripts/knowledge/seeds/seed-market-indices.ts:
   - Добавить третий блок для `drewry-bb` по аналогии с BHSI/TMI
   - Синтетика на 30 дней, диапазон $1500-1700 USD/TEU (типичная Drewry BB)
   - Тест: lib/__tests__/seed-market-indices.test.ts — проверка что 3 source'а сидятся
3. PR с этим fix → merge в main
4. Через /vps на outreach-vps:
   a. git pull в /root/quantika-demo
   b. echo 'LAYTIME_ENGINE_ENABLED=true' >> .env.local
   c. echo 'NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED=true' >> .env.local
   d. То же для BIMCO_RAG_ENABLED, NEXT_PUBLIC_BIMCO_RAG_ENABLED
   e. То же для MARKET_BENCHMARK_FULL_ENABLED, NEXT_PUBLIC_MARKET_BENCHMARK_FULL_ENABLED
   f. npx tsx --env-file=.env.local scripts/seed-bimco-clauses.ts
   g. npx tsx --env-file=.env.local scripts/knowledge/seeds/seed-market-indices.ts
   h. npm run build && systemctl restart quantika-demo
5. Smoke в браузере (или curl):
   - https://demo.quantika.org/laytime → форма SHEX/SHINC видна, кнопка Calculate работает
   - https://demo.quantika.org/clauses → поиск выполняется, есть результаты GENCON
   - https://demo.quantika.org/market → 3 чарта рендерятся (BHSI, TMI, drewry-bb)

Branch: feat/enable-quickwin-pages
```

**DoD:** 3 страницы рендерят данные, smoke в браузере пройден, PR смержен, прод обновлён.

---

### Task 2.B: Charterers listing + enable (S→M, 1-2 дня)

**Goal:** включить `/charterers/[id]` и добавить listing-страницу.

**Skill to use:** `dev-pipeline-deep`

**Handover prompt:**

```
Skill: dev-pipeline-deep

Цель: включить charterers feature + добавить страницу со списком.

Steps:
1. Создать app/charterers/page.tsx — listing:
   - GET /api/charterers (новый endpoint, list all с фильтром по tier + search by name)
   - Таблица: name | tier badge | LC required | last interaction | → ссылка на detail
   - Поиск по имени
   - Filter chips: blue-chip / second / weak
2. Создать app/api/charterers/route.ts — GET list endpoint
3. lib/market/charterers-repository.ts — добавить listAll(filters) метод
4. Link в navigation/sidebar.tsx (или dashboard) на /charterers
5. Tests:
   - __tests__/api/charterers-list.test.ts
   - lib/__tests__/charterers-repository-list.test.ts
6. Через /vps:
   - git pull
   - echo 'CHARTERER_CREDIT_ENABLED=true' >> .env.local
   - echo 'NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED=true' >> .env.local
   - npx tsx --env-file=.env.local scripts/knowledge/seeds/seed-charterers.ts
   - npm run build && systemctl restart quantika-demo
7. Smoke:
   - /charterers → 20 charterers в таблице
   - клик на Cargill → /charterers/{id} → профиль рендерится

Branch: feat/charterers-listing-enable
```

**DoD:** listing + detail работают на проде.

---

### Task 2.C: PSC fixture seed + enable (M, 3-5 дней)

**Goal:** включить `/vessels/[imo]/psc-history` с тестовыми данными.

**Skill to use:** `dev-pipeline-deep` (multi-spec) или `wave-pipeline-deep` если больше 4 спек

**Handover prompt:**

```
Skill: dev-pipeline-deep

Цель: PSC history live с fixture-данными.

Контекст: эндпоинт + миграция + репозиторий готовы, но fixture/seed отсутствуют.

Steps:
1. Создать lib/knowledge/sources/psc/fixture.ts — 15-20 записей PSC inspections:
   - 3-5 уникальных IMO (используй те же IMO что уже в lib/sample-data/etms-emails.json — пусть совпадают с демо-флоу)
   - Каждая запись: imo, date (last 2 years), port_unlocode, authority (Paris MoU / Tokyo MoU / USCG), deficiencies[] (1-5 items с code+description), detained (boolean)
2. Создать scripts/seed-psc-history.ts:
   - Принимает .env-file
   - Очищает psc_history table
   - Вставляет fixture data
3. Link в app/vessel/[id]/page.tsx — кнопка/таб «PSC History» → /vessels/{imo}/psc-history
4. Tests:
   - lib/__tests__/psc-fixture.test.ts (валидация structure)
   - __tests__/api/vessels-psc-history.test.ts (integration с seeded data)
5. Через /vps:
   - флаги ON (PSC_DETENTION_ENABLED + NEXT_PUBLIC_)
   - запустить seed
   - rebuild + restart
6. Smoke:
   - /vessel/{id} → видна кнопка «PSC History»
   - клик → /vessels/{imo}/psc-history → таблица с inspections

Branch: feat/psc-fixture-enable
```

**DoD:** PSC страница рендерит реальные fixture-данные на проде.

---

### Task 2.D: UX cleanup bundle (S, полдня)

**Goal:** починить /upgrade 404, включить hidden widgets, убрать FuelEU hardcode.

**Skill to use:** `dev-pipeline-deep`

**Handover prompt:**

```
Skill: dev-pipeline-deep

Цель: 3 мелких UX fix'а в одном PR.

Steps:

(1) /upgrade 404
Прочитать components/onboarding/TrialBanner.tsx.
Опции (выбрать одну, спросить у Виталия если непонятно):
  A. Создать app/upgrade/page.tsx — минимальная страница: «Свяжитесь с нами для апгрейда — email@quantika.org»
  B. Убрать кнопку «Upgrade now» из TrialBanner до момента когда будет реальный billing flow

(2) Dashboard widgets
В components/dashboard/* проверить:
  - RoiSummaryTile — backend готов? если да → флаг ROI_GUARANTEE_ENABLED=true на VPS
  - SubsCountdown — то же для SUBS_TIMER_V2_ENABLED
Если backend не готов — оставить как есть, написать TODO в этом PR.

(3) FuelEU hardcode
В components/match/EconomicsTab.tsx:103 заменить `estimatedVoyageDays = 15` на расчёт:
  voyageDays = distanceNm / (speed * 24)
где distanceNm берётся из match.route.distance_nm, speed — из vessel.speed_loaded
(или дефолт 12 узлов если нет).
Тест: components/__tests__/EconomicsTab-fueleu-days.test.tsx — проверить разные дистанции дают разный voyageDays.

(4) VPS deploy floor: git pull + npm run build + restart на outreach-vps.

Branch: feat/ux-cleanup-bundle
```

**DoD:** 3 fix'а в проде, smoke зелёный.

---

### Task 2.E: Backend completion (deferred, по результатам Потока 3)

Не запускаем сейчас. Кандидаты определит orchestrator после Task 3.2 triage:

- Equasis real scraper
- Crew war bonus
- Email channel alerts
- MarketIntelligence cards (BHSI / EUA / Bunker Rotterdam tiles)

---

## Поток 3 — E2E

### Task 3.1: Browser walkthrough (полдня)

**Goal:** ручной обход всего приложения через Chrome MCP, карта найденных проблем.

**Skill to use:** новая сессия с Chrome MCP (`mcp__Claude_in_Chrome__*`)

**Handover prompt:**

```
Ты — QA-агент, обходишь demo.quantika.org как пользователь через Chrome MCP.

Setup:
1. mcp__Claude_in_Chrome__navigate https://demo.quantika.org
2. Login: креды из ~/work/quantika-demo/.env.local (DEMO_AUTH_USER + DEMO_AUTH_PASSWORD)
3. На каждой странице — screenshot + проверка что работает

Маршруты для обхода (исчерпывающий):

CORE FLOW:
- /login → /dashboard (после login)
- /dashboard — все виджеты, все ссылки
- /processing — список писем, фильтры, поиск
- Открыть письмо → /email/[id] — classification, parse buttons
- Запустить classify + parse → /cargo/[id] (или /vessel/[id])
- /cargo/[id] — найти match → /match/[id]
- /match/[id] — EconomicsTab + FuelEU + draft-quote + explain-deal + route map
- /vessel/[id] — все табы, кнопка PSC если есть
- /recap/[id]
- /fixture/[id]
- /commission
- /summary

НОВЫЕ СТРАНИЦЫ (если включены к моменту твоего обхода):
- /laytime — форма + парсер SoF
- /clauses — поиск BIMCO
- /market — 3 чарта
- /charterers (listing) → /charterers/[id]
- /vessels/[imo]/psc-history

UX:
- /upgrade — должно быть починено

Формат отчёта — markdown таблица:

| route | status | severity | notes | screenshot |
|---|---|---|---|---|
| /dashboard | ✅ | — | все 4 виджета рендерятся | dashboard.png |
| /upgrade | 🔴 | CRITICAL | 404 | upgrade.png |
| /clauses | 🟡 | MINOR | поиск возвращает только 7 клауз, мало для демо | clauses.png |
| /charterers | ⚪ | MAJOR | страница listing не существует | — |

Severity:
- CRITICAL — блокирует core flow (auth, parsing, matching)
- MAJOR — фича не работает / отсутствует
- MINOR — косметика, UX
- INFO — наблюдение, не баг

Сохранить отчёт в ~/work/quantika-demo/docs/audits/browser-walkthrough-2026-05-13.md.
Screenshots в ~/work/quantika-demo/docs/audits/screenshots-2026-05-13/.

Закончить кратким резюме:
- Всего страниц обошёл: N
- ✅ работает: X
- 🟡 с замечаниями: Y
- 🔴 сломано: Z
- ⚪ заглушка/отсутствует: W
- Топ-5 CRITICAL/MAJOR находок одной строкой каждая
```

**DoD:** markdown-отчёт + папка screenshots + резюме в чат orchestrator.

---

### Task 3.2: Triage (я в orchestrator-сессии, 30 мин)

**Когда выполняется:** сразу после Task 3.1.

**Что делаю:**

1. Прочитать отчёт walkthrough
2. Каждую находку разнести:
   - CRITICAL/MAJOR → новый handover-промпт (Task 2.E или ad-hoc)
   - MINOR → backlog в `docs/plans/2026-05-13-acceleration-status.md`
3. Обновить timeline (возможно сдвиг)
4. Решить с Виталием: какие из Группы E делаем сейчас

**DoD:** обновлённый status-doc + список новых handover-промптов готов.

---

### Task 3.3a-3.3h: Playwright E2E suite (растёт по мере зеленения)

**Goal:** покрыть тестами все ранее скрытые страницы + core flow.

**Skill to use:** `dev-pipeline-deep` (один тест-файл = одна спека)

**Когда запускать:** для каждой фичи — после того как соответствующий Поток 2 task смержен.

**Handover prompt template:**

```
Skill: dev-pipeline-deep

Цель: Playwright E2E тест для {feature}.

Контекст:
- Раннер уже настроен (видны playwright-report-rag/ артефакты)
- Конфиг: playwright.config.ts (или __tests__/e2e/playwright.config.ts)
- Используем base URL = http://localhost:3000 для local CI, https://demo.quantika.org для prod smoke

Steps:
1. Создать __tests__/e2e/playwright/{feature}.spec.ts
2. Test scenarios:
   {orchestrator заполняет per feature}
3. Локально: npx playwright test {feature}.spec.ts
4. Если зелёный → PR
5. Добавить feature в CI workflow .github/workflows/e2e.yml (или main ci.yml)

Branch: test/e2e-{feature}
```

**Список Playwright тестов (8 штук):**

- 3.3a `login-flow.spec.ts` — login → redirect to dashboard → logout
- 3.3b `email-cargo-match.spec.ts` — открыть письмо → parse → cargo → match (happy path)
- 3.3c `laytime.spec.ts` — открыть, ввести даты, нажать Calculate, проверить результат
- 3.3d `clauses.spec.ts` — поиск, фильтр CP, результаты
- 3.3e `market.spec.ts` — 3 чарта отрендерены, дата tooltip работает
- 3.3f `charterers.spec.ts` — listing → search → detail
- 3.3g `psc-history.spec.ts` — открыть /vessels/{imo}/psc-history → таблица не пуста
- 3.3h `match-economics.spec.ts` — EconomicsTab + FuelEU + draft-quote (генерация) + explain-deal

**DoD каждого:** PR смержен, e2e job в CI зелёный.

---

## Task 4.0: Wave δ kickoff (когда все три потока сошлись)

**Goal:** финальная волна — собрать все остатки в один pipeline run.

**Skill to use:** `wave-pipeline-deep`

**Handover prompt:**

```
Skill: wave-pipeline-deep (strict mode для проектов с recursive bugs)

Цель: финальная волна δ — закрыть все hanging items перед prod-release.

Pre-flight:
1. Прочитать docs/plans/2026-05-13-acceleration-status.md — все DEFERRED items
2. Прочитать docs/audits/browser-walkthrough-2026-05-13.md — все CRITICAL/MAJOR не закрытые
3. Составить ROADMAP в docs/waves/ROADMAP-wave-delta.md по template (см. wave-pipeline-deep skill)

Execution:
1. pipeline decompose --plan-id wave-delta
2. Review specs, approve
3. make vps-run-deep PROJECT=quantika-demo (если хочет VPS) или pipeline execute --plan-id wave-delta
4. After verify pass — merge, deploy

Strict mode требования (per wave-pipeline-deep):
- Phase D6 cross-cutting grep
- 9-class boundary QA для каждой спеки
- security-auditor персона
- PI3/PI2 enforcement

Branch strategy: каждая спека на feat/spec-XX, integration в integration/wave-delta.

После полной интеграции — отчёт orchestrator:
- N спек в волне
- стоимость
- список CRITICAL находок которые закрыты
- финальный список тестов которые проходят
- готовность к prod
```

**DoD:** Wave δ verified, all CRITICAL closed, prod deploy зелёный.

---

## Status tracking

Orchestrator поддерживает `docs/plans/2026-05-13-acceleration-status.md` со следующей структурой:

```markdown
# Acceleration Status — 2026-05-13

## Поток 1

- [ ] Task 1.1 — parse-cargo eval (queued)
- [ ] Task 1.2 — targeted round (decision pending)
- [ ] Task 1.3 — pin Gemini
- ...

## Поток 2

- [ ] Task 2.A — quick-wins (running, started YYYY-MM-DD HH:MM)
- ...

## Поток 3

- [ ] Task 3.1 — walkthrough (queued)
- ...

## Decisions made

- YYYY-MM-DD: Task 2.D opt — chose option A (placeholder page) for /upgrade
- ...

## Deferred (Task 2.E candidates after Task 3.2 triage)

- Equasis real scraper — DEFERRED (cost: M, value: low without prod customers)
- ...
```

---

## Definition of Done — overall

- [ ] parse-cargo / parse-vessel / classify все ≥94/95
- [ ] 5/5 ранее скрытых страниц работают и доступны через nav
- [ ] 0 битых ссылок (404)
- [ ] Browser walkthrough всё ✅ кроме явно отложенных
- [ ] Playwright suite 8/8 зелёный в CI
- [ ] Wave δ merged + deployed
- [ ] User одобрил релиз

---

## Handoff for next session

После завершения брейнсторма orchestrator (я в этой сессии):

1. Выдаст Task 0 первым (commit design + plan на чистой ветке)
2. После merge Task 0 — параллельно выдаст Task 1.1, Task 2.A, Task 3.1
3. По мере прихода отчётов — будет триггерить следующие задачи

Виталий: запускаешь новые сессии и копируешь handover-промпты из этого playbook'а. Возвращаешься в эту сессию с отчётами, я обновляю статус и выдаю следующие промпты.
