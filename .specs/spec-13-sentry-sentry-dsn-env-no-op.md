# Spec 13: Sentry интеграция (только если задан `SENTRY_DSN` env, иначе no-op)

> Batch: D5 | Complexity: small | Est: 30 min | Files: 7

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Jest 30 + ts-jest 29, OpenAI SDK 6.33.0, googleapis 171.4.0, Tailwind + shadcn, PM2 + Caddy
- **Architecture:** Next.js App Router. No database — all state in-memory `Map<string, SessionData>` via `lib/session.ts`. No existing Sentry integration — all four config files (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`) are new. `next.config.mjs` currently exports a plain `nextConfig` object with `typescript.ignoreBuildErrors: true`; will be wrapped with `withSentryConfig()`.
- **Test command:** `npm test` (`jest --forceExit`)
- **Lint command:** `npm run lint` (`next lint`)

## Task Description

There is no error-tracking integration in the project. Runtime exceptions are only surfaced via `console.error` in two places; PM2 logs to disk but nobody parses them. Any production crash is invisible until a user reports it.

This spec adds Sentry error-tracking via `@sentry/nextjs`. The integration MUST be conditional: if `SENTRY_DSN` is absent from the environment, every Sentry init call must be a no-op (early-return before `Sentry.init()`). This way the project builds and runs cleanly in local/CI environments without a real DSN.

Concretely:

1. **`sentry.client.config.ts`** — browser-side init, `Sentry.init()` only when `process.env.NEXT_PUBLIC_SENTRY_DSN` is truthy.
2. **`sentry.server.config.ts`** — server-side init, guarded by `process.env.SENTRY_DSN`.
3. **`sentry.edge.config.ts`** — edge runtime init, guarded by `process.env.SENTRY_DSN`.
4. **`instrumentation.ts`** — Next.js 14 `register()` hook; calls the appropriate Sentry server/edge config conditionally.
5. **`next.config.mjs`** — wrap existing config with `withSentryConfig(nextConfig, { silent: true, org: '', project: '' })`.
6. **`.env.local.example`** — append `SENTRY_DSN=` and `NEXT_PUBLIC_SENTRY_DSN=` documentation lines.
7. **`package.json`** — add `@sentry/nextjs` as a prod dependency (latest stable, `^8`).

No logger (`lib/logger.ts`), no health endpoint — those are separate specs (spec-11). No CSRF, no session changes.

Sources: ROADMAP.md §work-7 · decomp-13.md · research-tech-stack.md (withSentryConfig absent, @sentry/nextjs absent) · AUDIT_REPORT.md §finding-022 · gaps.md §optional-settings-guards

## Dependencies

- **spec-03** (removes `ignoreBuildErrors: true` from `next.config.mjs`) — both specs touch `next.config.mjs`. This spec must be applied **after** spec-03, or applied in the same merge, to avoid overwriting the `ignoreBuildErrors` removal. The no-regression guard on `next.config.mjs` (see Files FORBIDDEN of spec-03) applies here: do not re-introduce `ignoreBuildErrors: true`.
- **spec-06** (dependency security bumps) — `package.json` is touched by both; merge order does not matter functionally but rebase if needed.
- **spec-11** (health endpoint) — declares `lib/logger.ts` and `sentry.*` as FORBIDDEN. This spec creates those Sentry files, so spec-11 must not be merged before this spec completes its Sentry files.

## Requirements

1. Add `@sentry/nextjs` to `dependencies` in `package.json` at version `^8.0.0` (latest stable major).
2. Create `sentry.client.config.ts` at project root:
   - Import `* as Sentry from '@sentry/nextjs'`.
   - Guard: `if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;` before `Sentry.init()`.
   - Call `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 1.0 })`.
3. Create `sentry.server.config.ts` at project root:
   - Same guard on `process.env.SENTRY_DSN`.
   - Call `Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1.0 })`.
4. Create `sentry.edge.config.ts` at project root:
   - Same guard on `process.env.SENTRY_DSN`.
   - Call `Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1.0 })`.
5. Create `instrumentation.ts` at project root:
   - Export `async function register()`.
   - Inside, branch on `process.env.NEXT_RUNTIME`:
     - `'nodejs'` → `await import('./sentry.server.config')`.
     - `'edge'` → `await import('./sentry.edge.config')`.
   - No-op when DSN is absent (guard is in the imported config files).
6. Modify `next.config.mjs`:
   - Import `withSentryConfig` from `@sentry/nextjs`.
   - Wrap the exported config: `export default withSentryConfig(nextConfig, { silent: true, org: '', project: '' })`.
   - Do NOT re-introduce `typescript.ignoreBuildErrors: true` (removed by spec-03).
7. Append to `.env.local.example` (two new lines, do not modify existing lines):
   ```
   SENTRY_DSN=
   NEXT_PUBLIC_SENTRY_DSN=
   ```

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `package.json` | extend | Add `@sentry/nextjs ^8.0.0` to `dependencies` |
| `sentry.client.config.ts` | create | Browser-side Sentry init, no-op if `NEXT_PUBLIC_SENTRY_DSN` absent |
| `sentry.server.config.ts` | create | Server-side Sentry init, no-op if `SENTRY_DSN` absent |
| `sentry.edge.config.ts` | create | Edge runtime Sentry init, no-op if `SENTRY_DSN` absent |
| `instrumentation.ts` | create | Next.js 14 `register()` hook dispatching to server/edge Sentry configs |
| `next.config.mjs` | modify | Wrap existing config export with `withSentryConfig()` |
| `.env.local.example` | extend | Append `SENTRY_DSN=` and `NEXT_PUBLIC_SENTRY_DSN=` documentation lines |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `lib/session.ts` — управляется spec-01 (SQLite migration) и spec-07 (session tests)
- `lib/session-store.ts` — управляется spec-01
- `package-lock.json` — управляется spec-06 (security bumps)
- `middleware.ts` — управляется spec-02 (CSRF middleware)
- `lib/csrf.ts` — управляется spec-02
- `jest.config.mjs` — управляется spec-07
- `jest.setup.ts` — управляется spec-07
- `app/api/health/route.ts` — управляется spec-11
- `lib/logger.ts` — создаётся spec-13 (этот спек); не трогается другими спеками батча
- `app/api/ai/parse-{cargo,vessel,recap}/route.ts` — управляются spec-08/spec-09/spec-10

## Acceptance Criteria

- [ ] `@sentry/nextjs` присутствует в `dependencies` в `package.json`.
- [ ] `sentry.client.config.ts` существует; при отсутствии `NEXT_PUBLIC_SENTRY_DSN` — `Sentry.init()` не вызывается.
- [ ] `sentry.server.config.ts` существует; при отсутствии `SENTRY_DSN` — `Sentry.init()` не вызывается.
- [ ] `sentry.edge.config.ts` существует; при отсутствии `SENTRY_DSN` — `Sentry.init()` не вызывается.
- [ ] `instrumentation.ts` экспортирует `async function register()` и динамически импортирует server или edge конфиг на основе `NEXT_RUNTIME`.
- [ ] `next.config.mjs` экспортирует результат `withSentryConfig(nextConfig, ...)`.
- [ ] `.env.local.example` содержит строки `SENTRY_DSN=` и `NEXT_PUBLIC_SENTRY_DSN=`; существующие строки не изменены.
- [ ] `npm run build` проходит без ошибок (в том числе без `ignoreBuildErrors: true`).
- [ ] `npm run lint` проходит без новых ошибок.
- [ ] Без заданного `SENTRY_DSN` приложение стартует и работает штатно (no-op path не бросает исключений).

## Compat Constraints

- **Next.js 14.2.35 App Router** — `instrumentation.ts` должен быть в корне проекта (рядом с `next.config.mjs`), не в `app/`. `register()` вызывается один раз при холодном старте воркера. [Source: decomp-13.md notes; Next.js 14 instrumentation hook specification]
- **TypeScript 5.9.3 strict mode** — все новые файлы должны компилироваться без ошибок при `noEmit`. Не использовать `any`; Sentry DSN тип — `string | undefined`.
- **`withSentryConfig` build-time behaviour** — при отсутствии `SENTRY_DSN` во время сборки `withSentryConfig` с `{ silent: true }` не завершает сборку ошибкой (silent mode подавляет предупреждения о DSN). [ASSUMED: withSentryConfig с { silent: true } не падает при отсутствии DSN — поведение не верифицировано напрямую; источник: gaps.md §optional-settings-guards]
- **`NEXT_PUBLIC_` prefix** — переменные, доступные в браузере, должны иметь префикс `NEXT_PUBLIC_`. Клиентский конфиг использует `NEXT_PUBLIC_SENTRY_DSN`; серверный и edge — `SENTRY_DSN`. [Source: research-tech-stack.md §env vars; Next.js environment variable rules]
- **PM2 + Node.js ≥18** — `instrumentation.ts` использует динамический `import()`; поддерживается в Node.js ≥18. [Source: architecture.md §Стек]

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-13-sentry-sentry-dsn-env-no-op`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
