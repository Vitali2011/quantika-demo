# Аудит системы — Часть 1/5: ИСТОЧНИКИ

> 2026-06-05. 5 read-only Sonnet-разведчиков, каждый трассировал один источник A→Z + проверял реальное содержимое БД.
> Ветка: `feat/bunker-oilmonster-med-blacksea`.

---

## ГЛАВНЫЙ ВЫВОД (4 темы)

1. **Источники построены, но НЕ кормятся живыми данными.** Все авто-источники (bunker-cron, market-cron, EUA-cron, RAG) в реальной БД содержат ТОЛЬКО статичные migration-сиды начала мая 2026. `knowledge_sync_log` не имеет ни одной записи о market/bunker/EUA-обновлении — авто-обновление НИ РАЗУ не запускалось против этой БД. Для замороженного демо это ок (так задумано), но «живое» демо тоже не живое по bunker/market.
2. **Эта ветка пустая по своей цели.** `feat/bunker-oilmonster-med-blacksea` содержит ТОЛЬКО спеку OilMonster. Сам адаптер `oilmonster-adapter.ts` живёт в неслитом worktree `claude/friendly-stonebraker-0d5d2e` (коммит `00efbf20`). Плюс ветка отстаёт от main по EUA-cron (PR #739) и TCE-фиксам.
3. **Чёрное море / Восточное Средиземноморье — целевой регион — покрыт ХУЖЕ всего.** Нет цены топлива (TCE → HTTP 422), нет портовых сборов DA ($0 в расчёте), часть портов (Taman, Tuapse) дают null-дистанцию. Экономика именно того региона, под который продукт, — сломана или занижена.
4. **Кластер auth-bypass багов.** `/api/sample`, `/api/auth/google`, `/api/market/{eua-kpi,tmi,indices}` НЕ в `AUTH_BYPASS_PATHS` → на demo.quantika.org (DEMO_AUTH_ENABLED=true) кнопки «Try sample data» / «Connect Gmail» и часть /market молча получают 401/302. Это первопричина qa-walker #667.

---

## ПОСУТОЧНЫЙ ВЕРДИКТ ПО ИСТОЧНИКАМ

| Источник                             | Лог. ВХОД               | Лог. ВЫХОД                   | Целостно?             | Главная проблема                                                                      |
| ------------------------------------ | ----------------------- | ---------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| **1. Письма (Gmail/corpus/sample)**  | ✅ 4 режима             | ✅ session + parse           | ⚠️ в основном         | auth-bypass ломает sample/Gmail на demo; OAuth 1h без refresh                         |
| **2. Bunker (топливо)**              | ⚠️ cron не запланирован | ✅ getLatestBunkerPrice      | ❌ НЕТ для Чёрного м. | OilMonster не слит; Istanbul/Piraeus/Constanta → 422; данные static-seed 27 дней      |
| **3. Market (Baltic/EUA/TMI)**       | ✅ скраперы есть        | ✅ KPI/freight/ETS           | ❌ почти пусто        | market_indices=0 строк; EUA на сиде 32 дня; cron не запускался                        |
| **4. Справочники (порты/дистанции)** | ✅ статик-импорт        | ✅ matching+econ             | ⚠️ дыры               | 24 camelCase порта → null-дистанция; DA 0/6 Чёрного м.; haversine врёт 40-60%         |
| **5. Knowledge/RAG**                 | ✅ embed-пайплайн       | ✅ 4 потребителя (try/catch) | ✅ 3 из 4             | BIMCO=0 строк; env-URLs не задокументированы; Vertex Standard-tier (пофикшено флагом) |

---

## 1. ПИСЬМА (первичный источник)

**4 режима входа:** (A) Live Gmail OAuth `POST /api/emails/fetch` → `fetchGmailEmails` (`lib/google.ts:36`); (B) corpus `.private/etms-corpus.json` (154 письма) `POST /api/etms-demo`; (C) sample-data `POST /api/sample` (синтетика с `{{LAYCAN}}`-маркерами); (D) demo-seed `hydrateDemoSession` при логине.
**Выход:** `session.emails` → classify → parse-cargo/vessel → matches. Плюс кэш в `emails`/`parsed_results` таблицах (только новые письма идут в LLM).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| OAuth `access_type:'online'` — токен 1ч, нет refresh | confirmed | `lib/google.ts:19` | live-юзер рвётся через 1ч, нужен релогин |
| `/api/sample`,`/api/auth/google`,`/api/etms-demo` НЕ в bypass | confirmed | `middleware.ts:9-43` | «Try sample»/«Connect Gmail» 401/302 на demo (qa #667) |
| Live Gmail `q:''` без фильтра ярлыка + без dedup | confirmed | `lib/google.ts:42` | тянет 50 любых писем, дубли при пере-форварде |
| `lib/jobs/process-email.ts` — мёртвая заглушка | confirmed | `process-email.ts:21` | сбивает с толку при анализе кода |
| Анонимизация CONTACT N — неполный маппинг | suspected | `seed-all.ts:51` | риск утечки PII в публичное демо |
| Нет guard на мин. длину body в parse-cargo pipeline | confirmed | `lib/google.ts:107` | пустые письма жгут LLM-токены |

## 2. BUNKER (топливо)

**Источники:** USDA API (`usda-adapter.ts`), Ship&Bunker scrape (`shipandbunker-adapter.ts`), OilMonster (СПЕКА, адаптер не на ветке). Cron `refresh-bunker.ts` запускает USDA+S&B, но **расписания нет**.
**Выход:** `bunker_prices` → `getLatestBunkerPrice` → `/api/voyage/tce` (хард-422 без фолбэка), compare-routes, KPI.

**Реальное содержимое БД:** 10 строк, ВСЕ `static-seed` 2026-05-09 (NLRTM/SGSIN/AEFJR/USHOU/GIGIB). USDA/S&B cron **никогда не отрабатывал** (0 строк bunker-\* в sync_log). Istanbul/Piraeus/Constanta = **0 строк**.

**Проблемы:** OilMonster не слит (только worktree `claude/friendly-stonebraker-0d5d2e`); нет cron-расписания → данные 27 дней; S&B Istanbul/Piraeus мёртвые (free-страница их не отдаёт); хард-422 без graceful-фолбэка; нет heartbeat/мониторинга свежести.

## 3. MARKET (Baltic / EUA / Toepfer)

**Источники:** handybulk-scrape (BHSI/BDI/BCI), EEX→ICAP (EUA), Toepfer-scrape (TMI), admin CSV-upload. Скраперы и systemd-таймеры существуют (market-indices.timer в ops/), EUA-таймер — только в main (PR #739, не на ветке).
**Выход:** `eua_prices`→ETS+KPI; `baltic_indices`(TC $/day)→Tier-2 freight; `market_indices`→/market графики.

**Реальное содержимое БД:** `market_indices`=**0 строк** (TMI/BHSI графики пусты, /api/market/tmi→404). `baltic_indices`=8 строк static-seed 2026-05-09. `eua_prices`=1 строка seed 2026-05-04 (€72.65). 0 market-записей в sync_log → авто-рефреш не запускался.

**Проблемы:** market_indices пуст; EUA на 32-дневном сиде; market-cron вероятно не установлен на prod; `eua-kpi`/`tmi`/`indices` не в bypass → аноним /market молча пустой; `ets.ts` имеет ОТДЕЛЬНЫЙ EUA-фолбэк €87.5 (рассинхрон с DB-путём €72.65); sample-CSV фолбэк-файлы пустые (мёртвый код); TOEPFER_TMI в baltic_indices — orphan-строка.

## 4. СПРАВОЧНИКИ (порты / дистанции / DA / каналы)

**Данные:** `port-master.json` (471 порт, все с координатами, генерится скриптом ad-hoc); `DISTANCES_NM` (554 ручные пары, Чёрное↔Med покрыто Tier-1); `searoute-pairs.json` (105 011 пар); port DA (39 портов); canal-tariffs (22 строки).
**Каскад дистанций:** Tier1 матрица → Tier2 searoute JSON → Tier3 live searoute → Tier4 haversine (врёт 40-60% на каналах) → Tier5 centroid → null. Неизвестный порт → null → verdict `unknown` (не краш — graceful).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| 24 camelCase имени (BuenosAires, Marghera, Taman, Tuapse…) не матчат Tier-2 (ключи «Buenos Aires») НИ Tier-3/4 (ключ map mismatch) | confirmed | `port-distances.ts:1411,1419` | эти порты → null-дистанция → unknown, кроме пар в Tier-1 |
| Port DA: Istanbul/Constanta/Odesa/Novorossiysk ОТСУТСТВУЮТ (0/6) | confirmed | `port-da-base.json` | DA=$0 → экономика Чёрного м. занижена |
| DWT-класс: дыра 35k-50k → handysize-скорость для handymax | confirmed | `constants.ts:120` | неверная скорость/радиус балласта |
| `route-decision.ts` DISTANCE_TABLE = 5 пар, дефолт 9000/12500nm | confirmed | `route-decision.ts:116` | Suez-vs-Cape бессмыслен для большинства пар |
| Canal seed без Suez container/general | confirmed | `canal-tariffs-base.json` | quoteSuez бросает для container |
| Нет validation-гейта при добавлении порта | confirmed | manual edit | новый порт легко рассинхронить с матрицей/DA |

## 5. KNOWLEDGE / RAG

**Источники:** IMSBC/IGC/JWC (HTML-scrape) + BIMCO (статик-fixture). Embed: Vertex `text-multilingual-embedding-002`, Float32[768] → vec0+FTS5. Флаг `KNOWLEDGE_RAG_ENABLED`.
**Выход (4 потребителя, все try/catch → graceful):** parse-cargo (IMSBC-контекст), draft-quote (IMSBC+IGC), match (IGC), compare-routes (JWC). **IMSBC-ГЕЙТ матчинга — отдельный статик-JSON** (`imsbc-groups.json`, 31 запись), НЕ RAG, работает всегда.

**Реальные строки:** imsbc_vec=116, igc_vec=50, jwc_vec=7 (все 2026-05-08, fresh), **bimco_vec=0** (никогда не индексировался).

**Проблемы:** `IMSBC_SOURCE_URL`/`IGC_SOURCE_URL` нет в `.env.local.example` (реэмбед падает на новой машине); BIMCO пуст; Vertex Standard-tier (исторический 100%-провал, ПОФИКШЕНО флагом `VERTEX_USE_ENTERPRISE_EXTRACTIVE` default-off); `KNOWLEDGE_BACKEND`/`VERTEX_ENGINE_*` не задокументированы.

---

## РЕАЛЬНЫЕ БАГИ vs ЗАМОРОЗКА-ПО-ДИЗАЙНУ

**По дизайну (НЕ баги — демо заморожено):** static-seed baltic/EUA; авто-cron не бежит локально; RAG dev неполный vs prod.

**Реальные баги (стоит чинить):**

1. **auth-bypass кластер** (#667) — sample/Gmail/market не в bypass → кнопки лендинга мертвы на demo. Маленький фикс, большой UX-эффект.
2. **Bunker для Чёрного м.** — OilMonster слить из worktree + bunker-cron расписание + graceful-фолбэк вместо 422. Это ЦЕЛЬ ветки.
3. **24 camelCase порта → null-дистанция** — нормализация даёт camelCase, а ключи — human-имена. Чинит дистанцию/экономику для этих портов.
4. **Port DA 0/6 Чёрного м.** — добавить DA-сиды Istanbul/Constanta/Odesa/Novorossiysk.
5. **OAuth без refresh-token** — live-юзеры рвутся через 1ч (для демо-режима не критично).

**Branch-drift:** EUA-cron (#739) и TCE-фиксы (#798/#824) на main, не на этой ветке. Перед продолжением bunker-работы — rebase на main.
