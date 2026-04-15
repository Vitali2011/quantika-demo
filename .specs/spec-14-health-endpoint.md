# Spec 14: Тесты на health-endpoint

> Batch: D5 | Complexity: small | Est: 20 min | Files: 1

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Jest 30 + ts-jest 29, OpenAI SDK 6.33.0, googleapis 171.4.0, Tailwind + shadcn, PM2 + Caddy
- **Architecture:** Next.js App Router. No database — all state in-memory `Map<string, SessionData>` via `lib/session.ts`. `getSessionCount()` exported from `lib/session.ts`. Health route created by spec-11 at `app/api/health/route.ts` — unauthenticated, returns `{ status, sessions, uptime, version }`.
- **Test command:** `npm test` (`jest --forceExit`)
- **Lint command:** `npm run lint` (`next lint`)

## Task Description

`GET /api/health` endpoint is created by spec-11 but has no dedicated test coverage. This spec adds the test file for the health endpoint, verifying all four response fields, the HTTP status code, unauthenticated access, and correct mocking of `getSessionCount()`.

The health endpoint contract (source: ROADMAP.md §work-7, spec-11):
- `GET /api/health` — no auth cookie required.
- Response HTTP 200 with `Content-Type: application/json`.
- Body: `{ status: 'ok', sessions: <getSessionCount()>, uptime: <process.uptime()>, version: '0.1.0' }`.

Tests must mock `@/lib/session` (to control `getSessionCount()` return value) and exercise all fields plus the no-auth guarantee.

Sources: ROADMAP.md §work-7 · spec-11 (health route contract) · research-tech-stack.md (Jest 30, ts-jest 29, Next.js 14) · architecture.md (session.ts, getSessionCount)

## Dependencies

- **spec-11** must be merged first — `app/api/health/route.ts` must exist before tests can import and invoke the handler.
- **spec-07** must be merged first — `jest.config.mjs` with `next/jest` preset and `@/` path alias resolution is required for `npm test` to find `@/lib/session` imports.

## Requirements

1. Create `app/api/health/__tests__/health.test.ts` with ≥5 test cases:

   - **status-200**: invoke the `GET` handler, assert the returned `Response` (or `NextResponse`) has `status === 200`.
   - **status-ok**: parse the JSON body, assert `body.status === 'ok'`.
   - **sessions-field**: mock `getSessionCount` to return a fixed value (e.g. `7`); assert `body.sessions === 7`.
   - **uptime-field**: assert `body.uptime` is a number greater than or equal to `0`.
   - **version-field**: assert `body.version === '0.1.0'`.
   - **no-auth**: invoke the handler without any cookies / session context; assert response is still HTTP 200 (not 401).

2. Mock `@/lib/session` using `jest.mock('@/lib/session', () => ({ getSessionCount: jest.fn().mockReturnValue(7) }))`.

3. The handler must be imported directly (unit test, not HTTP fetch) as a named export `GET` from `@/app/api/health/route` — consistent with existing test patterns (e.g. `app/api/ai/__tests__/classify.test.ts`).

4. No additional packages are required. Do not modify `package.json`.

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `app/api/health/__tests__/health.test.ts` | create | ≥5 unit tests: status-200, status-ok, sessions-field, uptime-field, version-field, no-auth |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `app/api/health/route.ts` — управляется spec-11 (реализация health-роута)
- `lib/session.ts` — управляется spec-01 (SQLite migration) и spec-07 (session tests)
- `lib/session-store.ts` — управляется spec-01
- `package.json` — управляется spec-01 (+better-sqlite3), spec-06 (security bumps), spec-07 (devDeps), spec-13 (+@sentry/nextjs, pino)
- `package-lock.json` — управляется spec-06
- `next.config.mjs` — управляется spec-03 (removes ignoreBuildErrors) и spec-13 (withSentryConfig)
- `middleware.ts` — управляется spec-02 (CSRF middleware)
- `lib/csrf.ts` — управляется spec-02
- `jest.config.mjs` — управляется spec-07
- `jest.setup.ts` — управляется spec-07
- `lib/logger.ts` — управляется spec-12 (pino logger)
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts` — управляются spec-13
- `.env.local.example` — управляется spec-13

## Acceptance Criteria

- [ ] `app/api/health/__tests__/health.test.ts` exists and contains ≥5 test cases.
- [ ] All tests pass under `npm test` (exit 0).
- [ ] `status-200` test: handler returns HTTP 200.
- [ ] `status-ok` test: JSON body `status` field equals `"ok"`.
- [ ] `sessions-field` test: JSON body `sessions` field equals the mocked `getSessionCount()` return value.
- [ ] `uptime-field` test: JSON body `uptime` is a number ≥ 0.
- [ ] `version-field` test: JSON body `version` equals `"0.1.0"`.
- [ ] `no-auth` test: handler invoked without cookies returns 200 (not 401).
- [ ] `@/lib/session` is mocked via `jest.mock` — test does not depend on real session state.
- [ ] `npm run lint` passes without new errors.
- [ ] `npm run build` still passes (no TypeScript regressions).

## Compat Constraints

- **Next.js 14.2.35 App Router** — `GET` handler is a named export from `app/api/health/route.ts`; import it as `import { GET } from '@/app/api/health/route'` in tests. [ASSUMED: consistent with existing test patterns for App Router route handlers]
- **TypeScript 5.9.3 strict mode** — test file must pass `npx tsc --noEmit`; use explicit types where inference falls back to `any`.
- **Jest 30 + ts-jest 29** — `jest.mock` factory runs before module evaluation; place mock before imports or use `jest.mock` at the top level. Path alias `@/` requires `jest.config.mjs` from spec-07. [ASSUMED: spec-07 must be merged before running these tests]
- **Node.js ≥18** — `Response` / `NextResponse` globals available; no polyfill needed.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-14-health-endpoint`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
