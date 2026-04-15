item: 13
title: Sentry интеграция (только если задан `SENTRY_DSN` env, иначе no-op)
files:
  - sentry.client.config.ts
  - sentry.server.config.ts
  - sentry.edge.config.ts
  - instrumentation.ts
  - next.config.mjs
  - .env.local.example
  - package.json
est_lines: 110
complexity: small
notes:
  - Все три Sentry-конфига (client/server/edge) инициализируются только при наличии SENTRY_DSN — иначе early-return, no-op
  - next.config.mjs нужно обернуть withSentryConfig(); ignoreBuildErrors уже стоит true — не ломает сборку
  - instrumentation.ts — новый файл Next.js 14 hook; register() вызывает Sentry.init условно
  - package.json: добавить @sentry/nextjs как prod-зависимость
  - .env.local.example: добавить SENTRY_DSN= строку для документирования
  - Нет существующих Sentry-файлов — интеграция полностью новая
