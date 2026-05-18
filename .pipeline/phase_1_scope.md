# Phase 1 Scope — p6-webhooks-bypass

## Assumptions (Rule A)

Понимаю задачу как: добавить webhook paths в AUTH_BYPASS_PATHS в middleware.ts и в
bypassPaths в __tests__/middleware-auth.test.ts, чтобы внешние сервисы (Meta/WhatsApp
и Pipedrive) могли вызывать webhook endpoints без auth-cookie.

Задача ожидала 5 webhook routes — реально найдено 2 (остальные browser-based или internal):
- /api/whatsapp/webhook — GET (Meta verification) + POST (events), caller=Meta
- /api/integrations/pipedrive/webhook — POST (events), caller=Pipedrive

## Files in Scope

1. middleware.ts — добавить 2 пути в AUTH_BYPASS_PATHS Set
2. __tests__/middleware-auth.test.ts — добавить 2 пути в bypassPaths array

## Rule G: YES (auth domain, mandatory even for 2 files / <50 LOC)

## Precedent: /api/admin/cron-heartbeat + /api/admin/market/upload-csv (#162)
