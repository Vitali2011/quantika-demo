# Phase 1 — Scope: β-02 Pipedrive CRM Bridge

**Date:** 2026-04-29
**Branch:** `spec/beta/02-pipedrive-crm-bridge`
**Reference:** `.specs/spec-beta-02-pipedrive-crm-bridge.md`

## Spec

Интеграция с Pipedrive CRM: OAuth 2.0 flow, зашифрованное хранение токенов,
синхронизация quotes → deals + contacts, входящий webhook с HMAC-верификацией.

## Boundaries

**Can change:**
- `lib/integrations/pipedrive/` (новый модуль)
- `app/api/integrations/pipedrive/` (новые роуты)
- `lib/migrations/008-pipedrive-tables.ts` + `lib/migrations/index.ts`
- `scripts/migrations/008-pipedrive-tables.sql`
- `tests/unit/integrations/pipedrive/`
- `tests/integration/pipedrive/`
- `__tests__/e2e/` (Playwright)
- `.env.local.example`

**Cannot change:** существующие API-роуты, схема sessions/audit таблиц, lib/types.ts (без
расширения), function signatures других модулей.

**Must-Not-Break:** `npm test` (все существующие тесты), `npm run lint`, `npm run build`.

## Work Fronts

| WF | Файл | Зависит от |
|----|------|------------|
| WF0 | types.ts + migration + SQL | — |
| WF1 | tokens.ts | WF0 (DB schema) |
| WF2 | webhook/route.ts | WF0 (DB schema), env |
| WF3 | client.ts | WF1 (tokens interface) |
| WF4 | sync.ts | WF3 |
| WF5 | oauth/route.ts | WF3 |

**WF1 и WF2 — параллельны**. WF4 и WF5 — параллельны после WF3.

## Input Contract

### `tokens.ts`

| Класс | Пример | Решение |
|-------|--------|---------|
| Empty/falsy accountId | 0, -1 | `throw new RangeError` |
| Пустые строки токенов | `""`, `null` | `throw new TypeError` |
| NaN/Infinity в expires_at | `NaN`, `Infinity` | `Number.isFinite` guard → `throw RangeError` |
| Отрицательный expires_at | `-1` | `throw new RangeError` |
| Отсутствует ENCRYPTION_KEY | `undefined` | `throw Error` при инициализации модуля |

### `sync.ts`

| Класс | Пример | Решение |
|-------|--------|---------|
| Empty/falsy quoteId | 0, -1 | `throw new RangeError` |
| Non-existent quote | `quoteId=99999` | propagate from data layer |
| Повторный вызов | second call same quoteId | идемпотентно (проверить mapping) |
| Неизвестный newStatus | `"nonsense"` | exhaustive default → `throw Error` |

### `webhook/route.ts`

| Класс | Пример | Решение |
|-------|--------|---------|
| Нет заголовка подписи | undefined | 401 |
| Неверная HMAC-подпись | wrong bytes | 401 |
| Пустое тело | `""` | 400 |
| Отсутствует PIPEDRIVE_WEBHOOK_SECRET | `undefined` | 500 |

### `oauth/route.ts`

| Класс | Пример | Решение |
|-------|--------|---------|
| Отсутствует `code` в callback | `?action=callback` без code | 400 |
| state mismatch (CSRF) | подменённый state | 401 |
| Отсутствует CLIENT_ID env | `undefined` | 500 на init |

## Deletion Inventory

Нет удалений — только создание нового модуля.

## Gate

✅ Scope ready — переход к Phase 2.
