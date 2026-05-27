# Public landing on / for anonymous users

**Source:** User reported demo.quantika.org/ → /login (302) для анон; ожидается PublicLanding render.
**Tier:** M (risk-override: auth code) · creative=no · 2 files

## Root cause

app/page.tsx уже рендерит `<PublicLanding />` для анонимных + `redirect(/dashboard)` для logged-in. Но `middleware.ts` режет `/` через auth gate ДО page render — отсюда 302 → /login.

## Fix

1. middleware.ts — добавить `/` в `AUTH_BYPASS_PATHS` (memory ref: feedback_middleware_admin_whitelist).
2. __tests__/middleware-auth.test.ts — добавить `/` в `bypassPaths` ожидаемый список.
3. Сохранить: logged-in users по-прежнему получают `redirect(/dashboard)` из app/page.tsx.
4. Smoke: `curl -sI https://demo.quantika.org/` после deploy ожидаем HTTP 200 для анонима (вместо 302 /login).

## Out-of-scope

- Любые другие public paths (только `/`)
- Изменения логики redirect для logged-in (уже корректна в app/page.tsx)
- Сам компонент PublicLanding (рендеринг уже есть)
- Любые routing changes за пределами middleware.ts

## QA gate

- jest middleware-auth.test.ts green
- jest --findRelatedTests middleware.ts green
- /test-skill cold QA на PR (risk-override auth)
- Manual visual: curl `/` → HTTP 200, curl `/dashboard` без session → 302 /login (still gated)
