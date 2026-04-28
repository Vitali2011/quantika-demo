# ROADMAP-infra.md — Wave A: Infrastructure Hardening (plan_id: infra)

Pilot-gate условие. ~5 дней. Все 4 пункта — P0.

## A-1. Sentry integration

Подключить Sentry к Next.js фронтенду и API-роутам. DSN из env-переменных
`NEXT_PUBLIC_SENTRY_DSN` (клиент) и `SENTRY_DSN` (сервер). Загружать
sourcemap'ы на Sentry при сборке через `@sentry/nextjs` Webpack-плагин
(переменная `SENTRY_AUTH_TOKEN`).

Acceptance criteria:
- `sentry.client.config.ts` и `sentry.server.config.ts` созданы
- `next.config.mjs` обёрнут в `withSentryConfig`
- Все API-роуты в `app/api/` оборачивают handler в Sentry instrument
- Sourcemap upload при `npm run build` (если `SENTRY_AUTH_TOKEN` задан)
- `.env.example` содержит `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- Тест: unit-тест на то, что Sentry инициализируется только при наличии DSN

Files in scope: `sentry.client.config.ts`, `sentry.server.config.ts`,
`next.config.mjs`, `app/api/**/route.ts`, `.env.example`, `package.json`
(+`@sentry/nextjs`).

## A-2. Uptime monitoring + /api/healthcheck

Создать endpoint `/api/healthcheck` (GET) и задокументировать подключение
к UptimeRobot / BetterStack с алертами через ntfy.

Acceptance criteria:
- `GET /api/healthcheck` возвращает `{ status: "ok", ts: "<ISO8601>" }` с HTTP 200
- Ответ не требует авторизации (публичный endpoint)
- В `README.md` секция «Uptime monitoring» с инструкцией: URL монитора,
  интервал (60 сек), alerting через ntfy (`NTFY_TOPIC` из env)
- Тест на endpoint: проверяет статус и структуру ответа

Files in scope: `app/api/healthcheck/route.ts` (новый), `README.md`.

## A-3. Staging environment

PM2 ecosystem config с окружением `staging` и Caddy vhost-шаблон для
`staging.quantika.org`. Staging полностью изолирован от prod по env-vars
и порту.

Acceptance criteria:
- `ecosystem.config.js` содержит два app-объекта: `quantika-demo` (prod)
  и `quantika-demo-staging` (staging, `NODE_ENV=staging`, порт 3001)
- `deploy/Caddyfile.staging` — Caddy vhost для `staging.quantika.org`
  с reverse_proxy на порт 3001 и TLS через Let's Encrypt
- `docs/staging.md` — инструкция деплоя staging: clone → env → pm2 start
- `.env.staging.example` содержит все переменные для staging окружения

Files in scope: `ecosystem.config.js` (новый), `deploy/Caddyfile.staging`
(новый), `docs/staging.md` (новый), `.env.staging.example` (новый).

## A-4. GitHub Actions CI/CD

Два workflow: CI на PR и деплой на push в `main`.

Acceptance criteria:
- `.github/workflows/ci.yml` запускается на каждый PR в `main`:
  шаги `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test` → `npm run build`.
  Fail-fast: любой упавший шаг блокирует merge.
- `.github/workflows/deploy.yml` запускается на push в `main`:
  build → SSH-деплой на staging. `workflow_dispatch` с параметром `environment`
  (staging | production) для ручного promote.
- Secrets документированы в `docs/ci-secrets.md`:
  `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `NTFY_TOPIC`
- README.md содержит CI badge

Files in scope: `.github/workflows/ci.yml` (новый),
`.github/workflows/deploy.yml` (новый), `docs/ci-secrets.md` (новый),
`README.md` (badge).
