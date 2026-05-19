# Rules: app/api/admin/\*\* + middleware.ts

## Invariants

- Каждый `/api/admin/*` handler обязан начинаться с `requireAdmin(req)` из `lib/auth/admin.ts`. Если `ADMIN_TOKEN` не задан → `500`. Если заголовок `X-Admin-Token` отсутствует/неверен → `401`.
- Пути, у которых есть своя auth (cron, market, knowledge, whatsapp, pipedrive), **обязаны** быть в `AUTH_BYPASS_PATHS` в `middleware.ts`. Иначе middleware перехватит запрос и переадресует на `/login` до того, как handler проверит свой токен.
- `AUTH_BYPASS_PATHS` — точные пути (`Set.has`), не префиксы. Добавление нового пути должно быть точным строковым совпадением.
- `AUTH_BYPASS_PREFIXES` — только для Next.js статики (`/_next/*`). Не добавлять туда API-пути.

## Anti-patterns (история регрессий)

- **Новый admin endpoint без bypass**: если добавить `/api/admin/X` с `requireAdmin`, но не добавить путь в `AUTH_BYPASS_PATHS` → middleware редиректит на `/login` → handler никогда не вызывается → silent 302 вместо 401/200. (ref: memory feedback_middleware_admin_whitelist.md)
- **Bypass без requireAdmin**: убрать `requireAdmin` из handler, оставив путь в bypass → endpoint становится публичным без auth. Оба шага обязательны вместе.
- **Тест bypass без проверки middleware-auth.test.ts**: при добавлении нового bypass-пути — добавить его в `bypassPaths` массив теста `__tests__/middleware-auth.test.ts`.

## Checklist перед commit'ом

- [ ] Новый `/api/admin/*` → `requireAdmin(req)` первой строкой в handler
- [ ] Путь добавлен в `AUTH_BYPASS_PATHS` в `middleware.ts`
- [ ] Путь добавлен в `bypassPaths` в `__tests__/middleware-auth.test.ts`
- [ ] `ADMIN_TOKEN` env var задокументирован в `.env.local.example` (если есть)
