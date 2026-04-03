## Spec Summary

- **Продукт:** demo-приложение Quantika для freight forwarders, где пользователь подключает Gmail и видит AI-обработку реальных писем как продающую демонстрацию сервиса.
- **Домен:** `demo.quantika.org`.
- **Frontend:** Next.js 14 с App Router, Tailwind CSS, shadcn/ui.
- **Backend:** Next.js API Routes внутри того же приложения.
- **AI layer:** ClipProxy по OpenAI-compatible API на `http://localhost:8317/v1` с ключом `cliproxy-key-1`; целевые модели по спеку: `gpt-5.4` для тяжёлых задач и `codex-5.3` для лёгких.
- **Auth:** Google OAuth 2.0 с доступом `gmail.readonly`.
- **Email ingestion:** Gmail API (`messages.list`, `messages.get`), нужно забирать до 50 писем.
- **State model:** без БД; состояние сессии хранится только server-side / in-memory per session. Это упрощает MVP, но требует аккуратного дизайна session lifecycle и cleanup.
- **Хостинг:** VPS, reverse proxy через Caddy, SSL автоматически, process manager — PM2.
- **UI flow:** 6 экранов: landing → processing → dashboard → rate request detail → negotiation recap → summary + CTA.
- **API contract:** 8 endpoints для OAuth callback, получения email, AI-классификации, парсинга rate request, recap, quote draft, reply draft и cleanup сессии.
- **Библиотеки:** `openai`, `googleapis`, `shadcn/ui`, плюс решение для auth: `next-auth` или кастомный OAuth.
- **Deploy constraints:** порт `3001` уже занят другим сервисом, приложение должно слушать `3000`; Caddy должен проксировать `demo.quantika.org` на `localhost:3000`.
- **Google OAuth setup:** нужно создать Google Cloud project, включить Gmail API, настроить consent screen и redirect URI `https://demo.quantika.org/api/auth/google`.

## Environment Check

### Node / npm
- `node --version` → `v22.22.0`
- `npm --version` → `10.9.4`
- Версии совпадают со спеком deploy environment.

### ClipProxy
- Проверка без ключа вернула `{"error":"Missing API key"}` — сервис отвечает и требует авторизацию.
- Проверка с `Authorization: Bearer cliproxy-key-1` успешна.
- `GET http://localhost:8317/v1/models` вернул список моделей, среди них есть:
  - `gpt-5.4`
  - `gpt-5.3-codex-spark`
  - другие модели OpenAI/Google
- Вывод: ClipProxy доступен и рабочий, но **точного id `codex-5.3` в ответе нет**. По факту доступна близкая модель `gpt-5.3-codex-spark`. Это нужно уточнить до implementation, чтобы не зашить неверное имя модели.

### Project directory
- `/root/.openclaw/workspace-dev-coach/projects/quantika-demo` существует.
- Содержимое сейчас:
  - `.pipeline/`
- Вывод: проект по сути пустой, можно создавать с нуля.

### Caddy config
Текущий `/etc/caddy/Caddyfile`:
```caddy
api.quantika.org {
    reverse_proxy localhost:3001
}
```
- Для `demo.quantika.org` конфигурации пока нет.
- Значит, deploy потребует добавления нового site block под demo-домен.

### Ports
Результат `ss -tlnp | grep -E '3000|3001|8317'`:
- `*:8317` — занят процессом `cli-proxy-api`
- `*:3001` — занят процессом `node`
- `3000` в списке отсутствует
- Вывод: `3000` свободен и подходит для нового приложения, `3001` действительно уже занят, `8317` поднят как ClipProxy.

### PM2
- `which pm2 || npm list -g pm2` не нашёл установленный PM2.
- Глобальный npm список пустой по `pm2`.
- Вывод: PM2 нужно установить перед deploy/runbook этапом.

## Affected Files (to create)

Ниже — полный целевой набор файлов для MVP по спеку. Это не только минимальная структура из спека, но и практический набор для рабочего Next.js 14 проекта.

### Root / config
- `package.json` — зависимости, scripts (`dev`, `build`, `start`, `lint`).
- `package-lock.json` — lockfile после установки зависимостей.
- `next.config.js` или `next.config.mjs` — конфиг Next.js.
- `tsconfig.json` — TypeScript конфиг.
- `postcss.config.js` — PostCSS для Tailwind.
- `tailwind.config.ts` — конфиг Tailwind.
- `components.json` — конфиг shadcn/ui.
- `.gitignore` — исключения (`node_modules`, `.next`, `.env*`).
- `.env.local.example` — шаблон env для разработки.
- `.env.local` — реальные локальные переменные окружения.
- `README.md` — запуск, env, OAuth setup, deploy steps.
- `middleware.ts` — опционально, если будет нужна защита routes / redirect based on session.

### App Router pages and layout
- `app/layout.tsx` — корневой layout, глобальные стили, providers.
- `app/page.tsx` — landing page с CTA “Connect Gmail”.
- `app/processing/page.tsx` — экран прогресса обработки.
- `app/dashboard/page.tsx` — dashboard с категориями email, alerts и списками.
- `app/request/[id]/page.tsx` — detail page по rate request.
- `app/recap/[id]/page.tsx` — negotiation recap page.
- `app/summary/page.tsx` — итоговый summary + CTA.
- `app/globals.css` — Tailwind base/components/utilities и глобальные стили.
- `app/favicon.ico` или `app/icon.png` — favicon.

### API routes
- `app/api/auth/google/route.ts` — OAuth entry/callback handler; нужно определить, будет ли один route делать и redirect start, и callback, либо потребуются query-mode ветки.
- `app/api/emails/fetch/route.ts` — чтение 50 Gmail messages.
- `app/api/ai/classify/route.ts` — batch classification писем по 5 категориям.
- `app/api/ai/parse-request/route.ts` — извлечение structured rate request data.
- `app/api/ai/recap/route.ts` — recap negotiation chain.
- `app/api/ai/draft-quote/route.ts` — генерация draft quote.
- `app/api/ai/draft-reply/route.ts` — генерация follow-up reply.
- `app/api/session/route.ts` — cleanup/teardown session state.

### Shared libraries
- `lib/openai.ts` — клиент OpenAI SDK, направленный на ClipProxy baseURL.
- `lib/gmail.ts` — OAuth token handling + Gmail API helpers.
- `lib/session.ts` — in-memory session store, CRUD, TTL/cleanup helpers.
- `lib/types.ts` — общие типы доменных сущностей: email, category, request, recap, quote.
- `lib/prompts.ts` — prompts/system instructions для classification, parse, recap, draft generation.
- `lib/constants.ts` — лимиты, категории, default models, route constants.
- `lib/utils.ts` — общие utility helpers (`cn`, formatters, parsers).
- `lib/auth.ts` — если auth logic будет вынесена отдельно от gmail helpers.
- `lib/serializers.ts` — опционально для нормализации Gmail payload → app domain objects.
- `lib/validators.ts` — zod-схемы для API input/output.

### Components
- `components/providers.tsx` — client-side providers.
- `components/connect-gmail-button.tsx` — CTA кнопка авторизации.
- `components/progress-processing.tsx` — progress bar / staged processing UI.
- `components/dashboard/category-column.tsx` — колонка/блок категории.
- `components/dashboard/email-list.tsx` — список писем.
- `components/dashboard/alert-card.tsx` — alert/insight карточки.
- `components/request/request-header.tsx` — шапка detail request.
- `components/request/request-analysis.tsx` — structured AI analysis.
- `components/request/draft-quote-card.tsx` — draft quote UI.
- `components/recap/recap-section.tsx` — agreed/pending/disagreed block.
- `components/summary/metric-card.tsx` — summary metric card.
- `components/summary/book-call-cta.tsx` — CTA секция.
- `components/ui/*` — shadcn/ui primitives (button, card, badge, progress, table, separator, tabs, sheet, skeleton и т.д.).

### Public assets
- `public/logo.svg` — Quantika logo asset.
- `public/og-image.png` — social preview image.
- `public/illustrations/*` — optional UI illustrations for landing/processing.

### Operational / deploy files
- `.pipeline/phase_1_research.md` — текущий research artifact.
- `.pipeline/phase_2_design.md` — следующий artifact.
- `.pipeline/phase_3_plan.md` — следующий artifact.
- `ecosystem.config.js` — PM2 app config для `next start -p 3000` или standalone режима.
- `scripts/deploy.sh` — опционально, если нужен repeatable deploy script.
- `scripts/setup.sh` — опционально для bootstrap сервера/проекта.
- `docs/google-oauth-setup.md` — пошаговая настройка Google Cloud Console.
- `docs/deploy.md` — Caddy + PM2 + env + restart инструкция.

## Independent Zones

Это зоны, которые после design/planning можно делать параллельно без сильной конкуренции:

- **UI pages:** landing, processing, dashboard, request detail, recap, summary — если заранее согласован общий layout и shared types.
- **UI primitives / shadcn integration:** базовые `components/ui/*` и визуальные reusable components.
- **AI layer:** `lib/openai.ts`, `lib/prompts.ts`, API routes `classify`, `parse-request`, `recap`, `draft-quote`, `draft-reply`.
- **Gmail integration:** `lib/gmail.ts` и `app/api/emails/fetch/route.ts`.
- **Session layer:** `lib/session.ts` при условии заранее определённого session schema.
- **Docs/ops artifacts:** README, deploy docs, Google OAuth setup docs, PM2 ecosystem config.
- **Styling pass:** globals, theme tokens, responsive polish после базового layout контракта.

## Conflict Zones

Это зоны, где параллельная работа без жёстких контрактов почти гарантированно вызовет конфликты:

- `lib/types.ts` — общий доменный контракт для всех страниц и API.
- `lib/session.ts` — единый store/session shape, затрагивает auth, fetch, AI routes и page loading.
- `lib/prompts.ts` — если несколько людей одновременно меняют prompt interfaces и output schemas.
- `app/layout.tsx` / `app/globals.css` — центральные точки UI и theme setup.
- `package.json` / `package-lock.json` — зависимости и scripts.
- `app/api/auth/google/route.ts` — самый чувствительный узел: зависит от выбранной auth-архитектуры.
- `lib/gmail.ts` + auth/token storage logic — тесно связано с callback flow и session model.
- `dashboard` и detail pages, если они делят одни и те же selectors / loaders / data contracts, а типы ещё плавают.
- Любой выбор между `next-auth` и кастомным OAuth — это архитектурная развилка, её нельзя разрабатывать параллельно в двух несовместимых вариантах без явного решения.

## External Blockers

- **Google Cloud project ещё не создан.** Нужны client ID, client secret и consent screen.
- **Нужно включить Gmail API** в Google Cloud Console.
- **Redirect URI зависит от боевого домена:** `https://demo.quantika.org/api/auth/google` должен быть добавлен в OAuth client config.
- **Нужно проверить DNS для `demo.quantika.org`.** В спеке домен задан, но фактическая A/AAAA настройка не проверялась.
- **Нужно добавить `demo.quantika.org` в `/etc/caddy/Caddyfile`** и перезагрузить Caddy на этапе deploy.
- **PM2 не установлен.** Без него deploy target по спеку не завершён.
- **Нужно подтвердить модель для “лёгких” задач.** В ClipProxy доступен `gpt-5.3-codex-spark`, а не буквальный `codex-5.3`.
- **shadcn/ui bootstrap** потребует инициализации зависимостей и, возможно, выбора design tokens.
- **Без БД** все session data будут теряться при рестарте процесса; для demo это может быть ок, но это product/deploy risk и его надо явно принять.

## Open Questions

- **Auth architecture:** использовать `next-auth` или кастомный OAuth flow? Спек допускает оба варианта, но implementation сильно отличается.
- **API semantics для `/api/auth/google`:** это только callback endpoint или и старт OAuth тоже должен идти через этот же route?
- **5 категорий email:** в спеке сказано, что dashboard показывает 5 категорий, но сами категории не перечислены. Их нужно определить заранее для classification prompt и UI.
- **Dashboard data model:** какие именно alerts и какие списки должны показываться? Нужны точные критерии и приоритеты.
- **Rate Request Detail:** какой exact structured output нужен от AI? Какие поля обязательны: origin, destination, commodity, incoterms, weight, volume, target price, deadlines и т.д.?
- **Negotiation Recap:** как определяется цепочка negotiation — по thread, sender, subject normalization, message references или простому эвристическому grouping?
- **Summary screen metrics:** какие конкретно метрики показывать — emails processed, time saved, requests detected, quote drafts generated, response opportunities?
- **Session lifetime:** сколько живёт in-memory session, когда и кем вызывается cleanup, нужен ли TTL auto-expiry?
- **Безопасность данных Gmail:** нужно ли явно удалять fetched email bodies из памяти после summary/timeout? Нужны ли redaction/masking правила для PII/sensitive cargo data?
- **SSR vs client fetching:** где будет происходить orchestration processing flow — через client polling, server actions, route handlers, streaming или простые REST calls?
- **Error UX:** что делать при Google auth denial, Gmail API quota issues, пустом inbox, отсутствии rate-request писем, ClipProxy timeout/error?
- **Deploy mode:** обычный `next start` или `output: standalone` для PM2/VPS?
- **Access control:** это полностью открытая demo-ссылка для любого пользователя с Gmail, или нужен allowlist / basic protection?

## Research Conclusion

Техническая база для старта есть: Node/npm соответствуют спеку, ClipProxy доступен, проектная директория подготовлена, порт `3000` свободен. Главные внешние блокеры перед реализацией и deploy: **Google OAuth setup, выбор auth-архитектуры, уточнение 5 email categories и AI output schemas, установка PM2, добавление `demo.quantika.org` в Caddy, подтверждение точного id лёгкой модели ClipProxy**.