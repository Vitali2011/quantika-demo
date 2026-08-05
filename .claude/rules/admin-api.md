---
paths:
  - app/api/admin/**
  - middleware.ts
  - lib/auth/admin.ts
  - __tests__/middleware-auth.test.ts
---

# Rules: app/api/admin/\*\* + middleware.ts

## Invariants

- Каждый `/api/admin/*` handler обязан проверять auth до обработки входа.
  По умолчанию используй `requireAdmin(req)` из `lib/auth/admin.ts`: без
  `ADMIN_TOKEN` он возвращает `500`, а без корректного `X-Admin-Token` — `401`.
  Route с явно выделенным механизмом auth может быть исключением; например,
  `/api/admin/cron-heartbeat` проверяет `X-Cron-Secret`.
- Пути, у которых есть своя auth (cron, market, knowledge, whatsapp, pipedrive), **обязаны** быть в `AUTH_BYPASS_PATHS` в `middleware.ts`. Иначе middleware перехватит запрос и переадресует на `/login` до того, как handler проверит свой токен.
- `AUTH_BYPASS_PATHS` — точные пути (`Set.has`), не префиксы. Добавление нового пути должно быть точным строковым совпадением.
- `AUTH_BYPASS_PREFIXES` — только для Next.js статики (`/_next/*`). Не добавлять туда API-пути.

## Anti-patterns (история регрессий)

- **Новый admin endpoint без bypass**: handler со своим token/secret auth не
  выполняется, если middleware раньше редиректит запрос на `/login`.
- **Bypass без route auth**: путь в bypass становится публичным, если handler не
  проверяет `requireAdmin` или другой явно выбранный credential/signature.
- **Тест bypass без проверки middleware-auth.test.ts**: при добавлении нового bypass-пути — добавить его в `bypassPaths` массив теста `__tests__/middleware-auth.test.ts`.

## Checklist перед commit'ом

- [ ] Новый `/api/admin/*` → явный auth до обработки входа; по умолчанию
      `requireAdmin(req)`, отдельный механизм только как документированное исключение
- [ ] Путь добавлен в `AUTH_BYPASS_PATHS` в `middleware.ts`
- [ ] Путь добавлен в `bypassPaths` в `__tests__/middleware-auth.test.ts`
- [ ] `ADMIN_TOKEN` env var задокументирован в `.env.local.example` (если есть)
