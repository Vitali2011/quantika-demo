# Phase 3: Plan Document

## Work Fronts

### Front 1: Foundation
- **Files:**
  - `package.json`
  - `.gitignore`
  - `tsconfig.json`
  - `next.config.mjs`
  - `postcss.config.js`
  - `tailwind.config.ts`
  - `components.json`
  - `.env.local.example`
  - `app/layout.tsx`
  - `app/globals.css`
  - `lib/types.ts`
  - `lib/constants.ts`
  - `lib/utils.ts`
  - `lib/validators.ts`
  - `lib/session.ts`
  - `components/providers.tsx`
  - `components/ui/button.tsx`
  - `components/ui/card.tsx`
  - `components/ui/badge.tsx`
  - `components/ui/progress.tsx`
  - `components/ui/alert.tsx`
  - `components/ui/separator.tsx`
  - `components/ui/skeleton.tsx`
  - `components/ui/table.tsx`
- **Scope:**
  - Поднять базовый Next.js 14 App Router scaffold.
  - Зафиксировать shared domain contract (`lib/types.ts`) для email/session/request/recap/summary.
  - Зафиксировать session lifecycle и cookie-based access (`lib/session.ts`).
  - Поднять глобальный layout, Tailwind, theme tokens и базовые shadcn/ui primitives.
  - Подготовить базовые constants / validators / utilities, чтобы фронты 2–4 работали по одному контракту.
- **Dependencies:** none (первый)
- **Must complete before:** Fronts 2, 3, 4
- **Internal dependency chain:**
  1. `package.json` → install base deps
  2. `tsconfig.json` + `next.config.mjs` + `postcss.config.js` + `tailwind.config.ts` + `components.json` + `.gitignore` + `.env.local.example`
  3. `lib/types.ts` (самый первый shared contract)
  4. `lib/constants.ts` + `lib/utils.ts` + `lib/validators.ts`
  5. `lib/session.ts`
  6. `components/ui/*`
  7. `components/providers.tsx`
  8. `app/globals.css`
  9. `app/layout.tsx`
- **Parallelization inside front:**
  - После готовности `package.json` и базовых config-файлов можно параллелить:
    - `lib/constants.ts` / `lib/utils.ts` / `lib/validators.ts`
    - `components/ui/*` primitives по разным файлам
  - `lib/session.ts` только после `lib/types.ts`.
  - `app/layout.tsx` только после `app/globals.css` и `components/providers.tsx`.

### Front 2: Auth + Gmail
- **Files:**
  - `lib/google.ts`
  - `app/api/auth/google/route.ts`
  - `app/api/emails/fetch/route.ts`
- **Scope:**
  - Реализовать custom Google OAuth flow без `next-auth`.
  - Обменивать `code` на token, создавать session, ставить HTTP-only cookie.
  - Подключить Gmail API и получать до 50 писем в session store.
- **Dependencies:** Front 1
- **Can parallel with:** Front 3
- **Internal dependency chain:**
  1. `lib/google.ts`
  2. `app/api/auth/google/route.ts`
  3. `app/api/emails/fetch/route.ts`
- **Parallelization inside front:**
  - После готовности `lib/google.ts` оба route-файла можно делать почти параллельно,
    но безопаснее последовательно: сначала auth route, потом Gmail fetch route,
    потому что `fetch` зависит от уже определённого формата session/token storage.

### Front 3: AI Layer
- **Files:**
  - `lib/openai.ts`
  - `lib/prompts.ts`
  - `app/api/ai/classify/route.ts`
  - `app/api/ai/parse-request/route.ts`
  - `app/api/ai/recap/route.ts`
  - `app/api/ai/draft-quote/route.ts`
  - `app/api/ai/draft-reply/route.ts`
- **Scope:**
  - Подключить ClipProxy через OpenAI-compatible client.
  - Зафиксировать prompts, output schemas и model selection.
  - Реализовать все AI API routes: classification, parse request, recap, draft quote, draft reply.
- **Dependencies:** Front 1
- **Can parallel with:** Front 2
- **Internal dependency chain:**
  1. `lib/openai.ts`
  2. `lib/prompts.ts`
  3. `app/api/ai/classify/route.ts`
  4. `app/api/ai/parse-request/route.ts`
  5. `app/api/ai/recap/route.ts`
  6. `app/api/ai/draft-quote/route.ts`
  7. `app/api/ai/draft-reply/route.ts`
- **Parallelization inside front:**
  - `lib/openai.ts` и `lib/prompts.ts` — строго сначала.
  - После них можно параллелить route handlers, потому что это разные файлы.
  - Практически лучше разбить так:
    - поток A: `classify` + `parse-request`
    - поток B: `recap` + `draft-quote` + `draft-reply`
  - Общий контракт остаётся в `lib/types.ts` и `lib/validators.ts`, поэтому конфликтов быть не должно.

### Front 4: UI Pages + Components
- **Files:**
  - `app/page.tsx`
  - `app/processing/page.tsx`
  - `app/dashboard/page.tsx`
  - `app/request/[id]/page.tsx`
  - `app/recap/[id]/page.tsx`
  - `app/summary/page.tsx`
  - `components/connect-gmail-button.tsx`
  - `components/progress-processing.tsx`
  - `components/dashboard/category-column.tsx`
  - `components/dashboard/email-list.tsx`
  - `components/dashboard/alert-card.tsx`
  - `components/request/request-header.tsx`
  - `components/request/request-analysis.tsx`
  - `components/request/draft-quote-card.tsx`
  - `components/recap/recap-section.tsx`
  - `components/summary/metric-card.tsx`
  - `components/summary/book-call-cta.tsx`
- **Scope:**
  - Собрать все 6 экранов demo flow.
  - Поднять processing orchestrator UI.
  - Подключить SSR pages к session data и AI output.
  - Собрать reusable feature-components поверх готовых API и shared types.
- **Dependencies:** Fronts 1, 2, 3 (нужны типы и все API)
- **Must be last**
- **Internal dependency chain:**
  1. `components/connect-gmail-button.tsx`
  2. `components/progress-processing.tsx`
  3. `components/dashboard/*`
  4. `components/request/*`
  5. `components/recap/recap-section.tsx`
  6. `components/summary/*`
  7. `app/page.tsx`
  8. `app/processing/page.tsx`
  9. `app/dashboard/page.tsx`
  10. `app/request/[id]/page.tsx`
  11. `app/recap/[id]/page.tsx`
  12. `app/summary/page.tsx`
- **Parallelization inside front:**
  - После готовности shared components можно параллелить feature-компоненты по зонам:
    - dashboard components
    - request components
    - summary components
  - После этого можно параллелить страницы, если они не меняют одни и те же components:
    - `app/page.tsx` + `app/processing/page.tsx`
    - `app/dashboard/page.tsx`
    - `app/request/[id]/page.tsx` + `app/recap/[id]/page.tsx`
    - `app/summary/page.tsx`
  - Но только после завершения API fronts, потому что страницы SSR опираются на итоговый session/data contract.

### Front 5: Config + Deploy Prep
- **Files:**
  - `README.md`
  - `ecosystem.config.js`
  - `scripts/setup.sh`
  - `scripts/deploy.sh`
  - `docs/google-oauth-setup.md`
  - `docs/deploy.md`
  - `ops/Caddyfile.demo.quantika.org`
- **Scope:**
  - Подготовить операционную обвязку под VPS deploy.
  - Описать Google OAuth setup, env contract, PM2 run, Caddy reverse proxy и deploy steps.
  - Не трогать system files напрямую на этой фазе; только подготовить project-owned configs и runbooks.
- **Dependencies:** Front 1 (package.json нужен для всех)
- **Note:** package.json создаётся в Front 1 как часть `npx create-next-app`, здесь только финальные ops конфиги
- **Internal dependency chain:**
  1. `README.md`
  2. `docs/google-oauth-setup.md`
  3. `docs/deploy.md`
  4. `ecosystem.config.js`
  5. `ops/Caddyfile.demo.quantika.org`
  6. `scripts/setup.sh`
  7. `scripts/deploy.sh`
- **Parallelization inside front:**
  - Docs можно делать параллельно с ops config.
  - `scripts/deploy.sh` лучше последним, когда уже зафиксированы `ecosystem.config.js` и Caddy block.

## Overlap Check
Подтверждаю явно: **пересечений по файлам между фронтами нет**.

- Front 1 содержит только foundation/config/shared primitives.
- Front 2 содержит только Google/Gmail integration.
- Front 3 содержит только AI layer.
- Front 4 содержит только UI pages + feature components.
- Front 5 содержит только docs/ops/deploy prep.

Дополнительно:
- `package.json` находится только во Front 1.
- `app/layout.tsx` и `app/globals.css` находятся только во Front 1.
- Все API routes разнесены: Gmail/Auth — только Front 2, AI routes — только Front 3.
- Все feature components и pages — только Front 4.
- Все deploy/docs artifacts — только Front 5.

## Execution Order

### Recommended order
1. **Front 1: Foundation** — строго первым.
2. **Front 2: Auth + Gmail** и **Front 3: AI Layer** — запускать параллельно после завершения Front 1.
3. **Front 5: Config + Deploy Prep** — можно запускать параллельно с Front 2/3 после завершения Front 1.
4. **Front 4: UI Pages + Components** — строго последним, после завершения Front 1, 2, 3.

### Why
- **Front 1** блокирует всё: без `lib/types.ts`, `lib/session.ts`, `app/layout.tsx`, `app/globals.css`, `components/ui/*` остальные фронты будут либо гадать контракт, либо конфликтовать.
- **Front 2** и **Front 3** не пересекаются по файлам и используют общий foundation contract, поэтому безопасны для параллельной работы.
- **Front 5** не зависит от API/UI реализации по файлам; ему нужен только базовый scaffold и package contract из Front 1.
- **Front 4** должен быть последним, потому что:
  - SSR pages читают финальную session schema;
  - processing page вызывает реальные API endpoints;
  - request/recap/summary pages опираются на уже определённый shape AI outputs;
  - иначе UI начнёт формировать собственные контракты и сломает изоляцию фронтов.

### Effective concurrency model
- **Wave 1:** Front 1
- **Wave 2:** Front 2 + Front 3 + Front 5
- **Wave 3:** Front 4

Это максимальная безопасная параллелизация без overlap по файлам и без нарушения dependency chain.

## Subagent Assignments

### Front 1: Foundation
- **Recommended model:** `cliproxy/gpt-5.4`
- **Why:**
  - здесь фиксируется архитектурный контракт всего проекта;
  - ошибки в `lib/types.ts` / `lib/session.ts` / базовом scaffold потянут rework во всех остальных фронтах;
  - нужен сильный системный контроль над dependency graph.

### Front 2: Auth + Gmail
- **Recommended model:** `cliproxy/gpt-5.4`
- **Why:**
  - custom OAuth + cookie session + Gmail API — чувствительная интеграция;
  - высокая цена ошибки в callback flow, token exchange и session creation;
  - нужно аккуратно соблюсти security и edge cases.

### Front 3: AI Layer
- **Recommended model:** `cliproxy/gpt-5.4`
- **Why:**
  - здесь сложная серверная логика: prompts, structured outputs, route handlers, parsing/fallbacks;
  - нужно удержать consistency между несколькими AI endpoints;
  - это core selling logic продукта.

### Front 4: UI Pages + Components
- **Recommended model:** mixed
  - **Core page integration:** `cliproxy/gpt-5.4`
  - **Atomic component implementation:** `cliproxy/codex-5.3`
- **Why:**
  - страницы (`app/*`) требуют понимания data flow, SSR, redirects, orchestration state;
  - отдельные feature-components по готовому spec можно отдавать более дешёвой модели, если оркестратор даст точный file-by-file spec;
  - лучший вариант — разбить Front 4 на несколько узких задач.

### Front 5: Config + Deploy Prep
- **Recommended model:** `cliproxy/codex-5.3`
- **Why:**
  - это mostly deterministic config/docs работа;
  - низкий архитектурный риск;
  - хорошо подходит для более дешёвой модели при чётком списке файлов.

### Allocation summary
- **gpt-5.4:** Fronts 1, 2, 3, page-level часть Front 4
- **codex-5.3:** Front 5, component-level часть Front 4

## Final orchestration note
Если запускать несколько субагентов на implementation phase, оркестратору стоит сохранить именно такую нарезку фронтов и не дробить shared files:
- не выносить `lib/types.ts` из Front 1,
- не смешивать Gmail и AI routes в один implementation batch,
- не отдавать UI pages до завершения всех API fronts,
- не отдавать `package.json`/`layout`/`globals.css` параллельно нескольким исполнителям.

Это даст минимальный риск merge-конфликтов и rework на следующих фазах.
