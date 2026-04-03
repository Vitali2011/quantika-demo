## QI Checklist

### 1. Spec compliance
- ✅ `app/page.tsx` — есть `ConnectGmailButton`, headline, security disclaimer (`Read-only access... data is deleted after the demo`).
- ✅ `app/processing/page.tsx` — есть `ProgressProcessing`.
- ✅ `components/progress-processing.tsx` — есть 4 шага pipeline: Gmail fetch → classify → parse-request → recap.
- ✅ `components/progress-processing.tsx` — при успехе есть redirect на `/dashboard`.
- ✅ `components/progress-processing.tsx` — есть базовый error handling: step status=`error`, показ текста ошибки и ссылка `Try again`.
- ✅ `app/dashboard/page.tsx` — есть 5 категорий: `RATE_REQUEST`, `CLIENT_REPLY`, `DOCUMENT`, `CARRIER_UPDATE`, `OTHER`.
- ✅ `app/dashboard/page.tsx` — есть alert по unanswered rate requests >24h.
- ✅ `app/dashboard/page.tsx` — есть список rate requests.
- ⚠️ `app/dashboard/page.tsx` — список negotiations есть, но только если `recaps.length > 0`; empty state для отсутствия recaps не реализован.
- ✅ `app/dashboard/page.tsx` — есть кнопка Summary (`View Summary & Impact`).
- ✅ `app/request/[id]/page.tsx` — есть original email.
- ✅ `app/request/[id]/page.tsx` — есть AI fields при наличии `parsed`.
- ✅ `app/request/[id]/page.tsx` — есть блок missing info.
- ✅ `app/request/[id]/page.tsx` — есть Draft/Copy UX через `DraftQuoteCard`.
- ✅ `app/recap/[id]/page.tsx` — 3 секции `AGREED` / `PENDING` / `DISAGREED` реализованы через `statuses.map(...)`.
- ✅ `app/recap/[id]/page.tsx` — есть follow-up кнопка через `RecapActions`.
- ✅ `app/summary/page.tsx` — есть метрики.
- ✅ `app/summary/page.tsx` — формула lost revenue есть: `unanswered * REVENUE_PER_UNANSWERED/HIGH`.
- ✅ `app/summary/page.tsx` — формула hours saved есть: `rate requests * 15m + recaps * 30m`.
- ✅ `app/summary/page.tsx` — есть CTA.
- ✅ `app/summary/page.tsx` — есть security note.

### 2. Security check
- ✅ `app/api/auth/google/route.ts` — cookie выставляется с `httpOnly: true`.
- ✅ `app/api/auth/google/route.ts` — успешный redirect идёт на `/processing`.
- ✅ `app/api/auth/google/route.ts` — `?error=` обрабатывается и переводится в `/?error=access_denied`.
- ✅ `lib/session.ts` — TTL cleanup есть через `setTimeout(...sessions.delete...)`.
- ✅ `lib/session.ts` — lazy expiration есть в `getSession()`.
- ✅ `lib/google.ts` — `refresh_token` не сохраняется; используется `access_type: 'online'`, возвращается только `access_token`.
- ❌ `lib/constants.ts` — есть hardcoded default API key-like значение: `CLIPROXY_API_KEY || 'cliproxy-key-1'`. Для demo это может работать, но это всё равно вшитый credential fallback.
- ⚠️ `app/summary/page.tsx` + `lib/session.ts` — security claim «Your email data has been deleted from our servers» не соответствует фактической логике: данные живут в памяти до 1 часа TTL и не удаляются немедленно при открытии Summary.

### 3. Edge cases
- ✅ `app/dashboard/page.tsx` — если нет rate requests, показан empty state: `No rate requests found.`
- ❌ `app/dashboard/page.tsx` — если нет recaps, секция просто исчезает; нет empty state / explanatory message.
- ✅ `components/progress-processing.tsx` — если шаг pipeline падает, ошибка останавливает дальнейшие шаги, показывает сообщение и `Try again`.
- ⚠️ `components/progress-processing.tsx` — retry только через полный возврат на `/`; нет retry current pipeline step, но базовый fail-safe есть.
- ⚠️ `app/request/[id]/page.tsx` — если `parsedRequest` не найден, страница не падает, но явного пользовательского сообщения нет.
- ❌ `components/request/draft-quote-card.tsx` — при 404/500 от `/api/ai/draft-quote` или `/api/ai/draft-reply` нет проверки `res.ok` и нет UI ошибки; пользователь просто ничего не увидит.
- ✅ `app/recap/[id]/page.tsx` — если recap не найден, вызывается `notFound()`.

### 4. Code quality
- ❌ В production-коде есть `console.error`:
  - `app/api/auth/google/route.ts`
  - `app/api/emails/fetch/route.ts`
  - `lib/openai.ts`
- ✅ Импорты в проверенных файлах используют корректные alias-пути `@/...`.
- ✅ Структура TypeScript типов в просмотренных файлах выглядит согласованной.
- ⚠️ Полноценный `tsc`/build verification не выполнен из-за отсутствия доступного exec approval-клиента в текущей сессии.

### 5. Build check
- ⚠️ Не удалось выполнить:
  ```bash
  cd /root/.openclaw/workspace-dev-coach/projects/quantika-demo
  npm run build 2>&1 | tail -10
  ```
  Причина: exec требует approval, но interactive approval client в этой subagent-сессии недоступен.

## Issues Found

1. **`lib/constants.ts` (строки с `CLIPROXY_API_KEY`)**
   - Проблема: hardcoded fallback `cliproxy-key-1` выглядит как встроенный credential default.
   - Риск: небезопасная конфигурация по умолчанию, ложное ощущение, что секрет задан корректно.
   - Fix: убрать fallback и падать с явной ошибкой/validation при отсутствии `process.env.CLIPROXY_API_KEY`.

2. **`app/summary/page.tsx` (security note) + `lib/session.ts`**
   - Проблема: UI утверждает «Your email data has been deleted from our servers», но реальная логика хранит session в памяти до 1 часа.
   - Риск: security/compliance mismatch, вводящее в заблуждение заявление для пользователя.
   - Fix: либо реально вызывать `deleteSession(sessionId)` при завершении demo / входе на Summary, либо изменить текст на честный (`will be deleted automatically within 1 hour` / similar).

3. **`app/dashboard/page.tsx` (Negotiations section)**
   - Проблема: при `recaps.length === 0` секция пропадает полностью.
   - Риск: edge case не покрыт, интерфейс выглядит незавершённым.
   - Fix: всегда рендерить карточку Negotiations и показывать empty state (`No active negotiations found.`).

4. **`components/request/draft-quote-card.tsx` (оба fetch action handlers)**
   - Проблема: `generateQuote()` и `generateReply()` не проверяют `res.ok` и не показывают ошибку пользователю.
   - Риск: silent failure при 404/500, особенно когда `parsedRequest` отсутствует.
   - Fix: добавить `if (!res.ok) throw new Error(data.error || '...')`, хранить `error` state, рендерить alert/toast.

5. **`app/request/[id]/page.tsx`**
   - Проблема: если `parsedRequest` не найден, нет явного explanatory fallback в UI.
   - Риск: страница частично пустая, Draft actions могут вести к silent failure.
   - Fix: показать Alert (`AI analysis not available for this request`) и/или скрывать `DraftQuoteCard`, если `parsed` отсутствует.

6. **`app/api/auth/google/route.ts`, `app/api/emails/fetch/route.ts`, `lib/openai.ts`**
   - Проблема: `console.error` остаётся в production code.
   - Риск: шумные логи, потенциальная утечка runtime details в hosted logs.
   - Fix: заменить на structured logger с sanitization или убрать noisy logging для demo.

7. **Build verification blocked**
   - Проблема: сборка не подтверждена в рамках QI.
   - Риск: нельзя дать полный PASS без фактического `npm run build`.
   - Fix: прогнать build в approve-enabled сессии и приложить tail output.

## Verdict
FAIL — обнаружены issues:
- hardcoded credential fallback в `lib/constants.ts`
- ложный security claim о немедленном удалении данных в `app/summary/page.tsx`
- отсутствует empty state для recaps в `app/dashboard/page.tsx`
- silent failure в `components/request/draft-quote-card.tsx`
- нет явного fallback UI при отсутствии `parsedRequest` в `app/request/[id]/page.tsx`
- `console.error` в production code
- build check не подтверждён из-за недоступного exec approval
