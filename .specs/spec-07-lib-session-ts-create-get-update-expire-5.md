# Spec 07: `lib/session.ts` — create/get/update/expire (5+ тестов)

> Batch: D5 | Complexity: medium | Est: 60 min | Files: 4

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Jest 30 + ts-jest 29, better-sqlite3 (added by spec-01), OpenAI SDK 6.33.0, googleapis 171.4.0, Tailwind + shadcn, PM2 + Caddy
- **Architecture:** After spec-01 completes, `lib/session.ts` becomes a ≤30-line façade over `lib/session-store.ts` (SQLite via better-sqlite3). All callers in `app/api/**` use the same five exported functions: `createSession`, `getSession`, `updateSession`, `deleteSession`, `getSessionCount`. The only existing test file is `lib/__tests__/currency.test.ts` (8 tests); no Jest config (`jest.config.mjs`) or setup file exists yet.
- **Test command:** `npm test` (`jest --forceExit`)
- **Lint command:** `npm run lint` (`next lint`)

## Task Description

Coverage is 1.4% — only `lib/currency.ts` is tested. Jest is wired in `package.json` (`jest --forceExit`) but has no `jest.config.mjs` for Next.js TypeScript path aliases (`@/`). Without config, imports like `import { createSession } from '@/lib/session'` fail at resolve time.

This spec sets up the Jest infrastructure for the project and writes the first session unit tests, which are the contract guard for the SQLite-backed session store introduced in spec-01.

Two root causes to fix:

1. **No jest.config.mjs** — Jest runs without `next/jest` preset; `@/` path alias and TypeScript transform are not configured.
2. **Zero session tests** — `lib/session.ts` (and the underlying `lib/session-store.ts`) are untested; any regression in create/get/update/expire is invisible.

Fix: create `jest.config.mjs` (with `next/jest`), create `jest.setup.ts` (with `better-sqlite3` mock), write `lib/__tests__/session.test.ts` covering all five CRUD operations (≥5 cases).

Sources: `lib/session.ts:1-59` · `lib/__tests__/currency.test.ts` (existing test style) · ROADMAP.md §work-6 · audit-code-quality finding `lib/` (missing test coverage, HIGH) · audit-performance finding `lib/session.ts:5` (dangling timer + unbounded Map, HIGH) · `package.json:10` (jest + ts-jest present, no config)

## Dependencies

- **spec-01** must be merged first — after spec-01, `lib/session.ts` delegates to `lib/session-store.ts` (SQLite). The tests in this spec import `lib/session.ts` and exercise the SQLite-backed interface; running them against the original in-memory Map implementation will give a false green on persistence tests.
- No other blocking dependencies within this batch.

## Requirements

1. Create `jest.config.mjs` using `next/jest` preset:
   - `testEnvironment: 'node'` (session logic is server-side, no DOM needed).
   - `moduleNameMapper` for `@/` → `<rootDir>/` path alias (must match `tsconfig.json` paths).
   - `setupFilesAfterEach: ['<rootDir>/jest.setup.ts']` for global mocks.
   - Transform via `next/jest` handles TypeScript + ESM automatically; do not add a separate `ts-jest` transform entry.

2. Create `jest.setup.ts`:
   - Mock `better-sqlite3` using `jest.mock('better-sqlite3', ...)` with an in-memory SQLite stand-in **or** configure `jest.config.mjs` to resolve `better-sqlite3` to `better-sqlite3-memory` (preferred if available) — use whichever approach compiles and runs without native bindings in the CI environment.
   - Alternative: use `jest.mock` with a factory that creates a real in-memory `:memory:` database using the same `better-sqlite3` module (native bindings must be available). Use `jest.isolateModules` per test to reset the DB state.

3. Create `lib/__tests__/session.test.ts` with ≥5 test cases:
   - **create**: `createSession('token')` returns a non-empty string ID; subsequent `getSession(id)` returns a `SessionData` with `accessToken === 'token'` and empty arrays for all collection fields.
   - **get-hit**: after `createSession`, `getSession(id)` returns the session.
   - **get-miss**: `getSession('nonexistent-id')` returns `null`.
   - **get-expired**: after `createSession`, mock `Date.now()` to return `createdAt + SESSION_TTL_MS + 1`; assert `getSession(id)` returns `null`.
   - **update**: `updateSession(id, { emails: [mockEmail] })` returns `true`; subsequent `getSession(id)` has `emails` array of length 1.
   - **expire-old**: call `expireOldSessions()` after creating a session whose TTL has passed; assert `getSession(id)` returns `null` and `getSessionCount()` returns 0.
   - **delete**: `deleteSession(id)` removes the session; subsequent `getSession(id)` returns `null`.
   
   Use `jest.spyOn(Date, 'now')` or `jest.setSystemTime` (via `jest.useFakeTimers`) for time-based tests.

4. Extend `package.json` (append only):
   - If `jest.config.mjs` requires additional dev packages (e.g. `@types/better-sqlite3` is not yet present), add them to `devDependencies`. Do not remove or modify any existing entry.
   - The existing `"test": "jest --forceExit"` script is sufficient; do not change it.

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `jest.config.mjs` | create | Next.js-aware Jest configuration with `@/` path alias and `node` test environment |
| `jest.setup.ts` | create | Global test setup: `better-sqlite3` isolation strategy, fake timers config |
| `lib/__tests__/session.test.ts` | create | ≥7 unit tests: create, get-hit, get-miss, get-expired, update, expire-old, delete |
| `package.json` | extend | Append missing dev deps only (e.g. `@types/better-sqlite3` if absent); no deletions |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `lib/session.ts` — управляется spec-01 (SQLite migration; façade rewrite)
- `lib/session-store.ts` — управляется spec-01 (primary owner of SQLite store implementation)
- `lib/__tests__/session-store.test.ts` — управляется spec-01 (persistence + eviction tests)
- `package-lock.json` — управляется spec-06 (security dep updates; regenerated by npm install)
- `next.config.mjs` — управляется spec-03 (removes ignoreBuildErrors) и spec-13 (withSentryConfig)
- `middleware.ts` — управляется spec-02 (CSRF middleware)
- `lib/csrf.ts` — управляется spec-02
- `app/api/sample/route.ts` — управляется spec-02 (GET → POST conversion)
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts` — управляются spec-13
- `.env.local.example` — управляется spec-13

> Note on `package.json`: also touched by spec-01 (+better-sqlite3), spec-06 (security bumps), spec-13 (Sentry dep).
> spec-07 may only **append** missing dev-dep entries — must not modify or remove any existing dependency line.

## Acceptance Criteria

- [ ] `npm test` exits 0 — all tests pass (includes pre-existing `lib/__tests__/currency.test.ts`).
- [ ] `jest.config.mjs` is present and uses `next/jest` preset; `@/` imports resolve correctly in test files.
- [ ] `lib/__tests__/session.test.ts` contains ≥7 test cases; all green.
- [ ] `createSession` test: returned ID is a non-empty string; `getSession(id)` returns object with correct `accessToken`.
- [ ] `getSession` miss test: `getSession('no-such-id')` returns `null`.
- [ ] `getSession` expiry test: session is invisible after `SESSION_TTL_MS` elapses (time mocked via `jest.useFakeTimers` or `jest.spyOn(Date, 'now')`).
- [ ] `updateSession` test: `emails` field is persisted and readable via `getSession`.
- [ ] `expireOldSessions` test: expired sessions are removed; `getSessionCount()` decrements correctly.
- [ ] `deleteSession` test: session is gone after deletion; `getSession` returns `null`.
- [ ] `npm run lint` passes without new errors.
- [ ] `npm run build` still passes (no TypeScript regressions from new files).
- [ ] Test coverage for `lib/session.ts` ≥ 80% of critical paths (create/get/update/expire/delete branches) — verified by `npm test -- --coverage`.

## Compat Constraints

- **Jest 30** (`jest ^30.3.0`) + **ts-jest 29** (`ts-jest ^29.4.9`) — already in `package.json`; do not downgrade or replace.
- **Next.js 14.2.35** — `next/jest` preset is the only supported way to configure Jest for Next.js App Router projects; do not use `babel-jest` or custom transform chains.
- **TypeScript 5.9.3 strict mode** (`strict: true`, `isolatedModules: true`, `moduleResolution: bundler`) — `jest.config.mjs` and `jest.setup.ts` must pass `npx tsc --noEmit`.
- **better-sqlite3 native bindings**: tests that open a real `:memory:` database require native bindings to be built (`npm install`). If CI does not run `npm rebuild`, mock `better-sqlite3` entirely in `jest.setup.ts`. [ASSUMED: native bindings available after `npm install` in dev environment per Node.js ≥18]
- **Node.js ≥18**: `node:crypto` `randomUUID()` is available natively; no polyfill needed in tests.
- **SessionData.createdAt is `Date`**: after spec-01 the SQLite store deserializes `created_at` (Unix ms) back to a `Date` instance; tests that compare `createdAt` should use `instanceof Date` or `expect.any(Date)`, not string equality.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-07-lib-session-ts-create-get-update-expire-5`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
