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

| Route | Описание |
|-------|----------|
| `GET  /api/auth/google` | Инициализация OAuth-флоу |
| `GET  /api/auth/google/callback` | OAuth callback, создание сессии |
| `GET  /api/emails` | Список обработанных писем |
| `POST /api/emails/process` | Запустить обработку входящих |
| `GET  /api/health` | Healthcheck (`{"status":"ok","uptime":...}`) |

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

| Переменная | Обязательна | Описание |
|-----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | required | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | required | Google OAuth 2.0 client secret |
| `CLIPROXY_API_KEY` | required | ClipProxy API key (Claude bridge) |
| `CLIPROXY_BASE_URL` | optional | default: `http://localhost:8317/v1` |
| `AI_MODEL_HEAVY` | optional | Модель для тяжёлых задач (по умолчанию: claude-opus-*) |
| `AI_MODEL_LIGHT` | optional | Модель для лёгких задач (по умолчанию: claude-haiku-*) |
| `NEXT_PUBLIC_APP_URL` | optional | Публичный URL приложения |
| `SENTRY_DSN` | optional | Server-side error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Client-side error tracking |
| `NEXT_PUBLIC_POSTHOG_KEY` | optional | Analytics |
| `SESSIONS_DB_PATH` | optional | Путь к SQLite, default: `./data/sessions.db` |

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

## Deployment

Инструкция по деплою на VPS (PM2 + Caddy): [docs/deploy.md](docs/deploy.md)

Включает: initial deploy, updates, rollback-процедуру, мониторинг, troubleshooting.

## Uptime Monitoring

Health endpoint доступен по двум URL:

- `https://<YOUR_DOMAIN>/api/health`
- `https://<YOUR_DOMAIN>/api/healthcheck`

**Ожидаемый ответ:** HTTP 200 OK, JSON body:
```json
{"status":"ok","sessions":0,"uptime":123,"version":"0.1.0"}
```

Минимальная проверка — поле `"status":"ok"`.

**Рекомендуемый интервал проверки:** 60 секунд.

### Ручная проверка

```bash
curl -s https://<YOUR_DOMAIN>/api/health | python3 -m json.tool
```

### UptimeRobot / BetterUptime

1. Создать монитор типа **HTTP(S)**
2. URL: `https://<YOUR_DOMAIN>/api/health`
3. Интервал: **60 секунд**
4. Keyword check: `"ok"` (поиск в теле ответа)
5. HTTP status: **200**

### ntfy alerting

Для алертов через ntfy задай переменную окружения `NTFY_TOPIC` (см. `.env.local.example`) и настрой curl-хук в UptimeRobot / BetterUptime:

```bash
curl -d "Quantika Demo: health check FAILED — https://<YOUR_DOMAIN>/api/health" \
  ntfy.sh/$NTFY_TOPIC
```

Или cron-скрипт для ручного мониторинга:

```bash
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://<YOUR_DOMAIN>/api/health)
if [ "$STATUS" != "200" ]; then
  curl -d "Quantika DOWN: HTTP $STATUS" ntfy.sh/$NTFY_TOPIC
fi
```
