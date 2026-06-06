# Аудит системы — Часть 4/5: ХРАНИЛИЩА

> 2026-06-05. 5 read-only Sonnet-разведчиков (схема+миграции / сессии / demo-режим+заморозка / seed-синхра / слой доступа), A→Z + проверка реальной БД.
> Ветка `feat/bunker-oilmonster-med-blacksea`. Локальная `sessions.db` = миграция v44; `demo-seed.db` = 0 байт (собирается только на MacBook/prod).

---

## ДВА ДЕМО — ОКОНЧАТЕЛЬНО ЧЁТКО (твой главный вопрос)

|                          | **Demo-1: ЗАМОРОЖЕННОЕ** (`DEMO_MODE=true`, demo.quantika.org)                                                                                   | **Demo-2: «Try Sample Data»** (DEMO_MODE off)                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| База                     | `demo-seed.db` (через SESSIONS_DB_PATH)                                                                                                          | `sessions.db`                                                                    |
| **Часы**                 | **ЗАМОРОЖЕНЫ** к `demo_seed_meta.frozen_date` — и сервер (`now()`), и клиент (`useDemoNow` через ClockProvider, PR #744 на main) видят ОДНУ дату | реальное `new Date()`                                                            |
| Вход                     | логин/пароль → авто-гидрация 3 корзин из seed                                                                                                    | кнопка «Try Sample Data» → `/api/sample` → синтетика, ребейз к реальному сегодня |
| Gmail/LLM                | выключены (early-return cached)                                                                                                                  | выключены (isSampleData guard) — тоже без LLM                                    |
| Источник матчей          | seed-строки: `user_id NULL`/`__demo_review__`/`__demo_insufficient__`                                                                            | синтетические из sample-fixtures                                                 |
| isSampleData             | true                                                                                                                                             | true (но isDemoMode=false)                                                       |
| TTL сессии               | `cookieDays×86400` (дефолт 7д, выровнено с auth-cookie — фикс #790)                                                                              | **1 час** (дефолт, legacy createDemoSession)                                     |
| Реидрация при протухании | ✅ `/api/demo/rehydrate` (middleware ловит)                                                                                                      | ❌ нет → пустой экран                                                            |

**Точки развилки (все forks):** `isDemoMode()` (`lib/demo-mode.ts:8`), `session.isSampleData`, `SESSIONS_DB_PATH` (`lib/db/index.ts:5`), `now()` (`lib/clock.ts:17`), `useDemoNow()` (`lib/clock-client.tsx:42`).

**Почему заморозка работает целиком:** server-side `now()` покрывает freshness/scoring/date-parsing/readiness; client-side `useDemoNow()` покрывает MatchesClient (laycan-expiry, fresh-badge) + market — через React Context, что исключает hydration-mismatch (#418). Покрытие подтверждено.

**Косметические байпасы (не ломают логику):** EUA/BHSI `stale`-флаг считается по реальному времени (`benchmark/route.ts:55`) → seed-данные от 2026-05-28 кажутся «устаревшими»; `economicsCalcAt`/`updated_at` = реальное время (декоративные метки). LLM-байпасы (`match/route.ts:34` refYear) недостижимы в demo (данные cached).

---

## ПОУЗЛОВОЙ ВЕРДИКТ

| Узел                    | Вход | Выход                        | Цел.      | Главная боль                                                                               |
| ----------------------- | ---- | ---------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| **1. Схема+миграции**   | ✅   | ✅ 45 миграций, идемпотентны | ⚠️        | 045 не применена локально; статик-сиды с майскими датами вшиты в миграции                  |
| **2. Сессии**           | ✅   | ⚠️                           | ⚠️ утечки | 1ч-обрыв (OAuth теряет работу); orphan match-копии не чистятся (non-demo)                  |
| **3. Demo+заморозка**   | ✅   | ✅                           | ✅        | demo-seed.db=0б локально; frozen_date кэш в памяти (нужен restart)                         |
| **4. Seed→прод синхра** | ✅   | ✅                           | ⚠️ хрупко | deploy.sh без WAL-checkpoint; runbook stale (pm2 vs systemd); freight_rate NULL            |
| **5. Слой доступа**     | ✅   | ✅                           | ⚠️        | «stored, не recompute» → фиксы движка невидимы до регена; INSERT OR IGNORE глотает апдейты |

---

## 1. СХЕМА + МИГРАЦИИ

**45 миграций (001-045), идемпотентны** (`schema_migrations` tracking, `INSERT OR IGNORE`). Runner `lib/migrations/runner.ts`. Применяются: **dev** — лениво при первом запросе (`session-store.ts:48`); **prod** — `deploy-vps.sh:47` → `migrate.ts` (явный deploy-gate, exit(1) если не применена); **seed-build** — build.ts на чистую БД.
**45 таблиц** (matching, parsing, market, knowledge-RAG, sanctions, integrations, audit, demo). matches: 26 колонок (см. Часть 3).

**Проблемы:** миграция 045 (`worksheet_json`) НЕ применена к локальной sessions.db (prod получит через migrate.ts); статик-сиды с датами 2026-05-09/05-04 вшиты в 020/023/024/043 (stale на чистой БД — пересекается с Частью 1); миграция 034 = destructive DELETE дублей без бэкапа; forward-only без rollback; `demo_seed_emails` создаётся вне runner (`onboarding/demo-seed.ts:64`).

## 2. СЕССИИ + LIFECYCLE

**Backend:** одна `sessions` таблица (id/access_token/created_at/expires_at/**data-blob**). Blob = вся UI-стейт (emails+parsed+matches), **источник правды для UI**; matches-таблица = производная (persistSessionMatches пишет из blob). Реальный размер blob: **2.2MB** (154 письма с телами). `updateSession` десериализует+сериализует весь blob каждый раз.
**TTL:** OAuth/sample = **1ч**; DEMO = cookieDays (7д, выровнено #790). Expiry ленивый (на чтение). `expireOldSessions` только при createSession (нет крона).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| 1ч-обрыв OAuth/sample → getSession=null → пустой экран, работа потеряна, без предупреждения | confirmed | `session-store.ts:139`, `matches/page.tsx:23` | OAuth-юзер теряет распарсенное через 1ч; demo спасается rehydrate, OAuth нет |
| Per-session match-копии (user_id=UUID) не чистятся при OAuth logout/expiry | confirmed | `persist-session-matches.ts:109` | matches-таблица растёт с каждым визитом |
| deleteOrphanSessionMatches только в demo-гидрации (не logout, не крон) | confirmed | `hydrate-demo-session.ts:185` | OAuth-orphan'ы не чистятся никогда |
| blob 2.2MB, updateSessionField всё равно full re-serialize | confirmed | `session-store.ts:170` | медленные записи на больших blob |
| sessions.db = один файл на сессии + knowledge(OFAC 4.5MB)+vec0(3×3MB)+ai_audit | confirmed | `session-store.ts:38` | lock-контеншн: сессия может блокировать knowledge-поиск |

## 3. DEMO-РЕЖИМ + ЗАМОРОЗКА + ГИДРАЦИЯ

**Гидрация A→Z:** login (DEMO) → `createSession('demo-seed')` → `hydrateDemoSession` → `deleteOrphanSessionMatches` + `buildDemoSessionBlob` (читает emails+parsed_results+3 корзины matches) → `updateSession(blob)`. Реидрация при протухшем session_id: middleware → `/api/demo/rehydrate`.
**Boot-guard:** `validateDemoBoot()` (`instrumentation.ts`) бросает при старте если DEMO_MODE=true но файл по SESSIONS_DB_PATH отсутствует.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| demo-seed.db=0б локально | confirmed | `data/demo-seed.db` | demo нельзя тестить локально без build на MacBook |
| frozen_date кэш в памяти (`_cachedFrozenDate`) | confirmed | `demo-mode.ts:12` | после регена seed нужен restart, иначе старая «заморозка» |
| `demo_seed_meta` пустая → hard throw рушит сервер (validateDemoBoot проверяет только файл, не строку) | confirmed | `demo-mode.ts:19` | DB без build → краш всего сервера |
| build.ts (полный) evicts live-сессии (общий файл) | confirmed | `build.ts` | полная пересборка на проде = logout всех |

## 4. SEED-ГЕНЕРАЦИЯ + СИНХРА НА ПРОД

**build.ts** (MacBook-only: raw-emails + LLM-кэш local) → **regenerate-matches.ts** (реальный движок, нормализация форм, 3 корзины; `--dry` есть и работает) → **deploy.sh** (scp на outreach-vps + systemctl restart). Rule#22: backup→--dry→inspect→checkpoint→real→verify→restart→health→visual.
**frozenDate** = аргумент или **дата запуска seed:all** (`seed-all.ts:21`).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| deploy.sh БЕЗ wal_checkpoint перед scp | confirmed | `deploy.sh:17` | scp после регена может скопировать неполный файл (WAL не слит) |
| apply-to-prod.md runbook STALE: pm2 вместо systemctl | confirmed | `apply-to-prod.md:93,108` | следование runbook → restart упадёт/не тот процесс |
| frozenDate = дата запуска по дефолту | confirmed | `seed-all.ts:21` | случайный rebuild в др. день сдвинет окно → сломает все laycan/openDate |
| regenerate-matches НЕ пишет freight_rate_usd_per_mt | confirmed | `regenerate-matches.ts:424` | seed-строки NULL (пересекается Часть 3); #829 это чинит |
| --dry-then-real: пропуск --dry → clobber курированных | confirmed (memory) | RC #747 | необратимая перезапись дефолтами |
| build.ts local + ручной scp (нет CI) | confirmed | `deploy.sh` | drift: прод можно забыть обновить |

## 5. СЛОЙ ДОСТУПА (matches-repository + market/knowledge/audit)

**matches-repository:** listMatches (SELECT stored, фильтры status/type/route/laycan/score/dwt, allowlist-сортировка — **инъекций нет**), createMatch (`INSERT OR IGNORE`), deleteOrphanSessionMatches. user_id-корзины: NULL(seed) / sentinels / sessionId(live-копии).
**Read /api/matches:** всегда scope по session, **только stored-колонки, без recompute**, нет server-cap на limit.
**Реальный инвентарь БД (локально):** sessions 4 (все expired) · matches 0 · bunker 10 (seed) · baltic 8 (seed) · eua 1 (seed) · **market_indices 0** · **fx_rates 0** · imsbc_fts 116 · igc 50 · jwc 7 · **bimco 0** · ai_audit 437 (в осн. failed eval).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| **«stored, не recompute»** → фиксы движка невидимы до регена («HTTP 200 ≠ фича») | confirmed | `api/matches/route.ts:93` | структурно: #829 не виден на проде пока seed не реген |
| INSERT OR IGNORE глотает апдейты: ре-ран движка не обновляет существующие матчи | confirmed | `matches-repository.ts:360` | stale-данные пока строку не удалить вручную |
| нет server topK-cap на /api/matches | confirmed | `api/matches/route.ts:46` | сессия с накопленными копиями → unbounded read |
| starved: market_indices/fx_rates=0 → TMI-виджет пустой, нет FX-конвертации | confirmed | DB | пересекается Часть 1 |
| orphan: quantika.db (legacy) vs sessions.db рассинхрон notified_dispatches | confirmed | `check-deadlines.ts:73` | 2 разъединённые копии таблицы |
| ai_audit write-only, без reader/retention (437 строк) | confirmed | DB | растёт без чистки; нет UI-видимости ошибок LLM |
| bimco_vec=0 (не проиндексирован) | confirmed | DB | RAG по BIMCO возвращает [] |

---

## РЕАЛЬНЫЕ БАГИ vs ПО-ДИЗАЙНУ

**По дизайну (заморозка корректна):** frozen clock (server+client), demo-seed.db, авто-гидрация, LLM-байпас. «stored, не recompute» (matches = материализованное вью) — намеренно, НО это и есть ловушка «фиксы невидимы до регена».

**Реальные баги/гигиена:**

1. **1ч-обрыв OAuth/sample** — теряет работу, без предупреждения, без rehydrate. M.
2. **orphan match-копии не чистятся (non-demo)** — рост таблицы. S-M.
3. **INSERT OR IGNORE глотает апдейты** — ре-ран ≠ обновление. S-M (архитектура).
4. **deploy.sh без WAL-checkpoint** — может шипнуть неполный seed. S.
5. **runbook stale (pm2/systemd)** — упадёт. S (doc).
6. **freight_rate NULL в seed** (#829 чинит). S.
7. **frozenDate=дата-запуска** — случайный rebuild ломает заморозку. S (guard).
8. **starved/orphan таблицы** (market_indices/fx/bimco/quantika.db/ai_audit). S cleanup.
9. **миграция 045 локально не применена** — dev-инконсистентность. XS.

**Связка серии:** источники(дыры)→парсинг(дефекты)→движок(усиливает+скоринг несвязный)→**хранилища(заморозка solid; НО сессии текут, синхра ручная-хрупкая, и главное — matches хранятся-не-пересчитываются → фиксы движка появляются только после seed-регена).** Это ПРЯМО объясняет, почему #829 после мержа требует прод-реген (Rule#22): код пофикшен, но демо-доска читает СОХРАНЁННЫЕ значения → нужен реген seed чтоб фикс проявился.
