# Spec 02: Нет CSRF на AI-эндпоинтах → атакующий может жечь OpenAI-счёт

> Batch: D5 | Complexity: medium | Est: 75 min | Files: 14

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router) + TypeScript 5.9.3 + OpenAI SDK 6.33.0 + googleapis 171.4.0 + Tailwind CSS 3.4.19 + shadcn 4.1.2 + PM2 + Caddy
- **Architecture:** Next.js App Router, in-memory session Map (lib/session.ts), AI calls routed via ClipProxy at CLIPROXY_BASE_URL, no database, all state per-session
- **Test command:** `npm test`
- **Lint command:** `next lint`

## Task Description

Все POST-роуты `app/api/ai/*` и смежные мутирующие эндпоинты принимают запросы на основании только `session_id` cookie без CSRF-токена. Атакующий может создать вредоносную страницу, заставить авторизованного пользователя открыть её, и браузер автоматически отправит cookie — инициировав дорогие AI-вызовы к OpenAI за счёт владельца аккаунта.

Дополнительно: `GET /api/sample` создаёт сессию через GET-запрос — нарушение REST (побочный эффект в GET) и дополнительный CSRF-вектор.

Решение: ввести `X-CSRF-Token` header-based protection; перевести `/api/sample` на POST.

## Dependencies

Нет внешних зависимостей (реализация на встроенных Node.js/Next.js crypto API).

Должна выполняться **после** или **независимо** от других spec-ов этого батча — не требует spec-06 (deps), spec-07 (sessions), spec-13 (sentry).

## Requirements

1. Создать `lib/csrf.ts` с функциями `generateCsrfToken(): string` и `validateCsrfToken(token: string): boolean` — token генерируется через `crypto.randomBytes(32).toString('hex')`, хранится в сессии или задаётся через заголовок Set-Cookie при инициализации сессии.
2. Создать `middleware.ts` в корне проекта: для всех POST-роутов `app/api/ai/*` и `app/api/emails/*` проверять наличие заголовка `X-CSRF-Token` с валидным токеном; возвращать 403 `{ error: 'Invalid or missing CSRF token' }` при отсутствии/невалидности.
3. `GET /api/sample` конвертировать в POST: изменить `export async function GET` → `export async function POST` в `app/api/sample/route.ts`.
4. CSRF-токен генерируется при создании сессии (в `app/api/auth/google/route.ts` и `app/api/sample/route.ts`) и возвращается клиенту (например, через заголовок `X-CSRF-Token` в ответе или JSON-поле).
5. Написать тесты в `lib/__tests__/csrf.test.ts`: генерация токена (уникальность), валидация корректного токена, валидация некорректного токена (пустой, null, неверный), интеграционный сценарий (мок Next.js NextRequest).

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/csrf.ts` | create | CSRF token generation и validation utilities |
| `lib/__tests__/csrf.test.ts` | create | Unit и integration тесты для CSRF utilities |
| `middleware.ts` | create | Next.js middleware: CSRF check для мутирующих AI/email эндпоинтов |
| `app/api/sample/route.ts` | modify | GET → POST; генерировать и возвращать CSRF-токен при создании сессии |
| `app/api/auth/google/route.ts` | modify | Генерировать и возвращать CSRF-токен при создании сессии после OAuth |
| `app/api/ai/classify/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/parse-cargo/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/parse-vessel/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/parse-recap/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/match/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/counterparty/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/recap/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/draft-quote/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |
| `app/api/ai/draft-reply/route.ts` | modify | При необходимости: добавить импорт CSRF (если не через middleware) |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `package.json` — управляется spec-06 (deps audit) и spec-13 (sentry)
- `package-lock.json` — управляется spec-06
- `lib/session.ts` — управляется spec-07
- `lib/__tests__/session.test.ts` — управляется spec-07
- `app/api/session/route.ts` — управляется spec-07
- `next.config.mjs` — управляется spec-13
- `sentry.client.config.ts` — управляется spec-13
- `sentry.server.config.ts` — управляется spec-13
- `sentry.edge.config.ts` — управляется spec-13
- `instrumentation.ts` — управляется spec-13
- `.env.local.example` — управляется spec-13

## Acceptance Criteria

- [ ] POST-запрос к `/api/ai/*` без заголовка `X-CSRF-Token` → ответ 403 `{ error: 'Invalid or missing CSRF token' }`
- [ ] POST-запрос к `/api/ai/*` с корректным `X-CSRF-Token` → проходит, обрабатывается роутом
- [ ] `GET /api/sample` более не существует — endpoint теперь POST (`export async function POST`)
- [ ] CSRF-токен доступен клиенту после создания сессии (Google OAuth или sample)
- [ ] `lib/__tests__/csrf.test.ts` содержит ≥5 тест-кейсов, `npm test` проходит без ошибок
- [ ] `next lint` проходит без новых ошибок
- [ ] `npm run build` проходит (TypeScript strict, no ignoreBuildErrors workaround for this spec)

## Compat Constraints

- Runtime: Node.js (PM2 on VPS) — использовать встроенный `node:crypto`, не внешние пакеты
- Next.js 14.2.35 App Router — `middleware.ts` должен экспортировать `default` функцию и использовать `NextResponse` из `next/server`; matcher config через `export const config = { matcher: [...] }`
- TypeScript strict mode (`tsconfig.json`: `strict: true`, `isolatedModules: true`) — все новые файлы должны проходить `tsc --noEmit`
- Существующий auth flow через `session_id` cookie (httpOnly, sameSite=lax) не изменять — CSRF добавляется поверх, не вместо

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-02-csrf-ai-openai`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
