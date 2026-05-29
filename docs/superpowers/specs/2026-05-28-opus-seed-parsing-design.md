# Quantika Demo — Opus-разбор и заполнение демо (гибрид «клерк + аналитик»)

**Date:** 2026-05-28
**Status:** Design approved (Виталий, orchestrator session), ready for implementation plan
**Owner:** Виталий (founder)
**Parent spec:** [`2026-05-27-quantika-demo-frozen-snapshot-design.md`](2026-05-27-quantika-demo-frozen-snapshot-design.md) — заморозка «сегодня», `DEMO_MODE`, сдвиг дат
**Depends on:** PR #650 (`dispatch/603-progong`) — укреплённые промпты (4 парсера) + `lib/parsing/geared-fallback.ts` B1-B8 + `scripts/demo-seed/llm-cache.ts`

## Цель

Заполнить демо-базу Quantika (153 broker email) **один раз через Opus 4.8**, а не через Gemini, и хранить результат **только на проде**, мимо публичного git. Демо застывает: партнёр видит свежие, связные, анонимизированные данные, не пересобирая ничего при старте.

Три свойства результата:
1. **Opus-качество разбора.** Per-email разбор делает Opus 4.8 через провайдер `claude-cli` (подписка пользователя, $0 API). Системная инструкция = укреплённые промпты PR #650 (17 D-rules + 4 Gemini-quirk guards как domain-знание).
2. **Связность (thread-awareness).** Отдельный Opus-проход «аналитик» видит весь разбор сразу: канонизирует имена судов/клиентов/брокеров across писем, дедуп, строит карту анонимизации, ловит cross-email нестыковки.
3. **Prod-only данные.** `demo-seed.db` и карта анонимизации (с реальными именами) **не коммитятся в git** — живут локально + деплоятся на прод. В публичный репозиторий идут только скрипты-сборщики.

## Зафиксированные решения

| Решение | Выбор | Обоснование |
|---|---|---|
| Движок разбора | Opus 4.8 (не Gemini) | One-shot стоимость тривиальна; Opus заведомо лучше (PR #650 — 16 раундов Opus ловил Gemini failure modes); демо смотрят 1× → качество > parity с live runtime |
| Форма workflow | Гибрид: детерминированный per-email спайн + Opus reconciliation-проход | Повторяемость спайна (через кэш) + thread-awareness аналитика; чистая `max-dynamic` сессия ломает воспроизводимость |
| Хранение данных | Prod-only, gitignored | Реальные письма ETM-Services и имена клиентов физически не попадают в публичный git; снимается риск утечки + не нужен Git LFS |
| Имена в демо | Анонимные псевдонимы | Демо видят другие форвардеры (возможные конкуренты ETM); псевдонимы берегут конфиденциальность; цифры/порты/грузы остаются реальными |
| QA-гейт | Авто-валидаторы (hard) + Opus-сводка на глаз | Партнёр-facing демо: leak-detector обязателен; сводка даёт founder'у видимость перед деплоем |

## Не-цели

- `clock.ts` codemod и заморозка `new Date()` → родительский спек (frozen-snapshot)
- Real-time Gmail flow в `DEMO_MODE`
- Runtime-добавление писем в seed (требует rebuild)
- Переархитектура match-движка (Engine 3) — только прекомпьют матчей через Opus для seed
- Коммит `demo-seed.db` / `manifest.json` в git (явно отклонено)
- Bit-identical воспроизводимость самого Opus-разбора (LLM недетерминирован; воспроизводимость даёт кэш, см. ниже)

## Связь с родительским спеком

Из frozen-snapshot переиспользуем **без изменений**: `lib/clock.ts`, `lib/demo-mode.ts`, `.env.demo`, `DEMO_MODE` runtime-guards, логику per-email сдвига дат в `analyze.ts`.

**Меняем две вещи родительского спека:**
1. Движок разбора в Phase 0/1: Gemini-парсеры → Opus 4.8 гибрид.
2. `demo-seed.db` и `manifest.json` (карта анонимизации) → **не в git** (родительский спек коммитил их; `manifest.json` с картой `реальное→псевдоним` в публичном git сам по себе был утечкой реальных имён — это решение чинит и тот баг).

## Где что живёт

| Место | Содержимое | Почему |
|---|---|---|
| **Git (публичный)** | `opus-parse.ts`, `reconcile.ts`, `analyze.ts`, `build.ts`, `validators.ts`, `clock.ts`, `demo-mode.ts`, `.env.demo` (шаблон), golden-тесты на **синтетических** фикстурах | Код — открыт; данных нет |
| **Локально (gitignored)** | `.private/raw-emails/*.json` (153 реальных), `.llm-cache/<hash>.json` (Opus-разбор), `manifest.json` (offsets дат + карта анонимизации с реальными именами) | Источник правды демо; реальные имена не утекают |
| **Прод (gitignored, deployed)** | `data/demo-seed.db` (анонимизирована, даты сдвинуты, заморожена) | Приложение читает через `DEMO_MODE=true` + `SESSIONS_DB_PATH` |

## Архитектура (6 компонентов)

| # | Компонент | Файл | Ответственность |
|---|---|---|---|
| 1 | **Клерк** (per-email parse) | `scripts/demo-seed/opus-parse.ts` (переписать из `parse-llm-direct.ts` PR #650) | Opus 4.8 через `claude-cli`, письмо-за-письмом: classify → parse-cargo/vessel/recap по категории. Системная инструкция = укреплённые промпты PR #650. Результат → `.llm-cache/<hash>.json`. Stateless per email. |
| 2 | **Аналитик** (reconciliation) | `scripts/demo-seed/reconcile.ts` (новый) | Opus видит весь разбор сразу: канонизирует имена судов/клиентов/брокеров across писем, дедуп, строит карту анонимизации (реальное→псевдоним), флагует cross-email нестыковки. Выход → дополняет `manifest.json`. Кэшируется. |
| 3 | **Сдвиг дат** | `scripts/demo-seed/analyze.ts` (есть на main, адаптировать) | Считает per-email `offsetDays`, чтобы laycan/open_date попали в свежее окно вокруг `frozenDate`. Читает из Opus-кэша (не из Gemini). |
| 4 | **Сборка** | `scripts/demo-seed/build.ts` (есть на main, адаптировать) | Применяет сдвиг дат + карту анонимизации → пишет `demo-seed.db`. Прекомпьют матчей cargo↔vessel тем же Opus (`claude-cli`) для consistency. |
| 5 | **Валидаторы + сводка** | `scripts/demo-seed/validators.ts` (новый) | Авто-сторож (leak / schema / sanity) + Opus-сводка founder'у перед деплоем. |
| 6 | **Деплой** | `scripts/demo-seed/deploy.sh` (новый) или ручной | `scp demo-seed.db` на прод (outreach-vps); приложение читает через `DEMO_MODE=true`. |

## Data flow

```
.private/raw-emails/*.json (153, gitignored, реальные ETM-Services)
        │
        ▼  [1] opus-parse.ts — Opus 4.8 (claude-cli), per-email, hardened prompts PR #650
.llm-cache/<hash>.json (gitignored, разбор)
        │
        ▼  [2] reconcile.ts — Opus thread-aware: канонизация имён, дедуп, карта анонимизации
manifest.json (gitignored: offsets дат + anonymization map с реальными именами)
        │  ◄── [3] analyze.ts дополняет offsetDays (свежее окно вокруг frozenDate)
        ▼  [4] build.ts — сдвиг дат + анонимизация + прекомпьют матчей (Opus)
data/demo-seed.db (gitignored, анонимизирована)
        │
        ▼  [5] validators.ts — leak=0 (hard gate) + schema + sanity + Opus-сводка founder'у
        ▼  [6] deploy.sh — scp на прод
prod (DEMO_MODE=true) — читает demo-seed.db, clock.now()=frozenDate
```

## Воспроизводимость через кэш

Opus недетерминирован (живой ум). Воспроизводимость даёт **кэш**, а не модель:
- Первый прогон `opus-parse.ts` разбирает 153 письма → пишет `.llm-cache/<hash>.json`. То же для `reconcile.ts`.
- `build.ts` собирает `demo-seed.db` **детерминированно из кэша** (чистая трансформация: сдвиг+анонимизация). Один кэш → байт-идентичная база.
- Кэш — локальный источник правды демо (бэкапим). Пока он на месте, пересборка одинакова. Удалил кэш → свежий Opus-разбор (может чуть отличаться) — это осознанный re-seed, не норма.
- **Инвалидация кэша:** ключ = hash(email body + parser_version). Меняется письмо или версия промпта → miss → reparse только затронутого.

## QA-гейт

**Авто-валидаторы (hard gate — сборка падает при провале):**
1. **Leak-detector:** grep финальной `demo-seed.db` (все text-поля) на любое реальное имя из `manifest.anonymization` (vessels/charterers/brokers/sender_emails) → **0 совпадений**. Также regex на known real-domain (`etm-services`) → 0.
2. **Schema:** каждая `parsed_results` строка валидна против `CLASSIFY/PARSE_*_SCHEMA`.
3. **Sanity:** даты в окне `[frozenDate - 21d, frozenDate + 14d]`; нет артефактов (`{value:'null'}`, `{value:0, source_text:''}`, `vessel_yob=0`); ≥120 active матчей.

**Opus-сводка (на глаз перед деплоем):** counts (cargo/vessel/recap/classify), топ-N матчей, превью карты анонимизации, список флагов от reconcile (cross-email нестыковки). Печатается в консоль; founder подтверждает деплой.

## Анонимизация (деталь)

- Строит **аналитик** (компонент 2), не отдельный шаг — он уже видит все канонические имена.
- Псевдонимы детерминированы по порядку первого появления: `M/V SEAGULL 1`, `M/V SEAGULL 2`, `GRAIN TRADER A`, `DEMO BROKER`, `broker@demo.local`.
- Анонимизируем: имена судов, charterers, owners, brokers, account-компании, sender emails, телефоны/контакты в подписях.
- **Оставляем реальными:** порты, грузы (commodity), тоннажи, ставки, даты (сдвинутые), laytime-термины — это «мясо» демо.
- Карта `реальное→псевдоним` живёт в `manifest.json` (gitignored), нужна для re-seed и для leak-detector.

## Edge cases

| Случай | Поведение |
|---|---|
| Новое письмо в `.private/` без записи в кэше | `opus-parse.ts` reparse'ит только его (cache miss по hash); `reconcile.ts` перестраивает manifest; founder ревьюит diff |
| Opus вернул невалидный JSON | `extractJson()` + до 2 ретраев; после — письмо в `parse_failures[]`, сборка продолжается, флаг в сводке |
| Reconcile нашёл конфликт имён (один email = два разных судна по тексту) | Флаг в `manifest.conflicts[]`, попадает в Opus-сводку founder'у; не fatal |
| Leak-detector нашёл реальное имя | **Сборка падает** (exit≠0) с указанием поля/строки; деплой невозможен |
| `DEMO_MODE=true` но `demo-seed.db` отсутствует на проде | App boot fails с явным сообщением (родительский спек), НЕ silent fallback |
| Карта анонимизации не покрывает имя | `reconcile.ts` экзитит со списком `anonymization_unknowns`; build отказывается |

## Тестирование

| Слой | Что проверяем | Вызывает Opus? |
|---|---|---|
| Unit | `reconcile.ts` канонизация/дедуп на фикстурах; `validators.ts` leak-detector ловит подсаженное реальное имя; anonymization детерминирована | Нет (фикстуры) |
| Golden | фикстура-кэш (5-10 синтетических писем) + manifest → байт-точная `demo-seed.db` (через `sqlite3 .dump` diff) | Нет |
| Integration | App boot `DEMO_MODE=true` + missing `demo-seed.db` → exit≠0 | Нет |
| E2E (playwright) | прод/локально `DEMO_MODE=true` → `/matches` ≥120 свежих матчей, 0 «stale» на 1-й странице; `/market` as-of в окне; grep DOM на реальные имена = 0 | Нет |
| Manual (one-shot) | реальный прогон 153 писем через Opus → Opus-сводка глазами founder'а | Да (локально, подписка) |

> CI **не вызывает** Opus (нет токена, дорого/медленно). CI тестирует детерминированную часть (build/anonymize/shift/validators) на синтетических фикстурах. Opus-разбор — manual one-shot локально.

## Зависимости и порядок

1. **PR #650 должен быть смержен** (или implementation базируется на `dispatch/603-progong`): нужны укреплённые промпты 4 парсеров + `geared-fallback.ts` B1-B8 + `llm-cache.ts`.
2. Родительский frozen-snapshot (`clock.ts` + `DEMO_MODE`) — может идти параллельно; для prod-чтения базы нужен до деплоя.

## Migration / rollout

1. Land `opus-parse.ts` (переписать `parse-llm-direct.ts` на `claude-cli`) + `reconcile.ts` + `validators.ts` + unit/golden тесты — одна PR.
2. Manual one-shot локально: `opus-parse` → `reconcile` → ревью manifest → `analyze` → `build` → `validators` (сводка глазами).
3. `.gitignore`: `data/demo-seed.db`, `.llm-cache/`, `scripts/demo-seed/manifest.json`, `.private/`.
4. Land frozen-snapshot wiring (`clock.ts` + `DEMO_MODE`), если ещё не на проде.
5. `deploy.sh`: `scp demo-seed.db` на прод; прод-env `DEMO_MODE=true`.
6. Verify: `/matches` ≥120 active; leak-grep на проде = 0.

## Acceptance criteria

- [ ] `scripts/demo-seed/opus-parse.ts` разбирает `.private/raw-emails/*.json` через `claude-cli` (Opus 4.8) + hardened prompts → `.llm-cache/`
- [ ] `scripts/demo-seed/reconcile.ts` строит канонические имена + карту анонимизации + флаги, дополняет `manifest.json`
- [ ] `build.ts` производит `demo-seed.db` детерминированно из фиксированного кэша+manifest (golden bit-exact)
- [ ] Leak-detector: grep `demo-seed.db` на любое реальное имя из карты + `etm-services` → **0 hits** (иначе build падает)
- [ ] `DEMO_MODE=true` + `demo-seed.db` → `/matches` рендерит ≥120 active матчей со свежими датами
- [ ] `data/demo-seed.db`, `.llm-cache/`, `manifest.json` — в `.gitignore`, не в публичном репо
- [ ] Opus-сводка печатается перед деплоем (counts + топ матчей + превью анонимизации + флаги)
- [ ] CI-тесты зелёные без вызова Opus (синтетические фикстуры)

## Open questions для writing-plans

- Прекомпьют матчей в `build.ts` — через Opus (`claude-cli`) или оставить текущий match-провайдер? (Recommended: Opus для consistency «всё демо одной рукой»)
- `reconcile.ts` — отдельный Opus-вызов на весь корпус (один большой контекст ~153 писем) или батчами с merge? (Recommended: батчами по ~30 с merge-проходом, чтобы влезть в контекст и быть рестартуемым)
- `deploy.sh` идемпотентность — бэкап старой `demo-seed.db` на проде перед заменой? (Recommended: да, `demo-seed.db.bak`)
