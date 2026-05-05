# Quantika Demo

[![CI](https://github.com/Vitali2011/quantika-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/Vitali2011/quantika-demo/actions/workflows/ci.yml)

## About

AI-триаж входящих freight-писем. Приложение подключается к Gmail через OAuth, читает входящие письма, классифицирует их (Claude/OpenAI), извлекает данные о грузах и формирует сводки для диспетчеров.

**Стек:** Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Gmail API · ClipProxy (Claude bridge) · SQLite sessions · PM2 + Caddy

## Setup

```bash
git clone https://github.com/Vitali2011/quantika-demo.git
cd quantika-demo
cp .env.local.example .env.local
# Заполнить .env.local (см. раздел Environment Variables)
npm install
npm run dev
```

Приложение будет доступно на [http://localhost:3000](http://localhost:3000).

## Architecture

Pipeline обработки письма:

```
Email (Gmail API)
  → classify    — определить тип письма (quote request / booking / tracking / other)
  → parse       — извлечь структурированные данные (origin, destination, cargo, weight)
  → match       — сопоставить с существующими сессиями
  → recap       — сформировать краткую сводку для диспетчера
```

| Route                            | Описание                                     |
| -------------------------------- | -------------------------------------------- |
| `GET  /api/auth/google`          | Инициализация OAuth-флоу                     |
| `GET  /api/auth/google/callback` | OAuth callback, создание сессии              |
| `GET  /api/emails`               | Список обработанных писем                    |
| `POST /api/emails/process`       | Запустить обработку входящих                 |
| `GET  /api/health`               | Healthcheck (`{"status":"ok","uptime":...}`) |

## Testing

```bash
npm test
```

Jest · 122 теста · покрытие: classify, parse, match, recap, API routes.

## Local Development

```bash
npm run dev
```

Или с Docker:

```bash
docker compose up
```

Hot-reload активен. Изменения в `app/` и `lib/` применяются без перезапуска.

## Environment Variables

Скопируй `.env.local.example` → `.env.local` и заполни:

| Переменная                | Обязательна | Описание                                                |
| ------------------------- | ----------- | ------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`        | required    | Google OAuth 2.0 client ID                              |
| `GOOGLE_CLIENT_SECRET`    | required    | Google OAuth 2.0 client secret                          |
| `CLIPROXY_API_KEY`        | required    | ClipProxy API key (Claude bridge)                       |
| `CLIPROXY_BASE_URL`       | optional    | default: `http://localhost:8317/v1`                     |
| `AI_MODEL_HEAVY`          | optional    | Модель для тяжёлых задач (по умолчанию: claude-opus-\*) |
| `AI_MODEL_LIGHT`          | optional    | Модель для лёгких задач (по умолчанию: claude-haiku-\*) |
| `NEXT_PUBLIC_APP_URL`     | optional    | Публичный URL приложения                                |
| `SENTRY_DSN`              | optional    | Server-side error tracking                              |
| `NEXT_PUBLIC_SENTRY_DSN`  | optional    | Client-side error tracking                              |
| `NEXT_PUBLIC_POSTHOG_KEY` | optional    | Analytics                                               |
| `SESSIONS_DB_PATH`        | optional    | Путь к SQLite, default: `./data/sessions.db`            |

## Docker

```bash
docker compose up --build
```

Поднимает приложение на порту 3000. Для production используй PM2 (см. Deployment).

## Docker

**Production build:**

```bash
docker build -t quantika-demo .
docker run -p 3000:3000 --env-file .env.local quantika-demo
```

**Local dev (hot-reload):**

```bash
docker compose up
```

## Deploy

На VPS:

```bash
bash scripts/deploy-vps.sh
```

Скрипт делает: self-update deploy assets → git pull → npm ci → build (4GB heap) → install Caddy config → seed port-DA → pm2 reload → health check. Idempotent — повторный запуск безопасен.

### First-time bootstrap

Если на VPS ещё нет актуального `scripts/deploy-vps.sh`, забери его из origin одной командой и запусти:

```bash
ssh root@VPS 'cd /root/quantika-demo && git fetch origin main && git checkout origin/main -- scripts/deploy-vps.sh ops/caddy/install-caddy-config.sh ops/caddy/Caddyfile.demo && bash scripts/deploy-vps.sh'
```

Дальше скрипт сам подтягивает свежую версию себя и Caddy-конфигов из `origin/main` перед каждым деплоем.

## AI Provider Switching

Начиная с Wave γ, все AI-вызовы идут через единый шим `lib/ai-provider.ts`, который поддерживает три провайдера:

| Provider  | Что это                              | Когда использовать                 |
| --------- | ------------------------------------ | ---------------------------------- |
| `openai`  | OpenAI GPT через ClipProxy (default) | Стандартный путь, нет зависимостей |
| `gemini`  | Google Gemini через Vertex AI        | Лёгкие/средние задачи, дешевле     |
| `bedrock` | Anthropic Claude через AWS Bedrock   | Match endpoint, Opus 4.7           |

### Routing

Приоритет роутинга (от высокого к низкому):

1. **Per-scope override** — `<SCOPE>_PROVIDER=bedrock` (например: `MATCH_PROVIDER=bedrock`)
2. **Global fallback** — `AI_PROVIDER=gemini`
3. **Default** — `openai` (если ничего не задано)

Примеры в `.env.local`:

```bash
AI_PROVIDER=openai            # глобальный провайдер по умолчанию
MATCH_PROVIDER=bedrock        # только match → Bedrock
CLASSIFY_PROVIDER=gemini      # только classify → Gemini
```

### Настройка Gemini (Vertex AI)

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/quantika-vertex-ai.json
GOOGLE_CLOUD_PROJECT=quantika-demo-2026
GOOGLE_CLOUD_LOCATION=us-central1
AI_MODEL_GEMINI_DEFAULT=gemini-2.5-flash
```

### Настройка AWS Bedrock

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
BEDROCK_MODEL_ID=us.anthropic.claude-opus-4-7-20260415-v1:0
```

### Emergency Rollback на OpenAI

Если Gemini или Bedrock дают ошибки в production:

```bash
cp .env.gpt-fallback.example .env.local
pm2 restart quantika-demo
```

Файл `.env.gpt-fallback.example` форсирует `openai` для всех scopes. Не содержит секретов — можно коммитить.

### Audit Logging

Все AI-вызовы пишут запись в таблицу `ai_audit` (SQLite). Поля: `scope`, `provider`, `model`, `latency_ms`, `ok`, `err`. Полезно для дебага и мониторинга стоимости.

## Deployment

Инструкция по деплою на VPS (PM2 + Caddy): [docs/deploy.md](docs/deploy.md)

Включает: initial deploy, updates, rollback-процедуру, мониторинг, troubleshooting.
