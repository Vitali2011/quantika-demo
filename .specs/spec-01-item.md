# Spec 01: Сессии теряются при рестарте → данные пользователя исчезают

> Batch: 1 | Complexity: medium | Est: 120 min | Files: 4

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript strict), better-sqlite3 (new dep), OpenAI SDK 6.33.0, googleapis 171.4.0, Tailwind + shadcn, PM2 + Caddy
- **Architecture:** All session state lives in `lib/session.ts` as a global `Map<string, SessionData>`. On PM2 restart the Map is wiped. Replacing with `lib/session-store.ts` (better-sqlite3) provides persistence with the same public interface. No other DB layer exists.
- **Test command:** `jest --forceExit`
- **Lint command:** `next lint` [ASSUMED]

## Task Description

`lib/session.ts:5` stores all user data in an in-memory `Map<string, SessionData>`. Every PM2 restart (deploy, crash, OOM-kill) destroys all active sessions and their parsed email/cargo/vessel data.

Three bugs in the current implementation compound the problem:
1. **No persistence** — in-memory Map evaporates on restart.
2. **Unbounded growth** — no MAX_SESSIONS cap; under load the Map grows indefinitely.
3. **Dangling timer** — `createSession` registers `setTimeout(() => sessions.delete(id), SESSION_TTL_MS)` (line 26) but stores no handle; `deleteSession` cannot cancel it, leaving a ghost timer per deleted session.

Fix: introduce `lib/session-store.ts` backed by better-sqlite3 with the interface `getSession / createSession / updateSession / deleteSession / expireOldSessions / getSessionCount`. Rewrite `lib/session.ts` to delegate to the store. Add `MAX_SESSIONS` guard and `clearTimeout` in `deleteSession`.

Sources: `lib/session.ts:5-59` · `lib/constants.ts:6` · ROADMAP.md §4 · audit-architecture finding `lib/session.ts:5` (high) · audit-performance finding `lib/session.ts:5` (high)

## Dependencies

- **spec-00** must be merged first — `SessionData` and all nested domain types (`Email`, `Classification`, `ProcessedEmail`, `ParsedCargo`, `ParsedVessel`, `ParsedFixtureRecap`, `Match`, `Recap`, `CommissionSummary`, `Counterparty`) are defined in `lib/types.ts` which spec-00 owns.
- **spec-07** (session unit tests) depends on this spec — tests assume the new SQLite-backed interface.

## Requirements

1. Add `better-sqlite3` (and `@types/better-sqlite3`) to `package.json` dependencies.
2. Create `lib/session-store.ts`:
   - On first run, create `data/sessions.db` and the `sessions` table: `(id TEXT PK, access_token TEXT, created_at INTEGER, expires_at INTEGER, data TEXT)`.
   - `data` column stores the non-primitive session fields (`emails`, `classifications`, …) as JSON.
   - Expose: `createSession(accessToken): string`, `getSession(id): SessionData | null`, `updateSession(id, updates: Partial<SessionData>): boolean`, `deleteSession(id): void`, `expireOldSessions(): void`, `getSessionCount(): number`.
   - `getSession` returns `null` for missing rows AND for rows where `expires_at < Date.now()`.
   - `expireOldSessions` deletes all rows where `expires_at < Date.now()`.
3. Add a `MAX_SESSIONS` constant (default 100) in `lib/constants.ts` or at top of `lib/session-store.ts`. `createSession` must evict the oldest row (by `created_at`) when count would exceed the limit.
4. Rewrite `lib/session.ts` to be a thin re-export facade over `lib/session-store.ts`, preserving the exact same exported function signatures so all callers remain unchanged.
5. Remove the dangling `setTimeout` pattern from the new implementation. Session expiry must be lazy (checked in `getSession`) or driven by explicit `expireOldSessions()` calls — not by floating timers.
6. Include a `data/` directory entry in `.gitignore` (append only) to exclude `sessions.db` from version control.
7. Write tests in `lib/__tests__/session-store.test.ts` covering: create, get, update, expire (TTL-based), persistence-across-process-restart simulation (write then re-open DB), MAX_SESSIONS eviction (6+ test cases).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/session-store.ts` | create | SQLite session repository: table init, CRUD, expiry, MAX_SESSIONS guard |
| `lib/session.ts` | modify | Replace in-memory Map with session-store calls; remove dangling setTimeout |
| `lib/__tests__/session-store.test.ts` | create | 6+ tests: create/get/update/expire/persistence/eviction |
| `package.json` | extend | Append `better-sqlite3` + `@types/better-sqlite3` to dependencies/devDependencies |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `package-lock.json` — управляется spec-06 (dependency security fixes; regenerates automatically via `npm install`)
- `lib/__tests__/session.test.ts` — управляется spec-07 (session unit tests; primary owner)
- `app/api/session/route.ts` — управляется spec-07 (external API contract tests)
- `next.config.mjs` — управляется spec-13 (Sentry `withSentryConfig` wrapper)
- `.env.local.example` — управляется spec-13 (SENTRY_DSN env var documentation)
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts` — управляются spec-13

> Note on `package.json`: also touched by spec-06 (security bumps) and spec-13 (Sentry dep).
> spec-01 may only **append** `better-sqlite3` / `@types/better-sqlite3` lines — must not modify or remove any existing dependency lines.

## Acceptance Criteria

- [ ] `npm run build` exits 0 after the change (no new TypeScript errors).
- [ ] `jest --forceExit lib/__tests__/session-store.test.ts` — all 6+ tests green.
- [ ] Sessions survive simulated restart: write a session to SQLite in one in-process step, re-instantiate the store (new DB connection), assert the session is still readable — test included in `session-store.test.ts`.
- [ ] `getSession` returns `null` after `SESSION_TTL_MS` has elapsed (tested with mocked `Date.now`).
- [ ] `expireOldSessions` removes expired rows from the DB.
- [ ] MAX_SESSIONS guard: after inserting N+1 sessions (where N = MAX_SESSIONS), the oldest session is evicted; `getSessionCount() === N`.
- [ ] No dangling `setTimeout` references in `lib/session.ts` — grep confirms `setTimeout` is absent from the file after the change.
- [ ] Domain extraction: in-memory Map logic moved from `lib/session.ts` to `lib/session-store.ts`; `lib/session.ts` reduced to ≤30 lines (facade only, ≥60% LOC reduction from current ~59 lines).
- [ ] `data/sessions.db` listed in `.gitignore` (not committed).
- [ ] All existing callers of `getSession`, `createSession`, `updateSession`, `deleteSession` in `app/api/**` continue to compile without changes.

## Compat Constraints

- **Next.js 14.2.35**: no version change to Next.js or its peer deps.
- **TypeScript strict mode** (`tsconfig.json`: `strict: true`, `isolatedModules: true`): all new code must pass `npx tsc --noEmit`.
- **better-sqlite3 native bindings**: requires `node-gyp` / build tools on the VPS. Document in `docs/deploy.md` (append only) if build step is needed post-`npm install`. Node.js 18+ assumed (PM2 deployment). [ASSUMED: Node.js ≥18 on production VPS based on Next.js 14 requirements]
- **PM2 working directory**: `data/sessions.db` path must resolve relative to the Next.js project root, not `/tmp`. Use `path.join(process.cwd(), 'data', 'sessions.db')` or an explicit env var `SESSIONS_DB_PATH`. [ASSUMED: `process.cwd()` is stable under PM2 with `ecosystem.config.js`]
- **SessionData JSON serialization**: `createdAt: Date` field must be serialized as ISO string or Unix timestamp; deserialize back to `Date` on read. All other array fields (`emails`, `classifications`, …) serialized as JSON text.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-01-item`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
