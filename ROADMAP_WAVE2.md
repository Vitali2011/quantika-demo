# ROADMAP — Wave 2: UX + Refactor + Ops (на основе аудита 2026-04-15)

Источник: `.claude/audit/BACKLOG_FUTURE.md`. Эта волна — продолжение
после foundation wave (PR #1 смержен, 122 теста зелёные, SQLite-сессии,
CSRF, CI, health endpoint, pino logging, Sentry).

## Контекст продукта

quantika-demo — Next.js 14 продукт для AI-триажа freight email через
Gmail + Claude/OpenAI. Стек: Next.js (app router), TypeScript, OpenAI
SDK через ClipProxy, googleapis, Tailwind + shadcn, SQLite-сессии
(better-sqlite3), Jest (122 тестов). Деплой PM2 + Caddy на VPS.

## Verify-команды (после каждой волны)

```bash
npm run lint
npm test
npm run build
```

## Работы по волнам

### Волна 1 — UX (параллельно)

Цель: продукт корректно работает на мобильных устройствах, пользователь
понимает что происходит при ошибках и загрузках.

#### work-1: Mobile-адаптив основных страниц

Сейчас на весь проект только 3 tailwind-брейкпоинта (sm:/md:/lg:). 
Основные страницы (dashboard, detail-страницы) ломаются на телефоне.
Freight-брокеры часто работают с мобильных.

Надо: добавить responsive-классы Tailwind на dashboard (`app/dashboard/
page.tsx`) и detail-страницы (`app/{fixture,match,cargo,vessel}/[id]/
page.tsx`). Использовать `sm:`, `md:`, `lg:` брейкпоинты. Таблицы на
мобильном — горизонтальный скролл или stack-вертикально. Карточки —
full-width на телефоне, grid на десктопе. Минимум: страницы не ломаются
на 375px (iPhone SE).

Acceptance:
- npm run lint, npm test, npm run build зелёные
- dashboard и все 4 detail-страницы корректно отображаются на 375px
- нет overflow горизонтальной прокрутки на мобильном на main-контенте
- добавлено минимум 15 брейкпоинт-классов (sm:/md:/lg:)

Файлы: `app/dashboard/page.tsx`, `app/fixture/[id]/page.tsx`,
`app/cargo/[id]/page.tsx`, `app/vessel/[id]/page.tsx`,
`app/match/[id]/page.tsx`

#### work-2: Loading, empty и error states

Сейчас если AI-step падает — один generic «Try again» без контекста.
Detail-страницы не имеют loading/skeleton. Если сессия пустая или
данных нет — белый экран.

Надо:
- `app/processing/page.tsx`: для каждого из 7 шагов показывать
  конкретное сообщение об ошибке (шаг + причина), а не generic.
  При timeout на AI-вызове — «Сервис временно недоступен, попробуйте
  позже»
- Detail-страницы (`app/{fixture,match,cargo,vessel,recap}/[id]`):
  добавить loading skeleton (используй `app/loading.tsx` паттерн или
  Suspense) и empty-state когда данных нет
- Dashboard: если 0 писем — показать empty state с кнопкой «Загрузить
  письма» вместо пустого списка

Acceptance:
- npm run lint, npm test, npm run build зелёные
- processing page показывает step-specific сообщение при ошибке
- detail-страницы показывают skeleton пока данные грузятся
- dashboard показывает empty state при 0 письмах

Файлы: `app/processing/page.tsx`, `app/dashboard/page.tsx`,
`app/{fixture,match,cargo,vessel,recap}/[id]/page.tsx`,
`app/loading.tsx` (возможно новый)

#### work-3: Базовая accessibility (a11y)

Сейчас 0 `aria-*` атрибутов, кликабельные `<div onClick>` вместо
`<button>`. Юридический риск в EU, плюс клавиатурная навигация сломана.

Надо:
- Заменить `<div onClick>` на `<button>` во всех компонентах
- Добавить `aria-label` на кнопки без текста (иконки)
- Добавить `role` и `aria-*` на интерактивные элементы в processing
  flow (step indicators)
- Добавить `alt` на img элементы если есть
- Убедиться что focus-states видны (Tailwind `focus:ring-*`)

Acceptance:
- npm run lint, npm test, npm run build зелёные  
- нет `<div onClick>` в компонентах (grep проверка)
- все иконочные кнопки имеют aria-label
- processing-шаги доступны с клавиатуры (tabindex + aria-live для
  обновлений статуса)

Файлы: `app/processing/page.tsx`, `app/dashboard/page.tsx`,
`components/**/*.tsx`, `app/page.tsx`

### Волна 2 — Refactor (параллельно, после Волны 1)

Цель: снизить сложность главных компонентов, убрать `: any`,
улучшить структуру. Теперь безопасно — есть тесты.

#### work-4: Разделение dashboard на компоненты

`app/dashboard/page.tsx` — 571 LOC в одном файле: загрузка сессии,
фильтрация, группировка, рендер всего UI. Это главный источник
растущей сложности.

Надо:
- Вынести логику группировки/фильтрации писем в `lib/dashboard-
  queries.ts` (функции `groupEmailsByStatus`, `filterByCategory`,
  `getEmailCounts`)
- Вынести каждую секцию (NEEDS_ACTION, PENDING, RESPONDED, INFO_ONLY,
  STALE) в отдельный компонент в `components/dashboard/`
- Страница должна стать ≤200 LOC и делать только: загрузка сессии →
  передача данных в компоненты
- Покрыть `lib/dashboard-queries.ts` тестами (минимум 8 тестов)

Acceptance:
- npm run lint, npm test, npm run build зелёные
- `app/dashboard/page.tsx` ≤200 LOC
- `lib/dashboard-queries.ts` существует с тестами
- `components/dashboard/` содержит минимум 3 компонента
- функциональность dashboard не изменилась

Файлы: `app/dashboard/page.tsx`, `lib/dashboard-queries.ts` (новый),
`components/dashboard/` (новая директория)

#### work-5: Убрать `: any` — замена на правильные типы

36 случаев `: any` в TypeScript, особенно в detail-страницах и
parse-роутах. Каждый — потенциальный runtime-баг.

Надо: пройти по всем файлам с `any`, заменить на:
- конкретный тип из `lib/types.ts` если есть
- `unknown` + type guard если тип неизвестен на входе
- generics если нужна гибкость
Ни в коем случае не добавлять `// @ts-ignore` как workaround.
После: `grep -rn ": any" --include="*.ts" --include="*.tsx"` должен
показывать ≤5 результатов (в тестовых файлах/моках допустимо).

Acceptance:
- npm run lint, npm test, npm run build зелёные
- `: any` ≤5 в non-test файлах
- нет новых `@ts-ignore` или `@ts-expect-error`

Файлы: `app/{cargo,fixture,vessel,match}/[id]/page.tsx`,
`app/api/ai/parse-{recap,vessel,cargo}/route.ts`,
`app/api/ai/recap/route.ts`

#### work-6: Вынести sample-data в JSON-файлы

`app/api/sample/route.ts` — 294 LOC hardcoded freight-email моков прямо
в коде. Сложно добавлять новые сценарии, невозможно переиспользовать
в тестах.

Надо:
- Создать `lib/sample-data/` директорию
- Вынести каждую группу писем в отдельный JSON-файл (cargo-inquiries.
  json, vessel-positions.json, fixture-recaps.json, client-replies.json)
- route.ts загружает их через `import` и собирает в массив
- route.ts становится ≤30 LOC
- Написать тест что sample возвращает правильное количество писем

Acceptance:
- npm run lint, npm test, npm run build зелёные
- `app/api/sample/route.ts` ≤30 LOC
- `lib/sample-data/` содержит JSON-файлы
- тест на sample route

Файлы: `app/api/sample/route.ts`, `lib/sample-data/*.json` (новые)

### Волна 3 — Ops (параллельно, после Волны 2)

Цель: готовность к росту: контейнеризация, аналитика, rollback.

#### work-7: Dockerfile + docker-compose для local dev

Нет Dockerfile — невозможно деплоить на managed-хостинг (Fly.io,
Railway), нет изолированного local dev окружения.

Надо:
- Multi-stage `Dockerfile`: builder (npm ci + npm run build) → runner
  (node:22-alpine, только .next/ + node_modules производственные)
- `.dockerignore` (node_modules, .git, .next/cache, data/)
- `docker-compose.yml` для local dev с hot-reload (volume mount + npm
  run dev)
- Переменные окружения через env_file или environment секцию
- Инструкции в README секция «Docker»

Acceptance:
- `docker build -t quantika-demo .` проходит без ошибок
- `docker run -p 3000:3000 quantika-demo` запускает приложение
- `docker compose up` для local dev поднимает dev-сервер
- npm run lint, npm test, npm run build зелёные

Файлы: `Dockerfile` (новый), `.dockerignore` (новый),
`docker-compose.yml` (новый), `README.md` (секция Docker)

#### work-8: Базовая продуктовая аналитика (PostHog)

Нет аналитики — продуктовые решения принимаются вслепую. Не знаем
где пользователи отваливаются, какие фичи используют.

Надо: интегрировать PostHog (self-hosted или cloud, через env var
`NEXT_PUBLIC_POSTHOG_KEY`). Если ключ не задан — no-op (как Sentry).
Трекать события:
- `oauth_initiated` — при клике «Connect Gmail»
- `sample_started` — при клике «Try sample data»  
- `processing_complete` — после успешного pipeline из 7 шагов
- `processing_failed` — при ошибке с указанием шага
- `dashboard_viewed` — при открытии dashboard
- `detail_viewed` — при открытии detail-страницы (с типом: cargo/vessel/fixture/match)

Acceptance:
- npm run lint, npm test, npm run build зелёные
- без `NEXT_PUBLIC_POSTHOG_KEY` — ноль сетевых запросов к posthog
- с ключом — события трекаются в PostHog
- `.env.local.example` обновлён с `NEXT_PUBLIC_POSTHOG_KEY`

Файлы: `lib/analytics.ts` (новый), `app/page.tsx`, `app/processing/
page.tsx`, `app/dashboard/page.tsx`, `app/{*/[id]/}page.tsx`,
`package.json` (+posthog-js), `.env.local.example`

#### work-9: Rollback-процедура + README update

`docs/deploy.md` описывает деплой но не rollback. При поломанном
деплое в полночь нужна процедура «откат за 2 минуты». README — generic
Next.js шаблон.

Надо:
- В `docs/deploy.md` добавить секцию «Rollback»:
  `git checkout <prev-tag>`, `npm ci`, `npm run build`, `pm2 reload`
  Описать как проверить что rollback успешен (`/api/health` check).
- В README.md полностью переписать:
  * Setup (clone, `.env.local` из примера, `npm install`)
  * Архитектурная диаграмма: email → classify → parse → match → recap
  * Как запустить тесты: `npm test`
  * Как запустить local: `npm run dev` (или docker compose up)
  * Список всех env-переменных с описанием
  * Ссылка на `docs/deploy.md`

Acceptance:
- npm run lint, npm test, npm run build зелёные
- README содержит setup, архитектуру, env-переменные
- docs/deploy.md содержит rollback секцию с конкретными командами
- `/api/health` упомянут в rollback-процедуре как verification step

Файлы: `README.md`, `docs/deploy.md`
