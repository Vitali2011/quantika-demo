# Issue #581 — market widgets Unavailable for anon

**RC (confirmed via investigation disp-152132):** `/api/market/baltic-kpi` и `/api/market/bunker-kpi` не в AUTH_BYPASS_PATHS → middleware.ts возвращает 401 для анон → KpiCard → Unavailable UI.

**Tier:** M (risk-override: auth code) · creative=no · 2 files

## Fix

1. `middleware.ts` — добавить в `AUTH_BYPASS_PATHS`:
   - `/api/market/baltic-kpi`
   - `/api/market/bunker-kpi`
2. `__tests__/middleware-auth.test.ts` — добавить эти 2 пути в `bypassPaths` параметризованный массив.

## Pre-removal grep (sanity)
- grep AUTH_BYPASS_PATHS __tests__/ — единственный test-список
- grep "/api/market/" app/ lib/ components/ — убедиться endpoint'ы не имеют PII (публичные индексы + цены топлива, safe для анон)

## Out of scope
- Authentication mechanism (только bypass list change)
- Любые другие /api/* paths
- Сам KpiCard или PublicLanding markup
- Stale data fix (#567 — ops action, отдельно)

## QA gate
- jest middleware-auth.test.ts green
- jest --findRelatedTests middleware.ts green
- Manual smoke: curl https://demo.quantika.org/api/market/baltic-kpi?code=BDI → HTTP 200 + JSON
