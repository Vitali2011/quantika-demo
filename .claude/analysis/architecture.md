# Architecture — quantika-demo

## Стек

| Слой | Технология | Версия |
|------|-----------|--------|
| Фреймворк | Next.js App Router (TypeScript strict) | 14.2.35 |
| UI | Tailwind CSS + shadcn/ui + @radix-ui/react-slot + @base-ui/react | 3.4.19 / 4.1.2 |
| AI | OpenAI SDK через ClipProxy (CLIPROXY_BASE_URL) | 6.33.0 |
| Почта | Gmail API (googleapis) | 171.4.0 |
| Сессии | In-memory Map (lib/session.ts) — без БД | — |
| Деплой | PM2 + Caddy на VPS | — |
| Тесты | jest + ts-jest (devDeps, **нет jest.config** — не работает) | 30.3.0 / 29.4.9 |
| TypeScript | strict mode, moduleResolution: bundler, paths: @/* -> ./* | 5.9.3 |

## Домен

Maritime freight brokerage: AI-триаж freight email через Gmail.
Сущности: cargo requests, vessels, fixtures, recaps, matches, commission.
Пользователь авторизуется через Google OAuth, фетчит письма, запускает
AI-pipeline поэтапно (classify → parse-cargo/vessel/recap → match → draft).

## Структура (App Router)

```
app/
  api/
    ai/        — HTTP wrappers над OpenAI: classify, match, parse-{cargo,vessel,recap},
                 counterparty, draft-{quote,reply}, recap
    auth/      — Google OAuth (callback, login)
    emails/    — Gmail fetch
    session/   — session CRUD
    sample/    — seed data (GET — нарушение REST + CSRF риск)
    health/    — (запланирован, work-7)
  dashboard/   — Server Component (276 строк, смешаны запрос + вычисления + рендер)
  processing/  — Client Component (STEP_GROUPS + pipeline orchestration — должно быть в lib/)
  [cargo|vessel|fixture|match]/[id]/ — detail pages (дублируют safeRender/getConf/ConfIcon)
lib/
  types.ts        — domain types
  session.ts      — in-memory Map (единственный источник данных, нет persistence)
  session-store.ts — (запланирован, work-4)
  openai.ts       — callAiJson / callAiText (0% покрытие тестами)
  google.ts       — Gmail + OAuth (0% покрытие тестами)
  prompts.ts      — 689 строк: все system prompts для всех AI фич
  sailing/port-distances.ts — 967 строк: hardcoded distance table + lookup logic
  dashboard-queries.ts — filterByCategory, getEmailCounts (без contact aggregation)
  commission.ts   — финансовые расчёты (eslint-disable any)
  currency.ts     — единственный покрытый тестами модуль (8 тестов)
  utils.ts        — truncateText + format helpers (0% покрытие)
  parsing-utils.ts — (запланирован, work-5)
components/        — shadcn/ui + domain UI
```

## Потоки данных

1. **Auth**: Google OAuth → session create (in-memory) → cookie
2. **Email fetch**: Gmail API (N+1: 1 list + N messages.get) → session.emails
3. **AI pipeline**: session.emails → parallel OpenAI calls (без concurrency cap) → session update
4. **Rendering**: Server Components читают session → React UI

## Слабые места (по аудитам D1)

### Критичные — блокируют production-надёжность

| Проблема | Файл | Severity |
|----------|------|----------|
| Session validation: идентичный 4-строчный блок в 9 API-роутах | classify/counterparty/draft-quote/draft-reply/match/parse-* | critical |
| In-memory сессии: теряются при рестарте PM2 | lib/session.ts:5 | high |
| ignoreBuildErrors: true — TS-ошибки скрыты от build | next.config.mjs:4 | high |
| 4 HIGH + 1 MODERATE уязвимости в зависимостях | package.json | high |
| CSRF: POST-роуты AI без токена, /api/sample на GET | app/api/ai/* | high |

### Производительность — 429 и rate limits под нагрузкой

| Проблема | Файл | Severity |
|----------|------|----------|
| N+1 Gmail API: 51 HTTP-запросов на 50 писем | lib/google.ts:51 | high |
| Unbounded concurrent OpenAI: Promise.all без лимита | parse-cargo:64, parse-vessel:78, parse-recap:76 | high |
| Full-blob session write: сотни KB JSON на каждый update | lib/session-store.ts:104 | medium |
| O(n²) findAnalysis в match/route.ts | app/api/ai/match/route.ts:140 | medium |

### Архитектура — смешение ответственностей

| Проблема | Файл | Recommendation |
|----------|------|----------------|
| Бизнес-логика в route handler (107 LOC) | classify/route.ts:38 | → lib/classification-service.ts |
| God route (427 LOC): 5 concerns в одном файле | match/route.ts:1 | → lib/matching/pair-analyzer.ts |
| Contact aggregation в Server Component | dashboard/page.tsx:52 | → lib/dashboard-queries.ts |
| Pipeline orchestration в Client Component | processing/page.tsx:32 | → lib/pipeline.ts |
| Нет API versioning: /api/* без /v1/ | app/api/ | → /api/v1/ prefix |

### Качество кода — дублирование и тест-покрытие 1.4%

| Проблема | Файл | Severity |
|----------|------|----------|
| extractStr() дублируется | parse-cargo + parse-vessel | high |
| safeRender/getConf/ConfIcon: 4 копии | cargo/vessel/fixture/match detail pages | medium |
| prompts.ts: 689 строк всех промптов | lib/prompts.ts | medium |
| port-distances.ts: hardcoded 967 строк | lib/sailing/port-distances.ts | medium |
| lib/google.ts (auth/mail) без тестов | lib/google.ts | high |
| lib/openai.ts (AI core) без тестов | lib/openai.ts | high |
| Нет jest.config — тесты не запускаются | package.json (jest без config) | critical |

## Зависимости рисков

```
in-memory sessions → нет persistence → data loss при рестарте
нет jest.config   → тест-покрытие фактически 0% → любая правка рискованна
ignoreBuildErrors → TS-ошибки скрыты → type safety иллюзорна
нет CSRF          → AI endpoints уязвимы → OpenAI bill exposure
N+1 Gmail API     → rate limits → pipeline fails при >20 писем
unbounded Promise.all → 429 OpenAI → pipeline fails при >10 писем
```
