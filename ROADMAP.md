# ROADMAP — Foundation Wave (на основе аудита 2026-04-15)

Источник: `.claude/audit/AUDIT_REPORT.md`. Полный отчёт по 30 находкам
в 6 категориях. Этот ROADMAP — **первая итерация**: 8 работ для
закрытия P0/P1 рисков безопасности, надёжности и качества перед тем
как продукт будет готов к командной разработке и production-нагрузке.

Backlog следующих итераций (UX, refactor, ops, polish): см.
`.claude/audit/BACKLOG_FUTURE.md`.

## Контекст продукта

quantika-demo — Next.js 14 продукт для AI-триажа freight email через
Gmail + Claude/OpenAI. Стек: Next.js (app router), TypeScript, OpenAI
SDK через ClipProxy, googleapis, Tailwind + shadcn. Деплой PM2 + Caddy
на VPS. Сессии в памяти, без БД.

Главные риски сейчас (что закрываем этой волной):
- Сессии теряются при рестарте → данные пользователя исчезают
- Нет CSRF на AI-эндпоинтах → атакующий может жечь OpenAI-счёт
- `ignoreBuildErrors: true` скрывает TS-ошибки
- Нет CI → никто не проверяет lint/тесты/audit перед merge
- Покрытие тестами 1.4% → любая правка рискованна
- 5 уязвимостей в зависимостях (4 HIGH)

## Verify-команды (запускаются после каждой волны)

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

## Работы по волнам

### Волна 1 — Foundation (параллельно, 3 работы)

Цель: убрать P0 риски безопасности и сборки. Без этого дальше идти
опасно.

#### work-1: Убрать `ignoreBuildErrors` и починить TypeScript-ошибки

В `next.config.mjs:4` стоит `typescript: { ignoreBuildErrors: true }`
— TS-ошибки не блокируют build, ценность типизации аннулирована.

Надо: убрать флаг, прогнать `npx tsc --noEmit`, починить все
обнаруженные TS-ошибки. После починки `npm run build` должен
проходить чисто. Не вводить новые `: any` для обхода — использовать
правильные типы или `unknown` + проверка.

Файлы: `next.config.mjs`, любые `.ts`/`.tsx` где найдены ошибки.

Acceptance: `npm run build` зелёный, `next.config.mjs` без
ignoreBuildErrors, количество `: any` в коде не больше текущих 36.

#### work-2: Закрыть уязвимости в зависимостях

`npm audit` показывает 4 HIGH (`glob` CWE-78, `@next/eslint-plugin-
next`, `eslint-config-next` через glob, `next` — проверить advisories)
и 1 MODERATE (`@hono/node-server` path traversal).

Надо: `npm audit fix`, мажорный bump `eslint-config-next` до 16.2.3+
если нужно, ручное разрешение оставшихся. После: `npm audit --audit-
level=high` показывает 0 уязвимостей.

Файлы: `package.json`, `package-lock.json`.

Acceptance: `npm audit --audit-level=high` чистый, `npm run build`
всё ещё проходит, существующие тесты зелёные.

#### work-3: CSRF-защита на изменяющих эндпоинтах

Все POST-роуты в `app/api/ai/*` принимают запрос только по session_id
из cookie, без CSRF-токена. Атакующий с другого сайта может
триггерить вызовы OpenAI на счёт пользователя. `app/api/sample` ещё
хуже — GET-роут создаёт сессию по клику.

Надо: middleware или helper для проверки CSRF-токена в header
`X-CSRF-Token`. Токен выдаётся при создании сессии (cookie + meta-tag
для frontend). Перевести `/api/sample` с GET на POST. Тесты на отказ
без токена и принятие с правильным токеном.

Файлы: `app/api/**/route.ts`, `lib/csrf.ts` (новый), `middleware.ts`
(возможно новый), фронт-помощник для подмешивания токена в fetch.

Acceptance: запрос без токена → 403, запрос с токеном → работает,
`/api/sample` теперь POST, есть тесты.

### Волна 2 — Reliability (параллельно после Волны 1, 3 работы)

Цель: пережить рестарт и получить тестовую сетку для безопасных
рефакторингов.

#### work-4: Persistent сессии через SQLite

`lib/session.ts:25` хранит сессии в памяти процесса, при рестарте PM2
вся работа пользователя теряется. Восстановления нет.

Надо: заменить in-memory Map на SQLite-хранилище через better-
sqlite3. Файл `data/sessions.db` (в .gitignore). API `getSession`,
`createSession`, `updateSession`, `expireOldSessions` сохраняется.
TTL 1 час сохраняется. Тесты на create/get/update/expire/persistence-
across-restart.

Файлы: `lib/session.ts`, `lib/session-store.ts` (новый),
`package.json` (+better-sqlite3), `.gitignore` (+data/).

Acceptance: сессии переживают рестарт процесса, тесты проходят, PM2-
совместимо (один writer).

#### work-5: Извлечь дублированные хелперы в lib/

Функции `safeRender`, `getConf` и компонент `ConfIcon` скопированы
один-в-один в 4 detail-странички (fixture, match, cargo, vessel).
Утилиты парсинга `extractNum`, `toConfidence` дублируются в 3 AI-
parse-роутах.

Надо: вынести в `lib/ui-render.ts` и `lib/parsing-utils.ts`,
заменить копии на импорты. Добавить тесты на `extractNum` (минимум 5
кейсов) и `toConfidence`.

Файлы: `lib/ui-render.ts` (новый), `lib/parsing-utils.ts` (новый),
`app/{fixture,match,cargo,vessel}/[id]/page.tsx`,
`app/api/ai/parse-{vessel,recap,cargo}/route.ts`.

Acceptance: ноль дубликатов, импорты работают, новые тесты зелёные,
существующая функциональность не сломана.

#### work-6: Jest setup под Next.js + первые 30 тестов

Сейчас 1 тестовый файл (`lib/__tests__/currency.test.ts`, 8 тестов)
на 70+ файлов исходников. Покрытие 1.4%. Jest подключён в
`package.json`, но не настроен под Next.js (нет next/jest, нет
module-aliases для `@/`).

Надо: создать `jest.config.mjs` с `next/jest`, `jest.setup.ts` с
RTL и моками для OpenAI/googleapis. Написать тесты на:
- `lib/session.ts` — create/get/update/expire (5+ тестов)
- `lib/parsing-utils.ts` — extractNum, toConfidence (10+ тестов)
- `app/api/ai/classify` — парсинг ответа AI с моком (5+ тестов)
- `app/api/ai/parse-cargo` — парсинг с моком (5+ тестов)

Минимум 30 тестов суммарно, покрытие критических путей ≥80%.

Файлы: `jest.config.mjs` (новый), `jest.setup.ts` (новый),
`lib/__tests__/session.test.ts` (новый),
`lib/__tests__/parsing-utils.test.ts` (новый),
`app/api/ai/__tests__/classify.test.ts` (новый),
`app/api/ai/__tests__/parse-cargo.test.ts` (новый), `package.json`.

Acceptance: `npm test` проходит, ≥30 новых тестов, общее покрытие
≥20%.

### Волна 3 — Observability (параллельно после Волны 2, 2 работы)

Цель: видеть что происходит в проде, защитить от регрессий.

#### work-7: /api/health endpoint + structured logging + базовый Sentry

Сейчас нет health-чека (мониторинг не может проверить живость
приложения), нет error-tracking (о падениях узнаём от пользователей),
только `console.error` без request-id и контекста.

Надо:
- `GET /api/health` → `{ status, sessions, uptime, version }`
- Заменить console.* на pino logger с request-id middleware
- Sentry интеграция (только если задан `SENTRY_DSN` env, иначе no-op)
- Тесты на health-endpoint

Файлы: `app/api/health/route.ts` (новый), `lib/logger.ts` (новый),
`sentry.client.config.ts` + `sentry.server.config.ts` (новые),
`package.json` (+@sentry/nextjs, pino), `.env.local.example` (+SENTRY_DSN),
все API-routes (заменить console.* на logger).

Acceptance: GET /api/health отвечает 200 с JSON, логи в JSON-формате
с request-id, Sentry работает при наличии DSN, тесты зелёные.

#### work-8: GitHub Actions CI

Сейчас `.github/workflows/` отсутствует. Никто не проверяет lint,
тесты, audit, build перед merge.

Надо: `.github/workflows/ci.yml` запускается на PR в main, выполняет
по очереди: `npm ci`, `npm run lint`, `npm test`, `npm audit --audit-
level=high`, `npm run build`. Падает если хоть один шаг fails. Badge
статуса в README.

Файлы: `.github/workflows/ci.yml` (новый), `README.md` (badge).

Acceptance: PR с поломанным lint падает в CI; PR с успехом всех
шагов получает зелёную галочку; badge виден в README.
