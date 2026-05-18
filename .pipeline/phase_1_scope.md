# Phase 1 Scope — Coverage Backfill: Untested API Routes

## Assumptions (Rule A)

Понимаю задачу как: написать тесты покрытия для 11 существующих non-LLM API route'ов, которые сейчас не покрыты тестами. Impl уже существует — тесты должны быть GREEN против существующей impl и поднять coverage gate в CI.

Альтернатива: добавить только smoke-тесты (1-2 на route). Иду по полному покрытию (3-5 тестов на route): spec требует ≥80% line coverage per route.

## Routes в scope (11)

| Route | Handler | Auth | DB | Test file |
|-------|---------|------|----|-----------|
| `admin/market/upload-csv` | POST | requireAdmin (X-Admin-Token) | migration_027 | `__tests__/api/admin/market/upload-csv.test.ts` |
| `audit` | GET + POST | requireSession | migration_002 | `__tests__/api/audit.test.ts` |
| `auth/logout` | POST | none | none | `__tests__/api/auth/logout.test.ts` |
| `canal/[canal_code]` | GET | none | none (pure fn) | `__tests__/api/canal.test.ts` |
| `demo-scenarios/[id]` | GET | none | none (pure fn) | `__tests__/api/demo-scenarios.test.ts` |
| `economics` | POST | CSRF only | none (mock computeEconomics) | `__tests__/api/economics.test.ts` |
| `extension/context` | GET | requireSession | none (session in-memory) | `__tests__/api/extension-context.test.ts` |
| `health` | GET | none | none (mock getSessionCount) | `__tests__/api/health-root.test.ts` |
| `market/tmi` | GET | none | migration_027 | `__tests__/api/market-tmi.test.ts` |
| `port-da/[port_code]` | GET | none | migration_010 | `__tests__/api/port-da.test.ts` |
| `session` | DELETE | none (cookie) | none | `__tests__/api/session.test.ts` |

## Exclusions

- `ai/*` — LLM-heavy, expensive, prohibited
- `vessel/[imo]` — parallel parser session conflict
- `emails/fetch` — Gmail conflict
- `voyage/*`, `laytime/*`, `charterers*` — already covered
- `auth/login`, `auth/google` — OAuth flow complexity

## Boundaries

**Can Change:** `__tests__/api/` — new test files only

**Cannot Change:** Any production file (`app/api/`, `lib/`)

**Must Not Break:** All existing tests (full `npm test` suite)

## Mock Strategy

| Dependency | Mock |
|-----------|------|
| `@/lib/session` / requireSession | `jest.mock(() => ({ requireSession: jest.fn(() => ({ session: {...}, sessionId: 'test-sid' })) }))` |
| `@/lib/session-store` / getStore | `jest.mock(() => ({ getStore: jest.fn(() => ({ getDatabase: () => testDb, getDb: () => testDb, getSessionCount: () => 3, deleteSession: jest.fn() })) }))` |
| `@/lib/csrf` | `jest.mock(() => ({ validateCsrf: jest.fn(() => true), checkCsrfRequest: jest.fn(() => true) }))` |
| `@/lib/economics` / computeEconomics | `jest.mock(() => ({ computeEconomics: jest.fn().mockResolvedValue({...}) }))` |
| Admin token | `process.env.ADMIN_TOKEN = 'test-admin-token'` + `X-Admin-Token` header |

## Test template (3-5 tests per route)

1. Auth → 401 (for auth routes) OR CSRF → 403 (for CSRF routes)
2. Validation error → 400 (missing/invalid input)
3. Happy path → 200/201 + expected JSON shape
4. Not found → 404 (for [id] / [code] params routes)
5. Error handling → 500 (mock failure where applicable)

## Open Questions
(none)
