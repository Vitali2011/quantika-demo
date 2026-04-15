# Architecture — quantika-demo

## Стек

| Слой | Технология |
|------|-----------|
| Фреймворк | Next.js 14 (App Router, TypeScript) |
| UI | Tailwind CSS + shadcn/ui |
| AI | OpenAI SDK (через ClipProxy) |
| Почта | Gmail API (googleapis) |
| Сессии | In-memory Map (lib/session.ts) |
| БД | Отсутствует |
| Деплой | PM2 + Caddy на VPS |
| Тесты | Jest (минимально настроен) |

## Домен

Maritime freight brokerage: AI-триаж freight email через Gmail.
Сущности: cargo requests, vessels, fixtures, recaps, matches, commission.

## Архитектура (App Router)

app/
  api/
    ai/        <- thin HTTP wrappers над OpenAI calls
    auth/      <- Google OAuth
    emails/    <- Gmail fetch
    session/   <- session CRUD
    sample/    <- seed data (GET — нарушение REST)
  [pages]/     <- Server Components + Client Components
lib/
  types.ts     <- domain types
  session.ts   <- in-memory state store (единственный источник данных)
  openai.ts    <- OpenAI client wrapper
  google.ts    <- Gmail client
  prompts.ts   <- AI prompt templates
  currency.ts  <- единственный покрытый тестами модуль
components/    <- shadcn/ui + domain UI

## Потоки данных

1. Auth: OAuth Google -> session create -> cookie
2. Email fetch: Gmail API (N+1 запросов) -> сохранить в session
3. AI pipeline: session emails -> parallel OpenAI calls -> обновить session
4. Rendering: Server Components читают session -> React UI

## Слабые места (по аудитам)

### Архитектура
- Бизнес-логика в route handlers: classify/route.ts содержит thread grouping, reply detection, status derivation (строки 37-102) — должно быть в lib/classification-service.ts
- Нет repository abstraction для session: lib/session.ts — глобальный Map без интерфейса для смены backend
- Logic in Server Components: dashboard/page.tsx (571 строк) содержит buildRows, groupByStatus, contact aggregation — должно быть в lib/dashboard-helpers.ts
- Pipeline в клиентском компоненте: processing/page.tsx определяет STEP_GROUPS и orchestration — должно быть в lib/pipeline.ts
- Нет API versioning: все роуты на /api/* без версии, любой breaking change ломает клиентов

### Производительность
- N+1 Gmail API calls: lib/google.ts:51 — 51 HTTP запрос на 50 писем; нужен batchGet
- Unbounded in-memory sessions: lib/session.ts:5 — Map без лимита + dangling setTimeout при deleteSession
- Unbounded concurrent AI calls: parse-cargo, parse-vessel, parse-recap используют Promise.all без concurrency cap -> 429 от OpenAI

### Качество кода
- Дублирование toConfidence<T>(): 3 копии в parse-cargo, parse-vessel, parse-recap
- Дублирование extractNum(): 2 копии в parse-vessel, parse-recap
- Дублирование safeRender/getConf/ConfIcon: 4 копии в detail pages (cargo, vessel, fixture, match)
- Debug console.log в prod: parse-recap/route.ts:102 — логи в каждый запрос
- Покрытие тестами 1.4%: только lib/currency.ts покрыт

## Зависимости (риски)

- 4 HIGH + 1 MODERATE уязвимости (npm audit)
- next.config.mjs: ignoreBuildErrors: true — TS-ошибки скрыты от сборки
- app/api/sample: GET-роут создаёт сессию — нарушение REST + CSRF риск
