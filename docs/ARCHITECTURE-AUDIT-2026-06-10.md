# Архитектурный аудит quantika-demo — 2026-06-10

Метод: 5 параллельных агентов-разведчиков (Fable 5), по подсистемам: архитектура/роутинг,
матчинг+экономика, данные/SQLite, AI+RAG, auth+безопасность. Каждый читал код, цитаты `file:line`.
Ничего не менялось — только разведка.

---

## TL;DR — что болит на самом деле

Один корень рассыпан по трём местам: **цена бункера $600 (дефолт) vs $791 (живая NLRTM)**.
TCE/fit считаются то на одной цене, то на другой → list и detail показывают РАЗНЫЕ числа на одном экране.
Это ровно тот класс багов, что чинили в da-51414 / tce-list-vs-detail — он не закрыт, а размазан.

Второй корень — **две конкурирующие реализации** почти везде: 2 входа в sessions.db, 2 движка TCE,
2 калькулятора экономики (один мёртвый с хардкодом), 2 копии таблицы breakeven. Любая правка одной
половины тихо расходится со второй.

Третий — **тонкий слой надёжности**: SQLite без WAL/busy_timeout (500-ки под нагрузкой),
vision/audio LLM-вызовы без таймаута (висят вечно), один публичный RAG-роут без auth и без экранирования.

---

## CRITICAL

### C1. PATCH правки фрахта пересчитывает TCE на дефолтном бункере $600, не на живом $791

`app/api/matches/[id]/route.ts:194-225` + `lib/matching/stored-match-economics.ts:75,167`
Брокер открывает матч, правит только ставку фрахта, жмёт сохранить. `computeStoredMatchEconomics`
вызывается БЕЗ `bunkerPriceUsdPerMt` → падает на `DEFAULT_BUNKER_USD_PER_MT = 600` (`lib/constants.ts:116`).
Но изначальный list-TCE был записан `persistSessionMatches` на живой цене NLRTM VLSFO = $791/mt
(`persist-session-matches.ts:53`). Итог: в списке — TCE/fit на $600-топливе (на 31% дешевле → завышенный TCE),
а блок voyage-breakdown на том же detail-экране постит в `/api/voyage/tce` с `bunkerPort=NLRTM` ($791)
и показывает ДРУГОЙ, меньший TCE. Два TCE на одном экране. Путь `reset_freight_rate` (line 194) — та же дыра.
**Фикс:** пробросить тот же `getLatestBunkerPrice(db,'NLRTM','VLSFO')`, что уже использует persist, в оба
PATCH-вызова `computeStoredMatchEconomics`. Однострочник-симметрия.

### C2. Публичный RAG-роут /api/knowledge/clauses без auth и без экранирования FTS5

`app/api/knowledge/clauses/route.ts:62,71`
Параметр `q` идёт прямо в `content MATCH ?` без экранирования FTS5 (соседний `retriever-sqlite.ts:339`
оборачивает в кавычки — этот не оборачивает). Роут без `requireSession`/CSRF/rate-limit — гейтит только
флаг `BIMCO_RAG_ENABLED`. Любой битый FTS-оператор (`q=NEAR(`, кривая кавычка, `q=*bad`) → `SQLITE_ERROR` → 500
(crash/DoS). И публично запрашивается, пока флаг включён.
**Фикс:** экранировать `q` как в retriever + добавить `requireSession` + rate-limit, либо вынести за флаг.

---

## HIGH

### H1. Два движка экономики/TCE считают стоимость судна по-разному → war-risk и totalUsd расходятся

`lib/matching/tce-calculator.ts:39,125` vs `components/match/EconomicsTab.tsx:271,331`
List-путь хардкодит `DEFAULT_VESSEL_VALUE_USD = 22_000_000`. Detail шлёт `valueUsd: estimateVesselValueUsd(dwt)`
(по классу DWT: 30k handysize → $8.4M, 75k panamax → $16.5M, никогда 22M). War-risk = vesselValue × premium%.
На транзите через Персидский залив (0.5%/transit): list показывает ~$110k hull, detail ~$42–82k для того же судна.
`totalUsd` расходится на ту же дельту. Daily-TCE совпадает только потому, что war-risk в него не входит.

### H2. Заголовок «N результатов» и сам список держат РАЗНЫЕ строки дубликата

`app/matches/page.tsx:55-56,103,123-130` vs `lib/matching/count-qualifying.ts:4-26`
Оба дедупят по ключу `vessel_name|cargo_ref|load_port|laycan_start`, оставляя ПЕРВУЮ строку. Но сортируют
по-разному ПЕРЕД дедупом: счётчик — `fit_percent desc`, список — `score desc`. Для группы дубликатов
лучший-по-fit и лучший-по-score — разные строки с разным fit_percent. Брокер видит «12 результатов»,
считает 11 (или 13) на экране. Тот же класс, что #787/#723.

### H3. Демоут с борда судит TCE по $600, борд показывает TCE по $791

`lib/matching/pair-analyzer.ts:729,822-838` + `app/api/ai/match/route.ts:110-114`
`analyzePairs` вызывается без `bunkerPriceUsdPerMt` → TCE каждой пары на $600. Роутер бакета «ниже безубытка»
(829-833) решает, остаётся ли пара на главном борде, по этому $600-TCE. После persist отображаемый TCE
пересчитан на $791 (ниже). Пара, прошедшая безубыток на $600 но сидящая ниже на $791, остаётся на борде
«стоит звонить» с под-безубыточным TCE. Гейт демоута и показанное число расходятся в топливном допущении.

### H4. Два входа в sessions.db — один течёт соединениями

`lib/db/index.ts:17` vs `lib/session-store.ts:40,261`
`getDb()` открывает НОВОЕ better-sqlite3-соединение на каждый вызов (грузит vec-расширение каждый раз,
не закрывает). `getStore()` — кэшированный синглтон. Оба на одном `SESSIONS_DB_PATH`. 6 роутов на `getDb()`,
47 на синглтоне. Под нагрузкой `getDb()`-путь копит открытые хендлы + перезагруженное расширение → утечка
хендлов/памяти, и два паттерна доступа к одному файлу без единого владельца (pragmas, транзакции, busy-timeout).

### H5. SQLite без WAL и без busy_timeout → SQLITE_BUSY под конкуренцией

`lib/session-store.ts:40`, `lib/db/index.ts:18`
Обслуживаемый `demo-seed.db` в `journal_mode=delete`, ни SessionStore ни getDb() не ставят WAL/busy_timeout
в рантайме (только dev-скрипты ставят WAL). При этом много отдельных соединений открывают тот же файл
параллельно (SessionStore пишет копии матчей на каждый рендер + независимые getDb() в email-cache, retriever).
busy_timeout=0 у better-sqlite3 → чтение на одном соединении во время записи на другом кидает SQLITE_BUSY
сразу, не ждёт. Под демо-трафиком — периодические 500, не порча данных.
**Фикс:** включить WAL + busy_timeout (5000ms) на всех рантайм-соединениях.

### H6. callAiVision и callAiAudio полностью теряют таймаут + AbortSignal

`lib/ai-provider.ts:671-710,795-839,1002-1051,1118-1151`
В отличие от text-веток, vision/audio строят свои SDK-клиенты БЕЗ `buildAbortController`, `requestTimeout`,
`Promise.race`, `abortSignal`. Вызывающие (`lib/whatsapp/image-ocr.ts:99`, `voice-transcribe.ts:81`) честно
передают `{timeoutMs, signal}` — их молча игнорируют. Зависший Vertex/Bedrock vision/audio-вызов вешает
WhatsApp-webhook навсегда (до platform maxDuration). Прямое нарушение инварианта «каждый LLM-вызов уважает timeoutMs».

### H7. retrieve() в RAG обходит guard размерности 768 и биндит сырой Float32Array

`lib/knowledge/embeddings/retriever-sqlite.ts:335,357-359`
Гибридный `retrieve()` зовёт `embedQuery()` и биндит `embedding` прямо в `vec_distance_cosine(embedding, ?)` —
НЕ через `searchVec0()`, поэтому guard `embedding.length !== 768 → RangeError` (line 59) не срабатывает.
Если Vertex вернёт вектор не той размерности (или `embedQuery` резолвится в `undefined` на пустом эмбеде) —
плохой вектор уходит в sqlite-vec без проверки. Плюс несогласованность: searchVec0 сериализует через
`JSON.stringify(Array.from(embedding))`, retrieve биндит объект Float32Array.

### H8. Seed-build build.ts пишет урезанную форму matches, расходящуюся с тем, что читает app

`scripts/demo-seed/build.ts:649-653`
`insertMatch` заполняет 16 колонок, пропускает `cargo_item_index`, `vessel_item_index`, `worksheet_json`,
`vessel_name`, `cargo_ref`, `reason_structured`, `freight_rate_usd_per_mt`, `consumption_estimated`,
`ballast_distance_nm`. Но `hydrate-demo-session.ts:101-150` читает `worksheet_json`, `*_item_index`, `tce_usd_per_day`.
Канонический 425-строчный сид делает `regenerate-matches.ts` (он заполняет всё); match-путь build.ts — устаревший
вторичный писатель. Пересборка сида через build.ts → матчи без worksheet, все item-индексы = 0 (неверное
cargo/vessel в detail-панели — ровно то, что чинила миграция 044), без freight/TCE-детали. Историческая дрейф-схема
«build.ts обошёл движок».

---

## MEDIUM

### M1. IDOR — bulk-смена статуса матчей без проверки владельца

`app/api/matches/bulk/route.ts:53-70`
PATCH зовёт `requireSession` (authn), но потом цикл по `ids` от клиента: `getMatch(db, id)` / `updateMatchStatus`
БЕЗ проверки `existing.user_id === sessionId`. `getMatch` = `SELECT * FROM matches WHERE id = ?` без фильтра
по юзеру. Все соседние роуты проверяют владельца (matches/[id] PATCH/GET, counter, audit) — только bulk не проверяет.
Эксплойт: любая залогиненная сессия шлёт `{"ids":[1,2,3,...],"status":"archived"}` и архивит чужие матчи
перебором id. MEDIUM т.к. в DEMO_MODE все сессии под одним demo_auth — но дыра авторизации реальна и единственная среди match-роутов.

### M2. Мёртвый calc экономики computeEconomics с хардкодами (20 дней, EUR→USD 1.08)

`lib/economics/index.ts:21-110`
Полный движок экономики с `estimatedDays=20` (хардкод, `// TODO(W9)`) и литералом `1.08` EUR→USD, который
НИГДЕ не вызывается. Но это публичный вход пакета (`economics/index.ts`) — будущий код потянется сюда, получит
20-дней/1.08-заглушки и тихо разойдётся с реальным путём (`buildMatchEconomics → calculateTCE`). Заранее
заряженный landmine класса «build.ts обошёл движок».

### M3. now() и demoNow() падают по-разному на одной ошибке (нет строки demo_seed_meta)

`lib/clock.ts:17-22` vs `lib/clock.ts:39-50`
`demoNow()` оборачивает в try/catch и фолбэчит на дефолтную дату. `now()` — НЕ оборачивает, кидает.
На мигрированной но не засиженной демо-БД (прод targeted-patch пересоздал таблицу, или частичный build)
каждый путь через `now()` даёт 500, а `demoNow()` тихо отдаёт фолбэк-дату. Два источника «текущего времени»
должны падать одинаково.

### M4. Парсинг session-блоба через type assertion без валидации

`lib/session-store.ts:31-33`
`JSON.parse(raw) as Omit<SessionData,...>` доверяет форме хранимого блоба. Когда тип SessionData эволюционирует,
старые строки десериализуются в объекты с пропущенными/устаревшими полями (класс laycan-object-vs-string,
openDate-bare-vs-ConfidenceField). Guard'а схемы нет — `cfValue()`/`parseLaycan()` ниже получают не ту форму
и тихо дают null/NaN вместо ошибки.

### M5. patchEconomicsComponent переклампает только один сохранённый appliedCap

`lib/matching/persist-session-matches.ts:31-33`
Когда живой TCE поднимает economics-скор, fit переклампается только об `breakdown.appliedCap.ceiling`.
Но `computeFitBreakdown` пишет `appliedCap` как ПОСЛЕДНИЙ снизивший fit cap, не обязательно самый низкий.
Когда cap с большим ceiling применён последним, сохранённый appliedCap может быть выше истинного связывающего
потолка → бамп TCE поднимает fit_percent выше cap'а, который должен держать. PATCH recomputeFit наследует тот же баг.

### M6. Две хардкод-копии таблицы breakeven могут разойтись

`lib/sailing/fit-breakdown.ts:458-461,480-483` и `lib/matching/pair-analyzer.ts:829-832`
Пороги breakeven по классам (1.5k/3k/5.5k/7.5k) продублированы дословно в economics-gradient скорере и
в floor демоута бакета. Комментарий fit-breakdown.ts:446 даже утверждает что они «совпадают с pair-analyzer.ts:835-838».
Правишь одну — fit% economics-градиент и борд-демоут расходятся, без теста их связывающего.

### M7. Commission per-MT vs lumpsum — хрупкая эвристика по величине

`lib/commission.ts:66`
`isPerMt = /\/mt|pmt|fiost|fio\b/i.test(...) || (rateNum < 1000 && !lump)`. Дорогая per-MT ставка
(сталь/проект $1,200/mt) без токена "/mt" → считается lumpsum → комиссия с $1,200 вместо $1,200 × количество,
занижение на порядки. Наоборот, малый настоящий lumpsum (<$1,000) без "lump" → per-MT × количество, завышение.

### M8. Detail-роут DA расходится с list-DA когда передан cargoType

`app/api/voyage/tce/route.ts:131-147` vs `lib/port-da/match-da.ts:46-71`
List-DA всегда берёт тариф `'general'` (cargoType намеренно игнорится). Detail передаёт `body.cargoType`
в `getPortDa`, который чтит bulk/container/tanker. Совпадают сегодня только потому, что EconomicsTab не шлёт
cargoType. Латентный parity-gap: любой кто пошлёт cargoType — получит другой DA (или 0), сдвинув весь TCE.

### M9. createMatch тихо возвращает не ту строку на частично-мигрированной БД

`lib/matching/matches-repository.ts:382-392`
`INSERT OR IGNORE`, на дубликате переселектит строку. 6 веток column-presence (`hasFitColumns` → … → bare):
на БД без свежих миграций матч вставляется с меньшим числом колонок — fit_percent, worksheet_json тихо отсутствуют
вместо падения. Плюс 8 `PRAGMA table_info` на каждый insert — горячий путь (persistSessionMatches гоняет это ~425 раз/рендер).

### M10. AI rate-limiter на спуфабельном заголовке + recap без responseSchema

`middleware.ts:222-223`, `app/api/ai/recap/route.ts:76-81`
(a) `/api/ai/*` троттл по `key = sessionId ?? forwarded ?? 'anonymous'`, где forwarded — сырой левый
x-forwarded-for (клиент-контролируемый). Ротируя X-Forwarded-For → свежий бакет 20/min на каждое значение →
неограниченный LLM-спенд. Смягчено: нужен валидный demo_auth + CSRF. (b) RECAP-скоуп зовёт callAiJson без
responseSchema — на Gemini выживает через фолбэк extractJson, но опирается на неявный фолбэк вместо инварианта.

---

## LOW (список, детали в коде)

- L1. Тихий фолбэк провайдера на "openai" на неизвестном значении — маскирует опечатку в env (`ai-provider.ts:484-490`).
- L2. OpenAI-провайдер возвращает `undefined` на JSON-parse-fail → TypeError у вызывающих на rollback-пути (`ai-provider.ts:531`, `openai.ts:122-126`).
- L3. Baltic-фрахт делит на округлённые laden-дни, TCE — на неокруглённые (`freight-resolver.ts:73` vs `canonical-tce-inputs.ts:48-50`).
- L4. Economics fit-компонент округляется до целого, остальные 9 факторов — до десятой (`fit-breakdown.ts:473`).
- L5. Laytime ±0.01h «balanced» vs demurrage строгий `>0` — статус и сумма расходятся на копейки (`laytime/calculator.ts:131` vs `dd-calculator.ts:60`).
- L6. WhatsApp internal-ingest сравнивает токен не constant-time (`whatsapp/ingest/route.ts:17`).
- L7. State-changing роуты опираются только на SameSite=Lax для CSRF (charterers, matches, me, settings, cargo/import...).
- L8. validateCsrf (Origin/Referer) полностью выключен в development (`csrf.ts:36`) — staging-деплой без CSRF.
- L9. Vertex-retriever без SQLite-фолбэка на ошибке — повтор инцидента 2026-05-17 если KNOWLEDGE_BACKEND=vertex (`retriever-vertex.ts:168`).
- L10. Нет rate-limit на дорогих RAG/embed эндпоинтах (`knowledge/clauses`, embed в retriever).
- L11. config/flag sprawl: 102 env-переменных в 75 файлах, нет центрального lib/flags.ts.
- L12. lib/types.ts — 780 строк, 148 импортёров (структурный chokepoint, пока type-only без цикла).
- L13. 19 API-роутов с сырым SQL прямо в handler, без сервис-слоя.

---

## Что проверено и ЧИСТО (не гонять повторно)

- Admin-auth: все 4 `/api/admin/*` корректно гейтятся requireAdmin/cron-secret, все в AUTH_BYPASS_PATHS. Инварианты admin-api.md держатся.
- SQL-инъекций из user input нет: весь рантайм-SQL параметризован, динамические имена таблиц — из хардкод-констант/allowlist.
- Command injection нет: только `spawnSync('claude', args)` массивом, под NEXT_RUNTIME-guard.
- XSS: оба dangerouslySetInnerHTML инжектят статический THEME_SCRIPT, не user-контент.
- Секреты: .env.demo — только флаги, .env*.local в gitignore, NEXT*PUBLIC** — только публичные ключи.
- Session-токены: randomUUID + crypto.getRandomValues, demo_auth HMAC-SHA256. Не Math.random.
- Prompt-injection: planner фильтрует LLM-вывод об allowlist PLAN_STEP_KINDS, side-effect требует approval.
- extractJson — корректный brace-balancing парсер, держит Bedrock CoT-преамбулу.
- Client→server leak: два "use client" с импортом lib/\* чисты (только in-memory cache + fetch, без db/fs/secrets).

---

## Рекомендованный порядок (по соотношению боль/усилие)

1. **C1** — однострочник-симметрия (тот же bunker price в PATCH), убирает самый видимый list-vs-detail баг.
2. **H4+H5** — WAL + busy_timeout + единый владелец sessions.db: дёшево, убирает 500-ки под нагрузкой.
3. **C2** — экранировать + закрыть auth на clauses-роуте.
4. **H6** — пробросить timeout/signal в vision/audio (копипаст из text-веток).
5. **Структурный корень** — свести TCE/экономику на ОДНОГО владельца (H1, H3, M2, M6 — все из «$600 vs $791» + дубль-движки). Это план волны, не однострочник.
