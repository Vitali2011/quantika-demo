# Spec 12: Заменить console.* на pino logger с request-id middleware

> Batch: D5 | Complexity: small | Est: 30 min | Files: 6

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Jest 30 + ts-jest 29, OpenAI SDK 6.33.0, googleapis 171.4.0, Tailwind + shadcn, PM2 + Caddy
- **Architecture:** Next.js App Router. No database — all state in-memory `Map<string, SessionData>` via `lib/session.ts`. API routes in `app/api/`. Server-only business logic in `lib/`. `app/processing/page.tsx` is a client component — pino runs server-side only.
- **Test command:** `npm test` (`jest --forceExit`)
- **Lint command:** `npm run lint` (`next lint`)

## Task Description

Six server-side `console.*` calls exist across `lib/openai.ts`, `app/api/auth/google/route.ts`, and `app/api/emails/fetch/route.ts` — producing unstructured plaintext logs without request correlation. PM2 captures stdout; structured JSON is required for log aggregation and observability.

This spec replaces all server-side `console.*` calls with [pino](https://github.com/pinojs/pino) structured JSON logging. A `createLogger(requestId?)` factory is introduced so route handlers can bind a `requestId` to all log lines for a given request — without requiring `middleware.ts` (which is managed by spec-02).

Note: `app/api/ai/parse-recap/route.ts:102` debug `console.log` removal is handled by **spec-08** and is therefore excluded from this spec's scope.

Sources: ROADMAP.md §10 · audit-code-quality.md (console.log in parse-recap, console.error in openai.ts) · audit-architecture.md (no structured logging) · research-tech-stack.md (Next.js 14, Node ≥18, Jest 30) · `lib/openai.ts:37,42,47,77` · `app/api/auth/google/route.ts:37` · `app/api/emails/fetch/route.ts:44`

## Dependencies

- **spec-07** (Jest config) should be merged before running tests for this spec — `jest.config.mjs` and `jest.setup.ts` with `moduleNameMapper: { '^@/(.*)$': ... }` are required for `@/lib/logger` imports in tests.
- **spec-08** handles `parse-recap/route.ts:102` console.log removal — do not duplicate.
- **spec-02** owns `middleware.ts` — request-id injection uses the `createLogger(requestId?)` factory pattern instead.
- No functional dependency on spec-01 (SQLite) or spec-11 (health route).

## Requirements

1. Add `pino` as a production dependency in `package.json` (extend: add one entry under `"dependencies"`). [ASSUMED: pino ^9.x is the latest stable; exact version pin resolved at install time]

2. Create `lib/logger.ts`:
   - Import and configure a pino logger instance: `level` from `process.env.LOG_LEVEL ?? 'info'`, JSON output (default pino behaviour, no `transport` key in production).
   - Export `logger` — the base pino instance.
   - Export `createLogger(requestId?: string): pino.Logger` — returns `logger.child(requestId ? { requestId } : {})`.
   - Do not configure `pino-pretty` — JSON output is used in all environments. [ASSUMED: pino-pretty is a dev-only concern and not required by the ROADMAP spec]

3. Update `lib/openai.ts` — replace all four `console.*` calls with `logger` from `@/lib/logger`:
   - Line 37: `console.log(...)` → `logger.debug({ model, contentLength: content.length }, '[AI] response received')`
   - Line 42: `console.error(...)` → `logger.error('[AI] Empty response after streaming')`
   - Line 47: `console.error(...)` → `logger.error({ err }, 'AI JSON call failed')`
   - Line 77: `console.error(...)` → `logger.error({ err }, 'AI text call failed')`

4. Update `app/api/auth/google/route.ts` — replace `console.error('OAuth error:', err)` at line 37 with `logger.error({ err }, 'OAuth error')`, importing `logger` from `@/lib/logger`.

5. Update `app/api/emails/fetch/route.ts` — replace `console.error('Email fetch error:', err)` at line 44 with `logger.error({ err }, 'Email fetch error')`, importing `logger` from `@/lib/logger`.

6. Create `lib/__tests__/logger.test.ts` with ≥4 test cases:
   - **exports logger**: `logger` is a truthy object with `.info`, `.error`, `.debug` methods.
   - **createLogger no args**: returns an object with `.info`, `.error`, `.debug` methods (child logger interface).
   - **createLogger with requestId**: child logger is a distinct object from base `logger`.
   - **createLogger propagates bindings**: a child logger created with `requestId: 'test-id'` includes the `requestId` field in its bindings (verify via `child.bindings().requestId === 'test-id'`).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/logger.ts` | create | Pino logger setup: base `logger` instance + `createLogger(requestId?)` factory |
| `lib/__tests__/logger.test.ts` | create | ≥4 unit tests for logger exports and child logger bindings |
| `lib/openai.ts` | modify | Replace 4 `console.*` calls with pino `logger.*` calls |
| `app/api/auth/google/route.ts` | modify | Replace `console.error` with `logger.error` |
| `app/api/emails/fetch/route.ts` | modify | Replace `console.error` with `logger.error` |
| `package.json` | extend | Add `pino` under `"dependencies"` |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `middleware.ts` — управляется spec-02 (CSRF middleware)
- `lib/csrf.ts` — управляется spec-02
- `lib/session.ts` — управляется spec-01 (SQLite migration) и spec-07 (session tests)
- `lib/session-store.ts` — управляется spec-01
- `package-lock.json` — управляется spec-06
- `next.config.mjs` — управляется spec-03 (removes ignoreBuildErrors) и spec-13 (withSentryConfig)
- `jest.config.mjs` — управляется spec-07
- `jest.setup.ts` — управляется spec-07
- `app/api/health/route.ts` — управляется spec-11
- `app/api/health/__tests__/health.test.ts` — управляется spec-11
- `app/api/ai/parse-cargo/route.ts` — управляется spec-08 (extractNum/toConfidence extraction)
- `app/api/ai/parse-vessel/route.ts` — управляется spec-08
- `app/api/ai/parse-recap/route.ts` — управляется spec-08 (включая удаление debug console.log:102)
- `lib/parsing-utils.ts` — управляется spec-08
- `lib/__tests__/parsing-utils.test.ts` — управляется spec-08
- `app/api/ai/classify/route.ts` — управляется spec-09
- `lib/classification-service.ts` — управляется spec-09
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts` — управляются spec-13
- `.env.local.example` — управляется spec-13

## Acceptance Criteria

- [ ] `lib/logger.ts` создан и экспортирует `logger` (pino instance) и `createLogger(requestId?: string)`.
- [ ] `createLogger('req-abc')` возвращает child logger с `bindings().requestId === 'req-abc'`.
- [ ] `lib/openai.ts` не содержит ни одного вызова `console.*` (все 4 заменены).
- [ ] `app/api/auth/google/route.ts` не содержит `console.error`.
- [ ] `app/api/emails/fetch/route.ts` не содержит `console.error`.
- [ ] Серверные `console.*` calls сокращены на 100% в файлах из "Files in Scope" (6 из 6 заменены).
- [ ] `lib/__tests__/logger.test.ts` содержит ≥4 тест-кейса; все проходят под `npm test`.
- [ ] `npm run lint` проходит без новых ошибок.
- [ ] `npm run build` проходит без TypeScript-ошибок (no regressions).
- [ ] `pino` присутствует в `dependencies` раздела `package.json`.

## Compat Constraints

- **Next.js 14.2.35 App Router** — `lib/logger.ts` импортируется только в server-side модулях (`lib/`, `app/api/`). Не импортировать в Client Components (Browser API недоступны для pino в браузере). `app/processing/page.tsx:108` (`console.warn` в Client Component) исключён из scope.
- **TypeScript 5.9.3 strict mode** — `moduleResolution: bundler`; pino предоставляет встроенные типы в `@types/pino` или через bundled typings. [ASSUMED: pino ^9.x включает bundled TypeScript declarations, отдельный `@types/pino` не нужен]
- **Node.js ≥18** — `crypto.randomUUID()` доступен нативно (актуально для route handlers, генерирующих request-id).
- **Jest 30 + ts-jest 29** — тесты используют `import { logger, createLogger } from '@/lib/logger'`; path alias `@/` должен быть настроен в `jest.config.mjs` (управляется spec-07).
- **PM2 production** — pino производит JSON в stdout; PM2 захватывает stdout/stderr — совместимо без дополнительной настройки.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-12-console-pino-logger-request-id-middleware`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
