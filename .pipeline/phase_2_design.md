# Phase 2: Design Document

## Target Architecture

- **OAuth flow:** Пользователь нажимает "Connect Gmail" на главной странице. Ссылка ведёт на `GET /api/auth/google`. Если параметра `code` нет, сервер генерирует Google OAuth URL и редиректит туда пользователя. После выдачи прав (consent), Google возвращает пользователя на `/api/auth/google?code=...`. Сервер обменивает код на `accessToken`, создаёт новую сессию, генерирует `sessionId`, устанавливает его в HTTP-only cookie и редиректит на `/processing`.
- **Session store:** In-memory хранилище (глобальный `Map<string, SessionData>`). При создании сессии записывается время создания. TTL = 1 час. Очистка реализуется через `setTimeout` при создании сессии и ленивую проверку при чтении (lazy expiration).
- **Processing flow:** Управляется на клиенте на странице `/processing` (CSR orchestrator). Компонент последовательно вызывает REST API-эндпоинты: `fetch` -> `classify` -> `parse-request` -> `recap`. Ожидание ответа каждого запроса обновляет UI (progress bar, status text). После успеха последнего шага происходит редирект на `/dashboard`.
- **How pages get data:** Гибридная модель. Страницы (`/dashboard`, `/request/[id]`, `/recap/[id]`) реализованы как React Server Components (SSR). Они читают `sessionId` из HTTP-only cookie, напрямую обращаются к in-memory session store на сервере для получения данных сессии и рендерят HTML. Интерактивные элементы (клиентские компоненты) получают данные через props.
- **AI calls organization:** AI-вызовы изолированы на сервере внутри API routes (`/api/ai/*`). Прямых вызовов с клиента к ClipProxy нет. API routes формируют промпты, обращаются к ClipProxy по локальному адресу `http://localhost:8317/v1` и парсят ответы.

## Data Flow Diagrams (text)

**1. OAuth flow:**
```text
[Client] -> GET /api/auth/google
[Server] -> Redirect to accounts.google.com
[Google] -> User consents -> Redirect to /api/auth/google?code=XYZ
[Server] -> Exchange code for token
[Server] -> Generate sessionId -> Store in Map -> Set HTTP-only Cookie
[Server] -> Redirect to /processing
```

**2. Processing flow (email fetch → AI → dashboard):**
```text
[Client (/processing)] -> POST /api/emails/fetch
[Server] -> Gmail API (messages.list & messages.get) -> Update Session -> Returns 200 OK

[Client] -> POST /api/ai/classify
[Server] -> ClipProxy (gpt-5.4) -> Batch classification -> Update Session -> Returns 200 OK

[Client] -> POST /api/ai/parse-request
[Server] -> ClipProxy (gpt-5.3-codex) -> Parse RATE_REQUESTs -> Update Session -> Returns 200 OK

[Client] -> POST /api/ai/recap
[Server] -> ClipProxy (gpt-5.4) -> Recap threads (5+ emails) -> Update Session -> Returns 200 OK

[Client] -> Redirect to /dashboard
```

**3. Session lifecycle:**
```text
[Creation]  /api/auth/google callback -> Insert into Map + Set HTTP-only Cookie -> Schedule setTimeout (1h)
[Usage]     SSR Pages & API Routes -> Read Cookie -> Lookup Map -> Return Data / Process
[Expiry]    1 Hour passes -> setTimeout fires -> Delete from Map
[Cleanup]   User clicks Logout -> DELETE /api/session -> Delete from Map -> Clear Cookie
```

## Boundaries

### Can Change (in scope):
Создание и изменение структуры Next.js 14 приложения в `projects/quantika-demo/`:
- **Config & Setup:** `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `.env.local`
- **Pages (App Router):** `app/page.tsx`, `app/layout.tsx`, `app/processing/page.tsx`, `app/dashboard/page.tsx`, `app/request/[id]/page.tsx`, `app/recap/[id]/page.tsx`, `app/globals.css`
- **API Routes:** `app/api/auth/google/route.ts`, `app/api/emails/fetch/route.ts`, `app/api/ai/classify/route.ts`, `app/api/ai/parse-request/route.ts`, `app/api/ai/recap/route.ts`, `app/api/ai/draft-quote/route.ts`, `app/api/ai/draft-reply/route.ts`, `app/api/session/route.ts`
- **Libs:** `lib/session.ts`, `lib/google.ts`, `lib/openai.ts`, `lib/prompts.ts`, `lib/types.ts`, `lib/utils.ts`
- **Components:** `components/ui/*` (shadcn), `components/dashboard/*`, `components/request/*`, `components/recap/*`
- **Pipeline:** `.pipeline/phase_2_design.md`

### Cannot Change (out of scope):
- Системные конфиги сервера и PM2 до фазы Deploy (включая `/etc/caddy/Caddyfile`).
- Другие проекты и папки в рабочей директории (например, `projects/quantika-site-v6`).
- Порты других сервисов (3001, 8317). Порт приложения фиксирован: 3000.
- Не использовать `next-auth` (строго custom OAuth).

## Approach

- **UI Components:** Использование shadcn/ui. Ключевые компоненты: `Card`, `Button`, `Badge` (для статусов и категорий), `Progress` (для экрана процессинга), `Skeleton` (для loading state), `Alert` (для ошибок и unanswered alerts), `Table` (для списков).
- **Polling/Progress:** Экран `/processing` реализован как клиентский компонент. Он содержит React state с текущим шагом и массивом выполненных шагов. Использует `useEffect` для запуска цепочки промисов: `fetch() -> classify() -> parse() -> recap()`. В случае ошибки выполнение останавливается, показывается сообщение с кнопкой Retry.
- **SessionId Storage:** Хранение строго в `HTTP-only` cookie. Это решает проблемы XSS и позволяет React Server Components (RSC) легко считывать сессию на сервере перед рендером страницы, избавляя от лишних загрузочных состояний на клиенте.
- **Error Handling Strategy:** 
  - На сервере (API): обертка `try/catch`, при ошибке возврат `{ error: string, details?: any }` и статуса 500/400.
  - На клиенте: перехват fetch-ошибок, отображение `Alert` компонента с текстом ошибки и предложением повторить действие.
  - В Server Components: если сессии нет или она протухла, редирект на `/` (landing).
- **TypeScript Strictness:** Strict mode `true`. Чёткая типизация `SessionData`, AI JSON-ответов и доменных интерфейсов (из спека). Приведение типов ответов от ClipProxy через Zod или явный type assertion.

## Risk Assessment

- **Главные технические риски:**
  - **In-memory session loss:** При перезапуске процесса (PM2 restart) все текущие сессии пользователей пропадут. Это допустимо для демо, но требует явного понимания.
  - **AI JSON Parsing:** Модели (`gpt-5.3-codex`, `gpt-5.4`) могут вернуть невалидный JSON, несмотря на промпты. Нужно предусмотреть fallback или безопасный парсинг `try/catch`.
- **Edge cases:**
  - Пустой Inbox пользователя или отсутствие писем в нужных категориях.
  - Письма огромного размера (могут привести к отказу ClipProxy из-за лимита токенов контекста). Ограничим длину body/snippet.
  - Истечение 1-часового TTL сессии прямо во время запроса пользователя.
- **Что может сломаться на каждом этапе:**
  - **OAuth:** Пользователь может нажать "Отмена" на экране согласия Google (надо обработать отсутствие `code`).
  - **Fetch:** Gmail API rate limits (HTTP 429), если тестировать слишком активно.
  - **Processing:** Тайм-аут API route в Next.js (по умолчанию 15 секунд), если AI будет долго отвечать на batch classification. *Mitigation:* увеличить `maxDuration` для AI роутов.
