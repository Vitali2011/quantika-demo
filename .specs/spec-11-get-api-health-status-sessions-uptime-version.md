# Spec 11: `GET /api/health` → `{ status, sessions, uptime, version }`

> Batch: D5 | Complexity: small | Est: 25 min | Files: 2

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Jest 30 + ts-jest 29, OpenAI SDK 6.33.0, googleapis 171.4.0, Tailwind + shadcn, PM2 + Caddy
- **Architecture:** Next.js App Router. No database — all state in-memory `Map<string, SessionData>` via `lib/session.ts`. `getSessionCount()` exported from `lib/session.ts:57`. Health route is a new `app/api/health/route.ts` with no auth requirement.
- **Test command:** `npm test` (`jest --forceExit`)
- **Lint command:** `npm run lint` (`next lint`)

## Task Description

There is no health-check endpoint in the project. Monitoring, uptime checks, and load balancer probes have no way to verify the application is running and responsive.

This spec adds `GET /api/health` — a lightweight, unauthenticated endpoint that returns a JSON payload with four fields:

- `status`: always `"ok"` when the server is responsive.
- `sessions`: active session count from `getSessionCount()` (`lib/session.ts:57`).
- `uptime`: server uptime in seconds from `process.uptime()`.
- `version`: application version string from `package.json` (`"0.1.0"`).

No auth cookie is required. No session mutation. The route returns HTTP 200 with `Content-Type: application/json`.

Sources: ROADMAP.md §10 · architecture.md §Слабые места · `lib/session.ts:57` (getSessionCount) · `package.json:2` (version "0.1.0") · research-api-contracts.md (existing route patterns) · research-tech-stack.md (Next.js 14, Jest 30)

## Dependencies

- **spec-07** (Jest config) should be merged before running tests for this spec, as `jest.config.mjs` and `jest.setup.ts` are required for `npm test` to resolve `@/` path aliases.
- No functional dependency on spec-01 (SQLite) — `getSessionCount()` exists in the current in-memory `lib/session.ts:57` and works regardless of backend.

## Requirements

1. Create `app/api/health/route.ts` exporting a `GET` handler:
   - No auth check (no `session_id` cookie required).
   - Reads `getSessionCount()` from `@/lib/session`.
   - Reads `process.uptime()` for uptime in seconds (float, round to 2 decimal places).
   - Reads version string from a hardcoded constant matching `package.json` `"version"` field (`"0.1.0"`), or imports it directly — whichever avoids bundler issues with JSON imports under `moduleResolution: bundler`.
   - Returns `NextResponse.json({ status: 'ok', sessions, uptime, version }, { status: 200 })`.

2. Create `app/api/health/__tests__/health.test.ts` with ≥4 test cases:
   - **200 status**: `GET /api/health` returns HTTP 200.
   - **status field**: response body contains `status: 'ok'`.
   - **sessions field**: response body contains a numeric `sessions` value equal to the mocked `getSessionCount()` return value.
   - **uptime field**: response body contains a numeric `uptime` > 0.
   - **version field**: response body contains `version: '0.1.0'`.

   Tests must mock `@/lib/session` to control `getSessionCount()` return value (use `jest.mock`).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `app/api/health/route.ts` | create | Unauthenticated GET handler returning `{ status, sessions, uptime, version }` |
| `app/api/health/__tests__/health.test.ts` | create | ≥4 unit tests covering status, sessions, uptime, version fields |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `lib/session.ts` — управляется spec-01 (SQLite migration; façade rewrite) и spec-07 (session tests)
- `lib/session-store.ts` — управляется spec-01
- `package.json` — управляется spec-01 (+better-sqlite3), spec-06 (security bumps), spec-07 (devDeps), spec-13 (Sentry)
- `package-lock.json` — управляется spec-06
- `next.config.mjs` — управляется spec-03 (removes ignoreBuildErrors) и spec-13 (withSentryConfig)
- `middleware.ts` — управляется spec-02 (CSRF middleware)
- `lib/csrf.ts` — управляется spec-02
- `jest.config.mjs` — управляется spec-07
- `jest.setup.ts` — управляется spec-07
- `lib/logger.ts` — управляется spec-13 (pino logger)
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts` — управляются spec-13
- `.env.local.example` — управляется spec-13

## Acceptance Criteria

- [ ] `GET /api/health` returns HTTP 200.
- [ ] Response body is valid JSON with `Content-Type: application/json`.
- [ ] `status` field equals `"ok"`.
- [ ] `sessions` field is a non-negative integer equal to `getSessionCount()`.
- [ ] `uptime` field is a positive number (seconds since process start, ≥0.0).
- [ ] `version` field equals `"0.1.0"`.
- [ ] No `session_id` cookie required — request without any cookie returns 200 (not 401).
- [ ] `app/api/health/__tests__/health.test.ts` contains ≥4 test cases; all pass under `npm test`.
- [ ] `npm run lint` passes without new errors.
- [ ] `npm run build` still passes (no TypeScript regressions).

## Compat Constraints

- **Next.js 14.2.35 App Router** — route file must export a named `GET` function, not a default export. Use `NextResponse.json()` from `next/server`, consistent with all existing route handlers.
- **TypeScript 5.9.3 strict mode** — `moduleResolution: bundler`; importing `package.json` with `assert { type: 'json' }` may fail under bundler resolution. Use a hardcoded version constant (`const VERSION = '0.1.0'`) to avoid JSON import issues. [ASSUMED: JSON import assertions not reliably supported under `moduleResolution: bundler` in Next.js 14]
- **Jest 30 + ts-jest 29** — tests must use `jest.mock('@/lib/session', ...)` to isolate `getSessionCount`. Path alias `@/` resolves via `jest.config.mjs` (managed by spec-07); ensure spec-07 is merged first.
- **Node.js ≥18** — `process.uptime()` is available natively; no polyfill needed.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-11-get-api-health-status-sessions-uptime-version`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
