# ROADMAP — quantika-demo

## Архитектура

Next.js 14 App Router + TypeScript. Домен: maritime freight brokerage, AI-триаж Gmail через OpenAI.
Стек: OpenAI SDK, Gmail API, Tailwind/shadcn, PM2+Caddy. БД отсутствует — всё в in-memory session Map.
Слабые места: бизнес-логика в route handlers, нет session repository abstraction, N+1 Gmail calls,
unbounded concurrent AI calls, дублированные утилиты в 3–4 местах, покрытие тестами 1.4%.

## Обновления по приоритету

### 1. Убрать `ignoreBuildErrors` и починить TypeScript-ошибки [КРИТИЧНО] [малая]

`next.config.mjs:4` — `typescript: { ignoreBuildErrors: true }` скрывает все TS-ошибки.
Убрать флаг, прогнать `npx tsc --noEmit`, исправить все найденные ошибки.
Acceptance: `npm run build` зелёный без ignoreBuildErrors.
Файлы: `next.config.mjs`, затронутые `.ts`/`.tsx`.

### 2. Закрыть уязвимости в зависимостях [КРИТИЧНО] [малая]

`npm audit` — 4 HIGH (glob CWE-78, @next/eslint-plugin-next, eslint-config-next, next) + 1 MODERATE (@hono/node-server path traversal).
`npm audit fix`, bump `eslint-config-next` до 16.2.3+ если нужно.
Acceptance: `npm audit --audit-level=high` чистый, `npm run build` проходит.
Файлы: `package.json`, `package-lock.json`.

### 3. CSRF-защита на изменяющих эндпоинтах [КРИТИЧНО] [средняя]

Все POST-роуты `app/api/ai/*` принимают запросы только по session_id из cookie — без CSRF-токена.
`app/api/sample` — GET-роут создаёт сессию (нарушение REST + CSRF вектор).
Ввести `X-CSRF-Token` header; перевести `/api/sample` на POST.
Acceptance: запрос без токена → 403; `/api/sample` теперь POST; тесты присутствуют.
Файлы: `app/api/**/route.ts`, `lib/csrf.ts` (новый), `middleware.ts`.

### 4. Persistent сессии через SQLite [КРИТИЧНО] [средняя]

`lib/session.ts:5` — `Map<string, SessionData>` в памяти процесса; при рестарте PM2 данные теряются.
Дополнительно: Map без лимита, dangling setTimeout при deleteSession (audit-performance).
Заменить на better-sqlite3 с интерфейсом `getSession/createSession/updateSession/expireOldSessions` (audit-architecture).
Добавить MAX_SESSIONS guard + clearTimeout в deleteSession.
Acceptance: сессии переживают рестарт, тесты create/get/update/expire/persistence-across-restart.
Файлы: `lib/session.ts`, `lib/session-store.ts` (новый), `package.json`.

### 5. Извлечь дублированные хелперы в lib/ [ВАЖНО] [малая]

- `toConfidence<T>()` продублирована в 3 route-файлах: parse-cargo, parse-vessel, parse-recap (audit-code-quality, HIGH)
- `extractNum()` продублирована в parse-vessel и parse-recap (audit-code-quality, HIGH)
- `safeRender`, `getConf`, `ConfIcon` продублированы в 4 detail-страничках: cargo, vessel, fixture, match (audit-code-quality, MEDIUM; audit-architecture)
Вынести в `lib/ai-utils.ts` и `lib/render-utils.ts`, заменить копии на импорты.
Убрать debug `console.log` из `parse-recap/route.ts:102`.
Acceptance: ноль дубликатов, новые тесты на extractNum и toConfidence (5+ кейсов каждый).
Файлы: `lib/ai-utils.ts` (новый), `lib/render-utils.ts` (новый), `app/api/ai/parse-{cargo,vessel,recap}/route.ts`, `app/{cargo,vessel,fixture,match}/[id]/page.tsx`.

### 6. Jest setup под Next.js + первые 30 тестов [ВАЖНО] [средняя]

Покрытие 1.4% — только `lib/currency.ts`. Jest подключён, но не настроен под Next.js/TypeScript (audit-code-quality, HIGH).
Создать `jest.config.mjs` с next/jest, `jest.setup.ts`. Написать тесты: session, parsing-utils, classify, parse-cargo.
Минимум 30 тестов, покрытие критических путей ≥80%.
Acceptance: `npm test` проходит, ≥30 новых тестов.
Файлы: `jest.config.mjs`, `jest.setup.ts`, `lib/__tests__/session.test.ts`, `lib/__tests__/parsing-utils.test.ts`, `app/api/ai/__tests__/*.test.ts`.

### 7. Оптимизировать Gmail fetch: устранить N+1 запросы [ВАЖНО] [малая]

`lib/google.ts:51` — fetchGmailEmails делает 1 list + N individual get calls (51 HTTP-запрос на 50 писем).
Заменить на `users.messages.batchGet` или использовать `fields` parameter в list call (audit-performance, HIGH).
Acceptance: fetch 50 писем → ≤2 HTTP-запросов к Gmail API.
Файлы: `lib/google.ts`.

### 8. GitHub Actions CI [ВАЖНО] [малая]

`.github/workflows/` отсутствует — ни lint, ни тесты, ни audit не проверяются перед merge.
Создать `ci.yml`: npm ci → lint → test → audit → build. Badge в README.
Acceptance: PR с поломанным lint падает; успешный PR получает зелёную галочку.
Файлы: `.github/workflows/ci.yml` (новый), `README.md`.

### 9. Ограничить параллелизм AI-вызовов через p-limit [ВАЖНО] [малая]

`parse-cargo`, `parse-vessel`, `parse-recap` используют `Promise.all` без cap → 429 от OpenAI (audit-performance, MEDIUM).
Ввести p-limit(3–5) + retry на 429.
Acceptance: при 20+ cargo emails нет 429, тесты с мок-задержками проходят.
Файлы: `app/api/ai/parse-{cargo,vessel,recap}/route.ts`, `package.json` (+p-limit).

### 10. /api/health endpoint + structured logging + базовый Sentry [ЖЕЛАТЕЛЬНО] [средняя]

Нет health-чека, нет error tracking, только `console.error` без request-id.
`GET /api/health` → JSON; pino logger с request-id; Sentry (no-op если нет DSN).
Acceptance: GET /api/health 200, логи в JSON с request-id.
Файлы: `app/api/health/route.ts`, `lib/logger.ts`, `sentry.*.config.ts`, `package.json`.

### 11. Извлечь бизнес-логику из classify/route.ts [ЖЕЛАТЕЛЬНО] [малая]

`classify/route.ts:37–102` — thread grouping, reply detection, status derivation, freshness inline в handler (audit-architecture, HIGH).
Вынести в `lib/classification-service.ts`, route handler только вызывает функцию и пишет в session.
Acceptance: route handler ≤20 строк, логика покрыта тестами.
Файлы: `app/api/ai/classify/route.ts`, `lib/classification-service.ts` (новый).

### 12. Разгрузить dashboard/page.tsx + processing/page.tsx [ЖЕЛАТЕЛЬНО] [средняя]

`dashboard/page.tsx` — 571 строка, god component (audit-code-quality, MEDIUM; audit-architecture, MEDIUM).
`processing/page.tsx` — STEP_GROUPS и pipeline orchestration в клиентском компоненте (audit-architecture, MEDIUM).
Вынести в `lib/dashboard-helpers.ts` и `lib/pipeline.ts`.
Acceptance: dashboard/page.tsx < 200 строк, pipeline независимо тестируем.
Файлы: `app/dashboard/page.tsx`, `app/processing/page.tsx`, `lib/dashboard-helpers.ts` (новый), `lib/pipeline.ts` (новый).
