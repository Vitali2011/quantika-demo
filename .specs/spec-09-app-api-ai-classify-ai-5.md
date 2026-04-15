# Spec 09: `app/api/ai/classify` — парсинг ответа AI с моком (5+ тестов)

> Batch: D5 | Complexity: medium | Est: 60 min | Files: 1

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3), openai SDK 6.33.0, Jest 30.3.0 + ts-jest 29.4.9, googleapis 171.4.0, Tailwind CSS 3.4.19 + shadcn 4.1.2
- **Architecture:** Next.js App Router, in-memory sessions (lib/session.ts), AI calls via ClipProxy at CLIPROXY_BASE_URL, без БД, PM2 + Caddy на VPS
- **Test command:** `npm test`
- **Lint command:** `npm run lint`

## Task Description

`app/api/ai/classify/route.ts:37–104` содержит бизнес-логику без тест-покрытия:

- **Thread grouping** (lines 38–43): строит `Map<string, Email[]>` по `email.threadId`
- **Reply detection**: `isIncoming` = INBOX + not SENT; `hasReply` = любой email в треде с SENT-лейблом и датой > текущего; `isUnanswered` = isIncoming && !hasReply; `daysWithoutReply` = floor((now − emailDate) / 86400000) если isUnanswered
- **Status derivation** (lines 67–83): REQUIRES_REPLY categories = [CARGO_INQUIRY, CLIENT_REPLY]; если !requiresReply → INFO_ONLY; если !isUnanswered → RESPONDED; если hoursWithout ≥ 48 → NEEDS_ACTION; иначе → PENDING
- **Freshness**: вызывает `calculateExpiry` и `isStale` из `lib/freshness.ts`
- **Output**: пишет `classifications` и `processedEmails` в сессию

Задача: написать `app/api/ai/__tests__/classify.test.ts` с ≥5 тест-кейсами, мокируя OpenAI-вызовы через `jest.mock('@/lib/openai')` и сессию через `jest.mock('@/lib/session')`. Тесты проверяют: парсинг AI-ответа (EmailCategory), reply detection, status derivation, HTTP error paths (401, 400).

Источники: research-business-logic.md (classify logic lines 37–104); research-api-contracts.md (POST /api/ai/classify contract); ROADMAP item 6 (Jest setup + classify tests); gaps.md category:testing (critical).

## Dependencies

- **spec-05** (Jest config, BLOCKING): `jest.config.mjs` с `createJestConfig` из `next/jest` и `moduleNameMapper` для `@/*` должен существовать до запуска этих тестов. Без spec-05 Jest не разрешит `@/lib/*` path aliases.
- Нет блокирующих зависимостей от spec-07 (session.test.ts) или spec-02 (CSRF).
- `app/api/ai/classify/route.ts` используется только как импорт в тестах — не изменяется.

## Requirements

1. Создать `app/api/ai/__tests__/classify.test.ts` с ≥5 тест-кейсами.
2. Мокировать OpenAI-вызовы: `jest.mock('@/lib/openai')` — тесты не должны обращаться к реальному API (CLIPROXY_BASE_URL).
3. Мокировать session: `jest.mock('@/lib/session')` с контролируемыми `getSession`/`updateSession`.
4. **Тест 401**: POST без валидного session_id cookie → HTTP 401.
5. **Тест 400**: сессия с `emails: []` → HTTP 400 `{ error: 'No emails to classify' }`.
6. **Тест reply detection**: входящее письмо (INBOX, не SENT) без sent reply → `isUnanswered: true`, `daysWithoutReply > 0`.
7. **Тест RESPONDED**: входящее письмо + есть SENT reply в том же треде → `isUnanswered: false`, `status: 'RESPONDED'`.
8. **Тест NEEDS_ACTION**: CARGO_INQUIRY, unanswered ≥ 48h (daysWithoutReply ≥ 2) → `status: 'NEEDS_ACTION'`.
9. **Тест INFO_ONLY** (опциональный 6-й): FIXTURE_RECAP категория (не в REQUIRES_REPLY) → `status: 'INFO_ONLY'`.
10. После добавления тест-файла `npm test` завершается с exit 0 (при наличии jest.config.mjs от spec-05).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `app/api/ai/__tests__/classify.test.ts` | create | Тесты бизнес-логики classify: AI mock, reply detection, status derivation (≥5 кейсов) |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `jest.config.mjs` — управляется spec-05 (Jest setup + 30 тестов)
- `jest.setup.ts` — управляется spec-05 (Jest setup + 30 тестов)
- `app/api/ai/classify/route.ts` — управляется spec-02 (CSRF) и spec-11 (extract classification-service)
- `lib/session.ts` — управляется spec-07 (session create/get/update/expire)
- `lib/__tests__/session.test.ts` — управляется spec-07
- `app/api/session/route.ts` — управляется spec-07
- `package.json` — управляется spec-06 (уязвимости зависимостей) и spec-13 (Sentry)
- `package-lock.json` — управляется spec-06
- `middleware.ts` — управляется spec-02 (CSRF)
- `lib/csrf.ts` — управляется spec-02 (CSRF)
- `next.config.mjs` — управляется spec-03 (ignoreBuildErrors) и spec-13 (Sentry)
- `sentry.client.config.ts` — управляется spec-13
- `sentry.server.config.ts` — управляется spec-13
- `sentry.edge.config.ts` — управляется spec-13
- `instrumentation.ts` — управляется spec-13
- `.env.local.example` — управляется spec-13

## Acceptance Criteria

- [ ] `app/api/ai/__tests__/classify.test.ts` создан и содержит ≥5 тест-кейсов
- [ ] Все AI-вызовы мокированы через `jest.mock('@/lib/openai')` (нет обращений к реальному API)
- [ ] Session мокирована через `jest.mock('@/lib/session')`
- [ ] Тест 401: POST без session_id → HTTP 401 подтверждён
- [ ] Тест 400: пустой `emails` в сессии → HTTP 400 `No emails to classify` подтверждён
- [ ] Reply detection: `isUnanswered: true` при входящем без SENT reply
- [ ] Status RESPONDED: `isUnanswered: false` при наличии SENT reply в треде
- [ ] Status NEEDS_ACTION: unanswered ≥ 48h → `status: 'NEEDS_ACTION'` подтверждён
- [ ] `npm test` завершается с exit 0 (при наличии jest.config.mjs от spec-05)
- [ ] `npx tsc --noEmit` не выдаёт ошибок на новом тест-файле

## Compat Constraints

- **Jest:** 30.3.0 + ts-jest 29.4.9 — уже в devDeps; не добавлять новые тест-зависимости в `package.json` (он в FORBIDDEN)
- **Next.js:** 14.2.35 — тест-файл работает с `createJestConfig` из `next/jest`, настроенным в spec-05
- **TypeScript:** 5.9.3, strict mode, `isolatedModules: true` — тест-файл должен проходить `tsc --noEmit`
- **Path aliases:** `@/*` → `<rootDir>/*` через `moduleNameMapper` в jest.config.mjs (настраивается spec-05)
- **Node runtime:** `testEnvironment: 'node'` — route-тесты запускаются в Node.js, не jsdom

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-09-app-api-ai-classify-ai-5`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
