# BUGFIX HANDOFF — все баги из аудита 2026-06-05

> Для НОВОЙ сессии багфикса (нулевой контекст). Источник: системный аудит 25 read-only агентов (docs/SYSTEM-AUDIT-0..5.md).
> Полная детализация каждого слоя — в соответствующем SYSTEM-AUDIT-N.md. Здесь — actionable список с file:line.

## ⚠️ ПРАВИЛА ДЛЯ ФИКСЕРА (читать первым)

1. **ВЕРИФИЦИРУЙ КАЖДЫЙ БАГ ПРОТИВ ТЕКУЩЕГО `main` ПЕРЕД ФИКСОМ.** Аудит — read-only разведка, мог переоценить. Пример: `formatAge` пометили «live frozen-clock leak», на деле — мёртвый код (0 вызовов). Сначала `grep` вызовы / воспроизведи симптом, потом чини.
2. **Дисциплина:** parser/normalizer/auth/economics/seed → risk-override → Tier M + `/test-skill`. Запись в прод-данные → Rule#22 (`--dry` сначала). User-visible → Gate5 (приёмка founder). TDD везде.
3. **Не чинить 2 бага на одних файлах параллельно** (конфликты). Conflict-группы помечены ниже.
4. **Ветка:** фиксы off latest `main` (HEAD ≥ `f154a7a2`, #829 уже в main). Black-Sea-работа (B7/B8) — на rebase'нутой feat/bunker-oilmonster.

---

## ✅ УЖЕ СДЕЛАНО / В РАБОТЕ — НЕ ПОВТОРЯТЬ

| Что                                                                      | Статус                                                                                                                                                                                                                                                                                                                                           | Где                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **#819 list==detail TCE** (canonical round-trip builder, honest freight) | ✅ MERGED `f154a7a2` (#829). Хвост: прод-реген (Rule#22) чтобы стало видно на доске                                                                                                                                                                                                                                                              | main                        |
| **B-AUTH auth-bypass 5 путей (#667)**                                    | ✅ **READY-TO-MERGE** PR #830 — CI green (Build/Test/TypeCheck/pre-merge-guard pass), `SECURITY=PASS` (cold adversarial review), `PRE_MERGE_CHECK_830=OK`. **ПРОСТО СМЕРЖИТЬ** (`gh pr merge 830 --squash --admin`), НЕ переделывать. После merge→deploy→Gate5 (проверить на demo: «Try Demo» сеет, «Connect Gmail» стартует, /market грузится). | fix/auth-bypass-demo-paths  |
| **formatAge мёртвый код**                                                | ✅ **READY-TO-MERGE** PR #831 — CI green, `PRE_MERGE_CHECK_831=OK`. chore, Gate5-skip. Просто смержить.                                                                                                                                                                                                                                          | chore/remove-dead-formatage |
| **B1b кнопки-обманки** (Send Quote/Counter/Save Draft → disable+«demo»)  | ⏳ НЕ начато (см. P0 ниже)                                                                                                                                                                                                                                                                                                                       | —                           |

> **Примечание:** #830/#831 НЕ смержены в этой сессии намеренно (сессия = только сбор багов; мерж = задача новой багфикс-сессии). Оба полностью готовы — мерж в 1 команду каждый.

---

## P0 — ЛОМАЕТ ДЕМО

### B1b — Кнопки-обманки (НЕ сделано)

- **Файлы:** `components/match/QuoteTab.tsx:33` (Send Quote = `toast.success('Отправлено')` only), `:26` (Save Draft = sessionStorage, no restore); `components/match/CounterModal.tsx:39` (Counter → пишет counter_offers, downstream нет); `lib/agent/plan-first.ts:57` (agent send-email noop); `app/vessels/VesselsClient.tsx:226-235` (Import CSV / New Vessel — no onClick); `app/cargo/CargoClient.tsx:433` (AI-Parse "Parse" = `setParseText('')` stub); `components/request/draft-quote-card.tsx` (Quote/Reply no restore on remount).
- **Корень:** кнопки рендерятся активными, но действие не выполняется → брокер думает «отправлено».
- **Фикс (founder-решение):** disable + видимая метка/tooltip «Demo» (НЕ подключать реальную отправку — это отдельная фича, нужна email-инфра).
- **Tier:** S. **Gate5** (user-visible). **Conflict:** match-UI surface.

---

## P1 — ЛОМАЕТ ДОВЕРИЕ К ЦИФРАМ

### B3 — Скорость/расход судна 78%/86% NULL → TCE на дефолтах

- **Файлы:** `lib/prompts/parse-vessel.ts` (промпт извлечения), `lib/parsing/parse-vessel-helpers.ts` (маппинг speed_laden/consumption — schema Type.NUMBER), `lib/matching/tce-calculator.ts:27-28` (DEFAULT_CONSUMPTION=25, DEFAULT_SPEED=12).
- **Корень:** парсер не вытаскивает скорость/расход из писем (в живой выборке 78%/86% null) → TCE для ~80% судов считается на хардкод-дефолтах 12kt/25mt. «$/день» фабрикуется.
- **Фикс (brainstorm):** (а) усилить промпт извлечения speed/consumption из типичных форматов брокерских писем; И/ИЛИ (б) честный «est.»-флаг в UI когда значение дефолтное. Решить вес vs честность.
- **Tier:** M-L, **brainstorm**, risk-override (parser). **Verify:** sqlite seed sample — % null до/после.

### B4 — Скоринг не знает про деньги (C3): убыток = «хороший матч»

- **Файлы:** `lib/sailing/match-scoring.ts:459` (computeScoreBreakdown — НЕТ econ-входа), `lib/sailing/fit-breakdown.ts:565` (есть neg-TCE→ceiling 40, НО preFitTce — только Tier-3 estimate, расходится с отображаемым TCE), `lib/matching/pair-analyzer.ts:688` (preFitTce), `:741-799` (economics ПОСЛЕ партиции = display-only).
- **Корень:** `score` (бакетирование good/possible/weak) не имеет TCE-входа → убыточный рейс может быть score=100/good. fit% имеет кап, но на расходящемся preFitTce.
- **Фикс (brainstorm/design):** провести tceUsdPerDay в score/fit единообразно (одна формула фрахта для cap и для display); убыточные ранжировать низко. Wave C3 (запланирован, не влит).
- **Tier:** L, **brainstorm**, движок core. **Conflict:** matching engine — последовательно с B6/B10.

### B5 — #819 остаточный: EconomicsTab дистанция ballast vs laden

- **Файлы:** `components/match/EconomicsTab.tsx:78` (routeDistanceNm = `match.readiness?.distanceNm` = БАЛЛАСТНОЕ плечо), `components/match/MatchTabs.tsx:78`. `storedTceUsdPerDay` prop принят но НЕ отображается (`EconomicsTab.tsx:32,66`).
- **Корень:** #829 унифицировал ФОРМУЛУ дней (round-trip), но live-TCE в карточке использует дистанцию баллласта (open→load), а stored — laden (load→disch) → может расходиться даже после #829.
- **Фикс:** карточка должна считать live-TCE по той же laden-дистанции, что stored (или показывать storedTce). **Verify ПОСЛЕ прод-регена #829** — может уже сойтись; если нет — чинить.
- **Tier:** S. **Status:** watch-item (verify-first). **Conflict:** economics.

### B6 — Вес-диапазон → берётся верхняя граница (57.5% грузов)

- **Файл:** `lib/parsing/parse-cargo-ai.ts:103` (toConfidence(item.weight_mt) — не применяет RANGE RULE постфактум). Промпт требует weight_mt=null при диапазоне, LLM кладёт верх.
- **Корень:** для диапазонного груза («4000-4800 MT») weightMt=верх → matching берёт верх как факт → завышает utilisation+classFit+выручку → убыточные выглядят прибыльными. Потребитель: `lib/sailing/cargo-weight.ts:16` (resolveCargoWeight → weightMtMax).
- **Фикс:** постобработка — если weightMtMin≠weightMtMax → weightMt=null (оставить min/max).
- **Tier:** M, risk-override (parser), `/test-skill` реальные shapes. **Conflict:** parse-cargo.

### B7 — Чёрное море / Вост.Средиземноморье сломаны (3 части)

- **B7a — нет цены топлива → HTTP 422.** `app/api/voyage/tce/route.ts:238-243` (hard 422 без фолбэка). Istanbul(TRIST)/Piraeus(GRPIR)/Constanta(ROCND) = 0 строк в bunker_prices. Зависит от B8.
- **B7b — port DA = $0.** `scripts/seed-data/port-da-base.json` — нет Istanbul/Constanta/Odesa/Novorossiysk → getPortDa=null → DA=0 → доходность ЧМ завышена. Фикс: добавить DA-сиды (Rule#22 --dry).
- **B7c — 24 camelCase порта → null-дистанция.** `lib/sailing/port-distances.ts:1411` (Tier-2 ключи = human-имена «Buenos Aires»), `:1419` (Tier-3/4 map-ключ mismatch). normalizePortName выдаёт camelCase (BuenosAires, Marghera, Taman, Tuapse…) → не матчит → null → unknown verdict. Фикс: нормализовать ключи (lowercase/human) consistently.
- **Tier:** B7a/B8 M-L, B7b/B7c S. **Conflict:** distance/economics + bunker.

### B8 — OilMonster bunker-адаптер не дописан (цель ветки feat/bunker)

- **Где:** спека `docs/superpowers/specs/2026-06-02-oilmonster-bunker-med-blacksea-design.md`; реализация в НЕслитом worktree `claude/friendly-stonebraker-0d5d2e` (коммит ~`00efbf20`/`e3c0d618`). `lib/knowledge/bunker/oilmonster-adapter.ts` НЕ существует на main.
- **Корень:** нет live-источника топлива для East-Med/Black-Sea → B7a (422).
- **Фикс:** смержить worktree-реализацию + bunker-cron расписание + graceful-фолбэк вместо 422 (nearest-hub). Constanta = Istanbul+$40 proxy.
- **Tier:** M-L. **Дисциплина:** rebase feat/bunker на main сначала (founder-решение). Cron нет в проде — добавить.

---

## P2 — КАЧЕСТВО / ГИГИЕНА

### B9 — 1ч-обрыв сессии (OAuth/sample теряют работу)

- **Файлы:** `lib/session-store.ts:139` (getSession lazy-delete on expiry → null → пустой экран), `lib/sample-data/create-demo-session.ts:93` (legacy createDemoSession TTL 1ч), `app/api/demo/rehydrate/route.ts` (есть для DEMO, нет для OAuth/sample).
- **Корень:** TTL сессии 1ч; OAuth/sample-юзер через 1ч → getSession=null → теряет распарсенное, без предупреждения, без реидрации (DEMO спасается middleware-rehydrate, OAuth нет).
- **Фикс:** rehydrate-путь для OAuth/sample ИЛИ предупреждение + сохранение. (DEMO уже выровнен #790.)
- **Tier:** M. **Conflict:** sessions.

### B10 — detectSpot ломается на объект-openDate → спот-суда демоутятся

- **Файлы:** `lib/sailing/readiness-gap.ts:101` (`typeof raw !== 'string' → false`), вызовы: `lib/matching/pair-analyzer.ts:96`, `lib/matching/persist-session-matches.ts:81`, `scripts/demo-seed/regenerate-matches.ts:156`.
- **Корень:** `cfValue(v.openDate)` возвращает объект `{open,close,display}` (не строку) → detectSpot тихо false → спот-судно классифицируется non-spot → idle вместо ideal → score −15..−25 вместо +10 → демоут из main в review. Нет лога, нет теста на объект-аргумент.
- **Фикс:** нормализовать openDate в строку до detectSpot (cross-cutting: 3 места — grep символ, починить ПАЧКОЙ). + seed-реген после.
- **Tier:** M, risk-override (engine), cross-cutting sweep. **Conflict:** engine + seed.

### B11b — PriceSourceBadge / CargoClient real-clock в demo (VERIFY-FIRST)

- **Файлы:** `components/economics/PriceSourceBadge.tsx:16` (Date.now() в useMemo), `app/cargo/CargoClient.tsx:368` (new Date() для month-filter), `app/cargo/page.tsx:81` (refYear real-clock).
- **Корень (заявлен):** real-clock вместо frozen useDemoNow → в demo «устарело»-флаг/фильтр считают по реальному времени. **НО:** сначала проверить, ЖИВЫЕ ли эти места (formatAge оказался мёртвым) — рендерится ли PriceSourceBadge вообще.
- **Фикс:** если живой → useDemoNow; если dead → удалить. **Status:** VERIFY-FIRST. **Tier:** S.

### B13 — Stale market/EUA/baltic сиды + starved таблицы

- **Файлы:** migrations 020/023/024/043 (вшитые даты 2026-05-09/05-04), `scripts/knowledge/cron/refresh-{bunker,eua,market-indices}.ts` (cron не запускался — 0 строк в knowledge_sync_log). `market_indices`=0 строк (TMI/Drewry графики пусты), `fx_rates`=0 (нет FX-конвертации).
- **Корень:** авто-фиды не работают на проде → рынок на сидах начала мая. Для frozen-демо ок, для live — нет.
- **Фикс:** запустить/проверить market+eua cron на проде; ИЛИ принять как frozen-by-design (решить).
- **Tier:** S-M. **Status:** частично by-design (demo заморожено).

### B14 — Выгрузки тонкие

- **Файлы:** `lib/matching/matches-csv.ts:3` (CSV только 9 колонок — нет vessel_name/fit_percent/tce_usd_per_day/dwt/laycan); `lib/voice/recap-pdf.ts:17` (PDF-код есть, НЕ подключён к роуту); Excel — отсутствует.
- **Фикс:** расширить CSV-колонки; подключить PDF-роут (если нужен); Excel — по запросу.
- **Tier:** S-M. **Gate5.**

### B15 — LLM-креды сломаны на dev-VPS (prod-check)

- **Где:** `ai_audit` (sessions.db) — 8 CLASSIFY ok=0 «ENOENT /root/.config/gcp/quantika-vertex-ai.json» (2026-05-27); MATCH ok=0 stale Bedrock model id.
- **Корень:** Gemini/Vertex креды не настроены на VPS → live classify/parse падал. Demo-режим маскирует (LLM не зовётся).
- **Фикс:** проверить креды на ПРОДЕ (outreach-vps) — работает ли live-парсинг там. Если prod тоже сломан → настроить.
- **Tier:** S (config). **Status:** prod-check needed.

### B16 — Sweep-фолбэк: сбой матч-LLM (не timeout) → пустая доска

- **Файл:** `lib/matching/pair-analyzer.ts:364-372` (non-timeout aiScorer error → `{matches:[],...blockedMatches}`, sweep НЕ запускается).
- **Корень:** при JSON-parse/refusal/network ошибке матч-LLM → 0 матчей у брокера, sweep не спасает. (seed/demo aiScorer пустой → всё sweep → ок; риск на live с кривым LLM, см. B15.)
- **Фикс:** на non-timeout ошибке — фолбэк на sweep (детерминированный скоринг), не пустой результат.
- **Tier:** M. **Conflict:** engine.

### B17 — Гигиена данных/деплоя

- **B17a** orphan: `quantika.db` (только notified_dispatches, 0 строк) vs `sessions.db` — `scripts/check-deadlines.ts:73` пишет в одну, миграция 011 создала в другой → рассинхрон.
- **B17b** `ai_audit` write-only, без reader/retention (437 строк растут).
- **B17c** `bimco_vec`=0 (BIMCO не проиндексирован) — `retrieve(bimco_vec)` → [].
- **B17d** миграция 045 (worksheet_json) не применена к локальной sessions.db (prod получит через migrate.ts — dev-инконсистентность).
- **B17e** `scripts/demo-seed/deploy.sh:17` — нет `wal_checkpoint` перед scp → может отгрузить неполный файл.
- **B17f** runbook `apply-to-prod.md:93,108` — устаревшие `pm2` команды (прод = systemd `quantika-demo.service`).
- **B17g** `scripts/demo-seed/seed-all.ts:21` — frozenDate = дата запуска по дефолту → случайный rebuild сдвинет окно, сломает laycan/openDate.
- **Tier:** S каждая, batch.

### B18 — UI разное

- **B18a** карта #671: `components/match/RouteMapButton.tsx` существует, НЕ импортирован нигде → нет Vessel/Cargo/Map layout. Фикс: подключить или убрать.
- **B18b** Sentry #668: `instrumentation-client.ts:7,14` — POST на каждую навигацию (если DSN задан), нет beforeSend-фильтра.
- **B18c** empty-state #673: `app/matches/MatchesClient.tsx:699` «No matches yet» без CTA когда jobs idle.
- **B18d** нет `error.tsx` на cargo/vessels/email/market/match/[id]/cargo[id] → bare app/error.tsx без Sentry.
- **B18e** fmtTce негатив: `app/matches/MatchesClient.tsx:99` → `$-1.1k` (надо `-$1.1k`); cards vs table формат рассинхрон.
- **B18f** ExplainDeal двойной флаг: `app/match/[id]/page.tsx:253` (server `EXPLAIN_DEAL_ENABLED`) vs `components/match/ExplainDealModal.tsx:139` (client `NEXT_PUBLIC_…`) → silent null если задан один.
- **B18g** SSE-refetch (`MatchesClient.tsx:118`) теряет dedup + laycan_display, тихо падает на 401.
- **B18h** PassportTab «Demo data» badge вшит всегда (`PassportTab.tsx:46`).
- **B18i** bunker-port null до async-ответа блокирует P&L (`EconomicsTab.tsx:76,297`).
- **Tier:** S каждая. **Gate5** для видимых.

### B19 — Движок: гейты/скоринг доп.

- **B19a** war-position гейт узкий (#784): `lib/sailing/match-filters.ts:409` — требует ВСЕХ 3 (HRA+DWT<25k+≥3 hops) → черноморские HRA на внутри-Med проходят.
- **B19b** DWT-дыра 35-50k → handysize: `lib/sailing/readiness-gap.ts:93`, `constants.ts:124` — ultramax считается медленнее + раньше ballast-cap.
- **B19c** IMSBC гейт только на явный «no DG»: `lib/sailing/imsbc-check.ts:318` — Group B проходит как caution.
- **B19d** INSERT OR IGNORE глотает апдейты: `lib/matching/matches-repository.ts:360` — ре-ран движка не обновляет существующие матчи (stale до удаления строки).
- **B19e** нет server topK-cap на `/api/matches` (`route.ts:46`) → unbounded read.
- **B19f** commission_percent schema(NUMBER) vs prompt(ConfidenceField) — `lib/schemas/parse-cargo.ts:59`, теряется confidence.
- **B19g** itemIndex нестабилен между перепарсингами (`parse-cargo-ai.ts:94`).
- **B19h** orphan-категории TCT_REQUEST/VESSEL_CERTIFICATE классифицируются, нет парсера (~4% писем теряют извлечение).
- **Tier:** S-M. **Conflict:** B19a-c/B19d-e на engine surface.

---

### B20 — Security follow-ups (из cold-review PR #830, non-blocking)

- **B20a** `/api/market/indices` — нет верхней границы на `?days=` → `?days=999999` = unbounded SQLite scan + большой JSON. Фикс: clamp days до ~365. Файл: `app/api/market/indices/route.ts` + `lib/market/market-indices-repository.ts`. (Аналог анти-паттерна topK>1000 из retriever.md.)
- **B20b** `/api/sample` — нет per-IP rate-limit на POST → быстрый churn вытесняет легит demo-сессии (cap 100, LRU eviction). Фикс: добавить endpoint в `loginRateLimiter` или отдельный лимитер в `middleware.ts`. Operational nuisance, не дыра.
- **B20c** `/api/auth/google` — inline host-header паттерн вместо безопасного `getRequestBaseUrl()` (`lib/auth/redirect-url.ts`). Host-header poisoning (LOW, мёртв в проде т.к. NEXT_PUBLIC_APP_URL задан). Не введён PR #830 (pre-existing). Cleanup-тикет для консистентности.
- **Tier:** S каждая. **Status:** non-blocking follow-up.

## ПОРЯДОК / CONFLICT-ГРУППЫ (чтобы не конфликтовать)

- **Engine surface** (последовательно, НЕ параллельно): B4, B5, B6, B10, B16, B19a-e. + после правок → seed-реген (Rule#22).
- **Parse surface:** B3, B6, B19f-g (parse-cargo/vessel).
- **Distance/bunker:** B7, B8 (после rebase feat/bunker).
- **UI surface** (параллельно-safe между собой): B1b, B14, B18\*.
- **Sessions/storage:** B9, B17\*.
- **Config/prod:** B13, B15.
- **Рекоменд. порядок:** P0(B1b) → verify B5 после #829-регена → P1 trust (B6→B10→B3→B4) → B7/B8 (Black Sea) → P2 batch.

## ДИСЦИПЛИНА (для каждого фикса)

- recon→план→exec+TDD; risk-override(parser/auth/economics/seed/normalizer)→`/test-skill`; прод-данные→Rule#22(`--dry`); user-visible→Gate5; **verify-against-reality перед фиксом** (formatAge-урок).
- Полная детализация: docs/SYSTEM-AUDIT-{0,1,2,3,4,5}.md. План волн: docs/superpowers/plans/2026-06-05-fix-program.md.
