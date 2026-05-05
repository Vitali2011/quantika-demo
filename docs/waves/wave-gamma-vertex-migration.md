# Wave γ — Vertex AI / Gemini Migration (with GPT-5.5 rollback)

> **Цель волны:** перевести 11 AI-endpoints Quantika на Google Vertex AI / Gemini, используя GenAI App Builder credit ($900 / zł3,713, действителен до 15 апреля 2027), при этом сохранив возможность мгновенного отката на текущий GPT-5.5 стек через ClipProxy.
>
> **Baseline:** main @ <последний green> · ClipProxy upstream OpenAI · 11 AI endpoints · ~115k токенов/сессия
>
> **Кредит и проект GCP:**
>
> - Project ID: `quantika-demo-2026`
> - Service account: `quantika-vertex-ai@quantika-demo-2026.iam.gserviceaccount.com` (role: Vertex AI User)
> - Service account key: `~/.config/gcp/quantika-vertex-ai.json` (chmod 600, не коммитить)
> - Billing account: `016AA1-656306-DC8CBC` (My Billing Account)
> - Budget alert: zł100/мес (после вычета кредитов)
> - Billing order: Free Trial → GenAI App Builder → карта (защищена alert'ом)
>
> **Хард-требование:** в любой момент должна быть возможность откатиться на GPT-5.5 одной правкой в `.env` без передеплоя кода.

---

## 1. Принцип "rollback by env" — архитектурное требование

### 1.1. Что **запрещено** в этой волне

- **Запрещено** зашивать строку `"gemini-2.5-flash"` в коде. Все имена моделей — только из env vars.
- **Запрещено** убирать существующий OpenAI-совместимый код-путь (через `lib/openai.ts` → ClipProxy). Этот путь должен продолжать работать.
- **Запрещено** делать "только Gemini" без альтернативы — каждая фича должна иметь два режима: `provider=openai` и `provider=gemini`.

### 1.2. Что **обязательно**

Двухуровневый switching:

**Уровень 1 — глобальный fallback (мастер-выключатель):**

```bash
AI_PROVIDER=gemini   # gemini | openai (default: openai для безопасности)
```

Если `AI_PROVIDER=openai` — все endpoint'ы идут через ClipProxy на gpt-5.5, как сейчас. Один env, один redeploy (или hot-reload), всё откатывается.

**Уровень 2 — пер-endpoint override (тонкая настройка для A/B):**

```bash
# Можно тестировать gemini только на parse-cargo, остальное на gpt-5.5:
AI_PROVIDER=openai
PARSE_CARGO_PROVIDER=gemini
PARSE_CARGO_MODEL=gemini-2.5-flash

# Или весь стек на gemini, кроме самого критичного match:
AI_PROVIDER=gemini
MATCH_PROVIDER=openai
```

**Готовый rollback-пресет** (хранится в репо как `.env.gpt-fallback.example`):

```bash
# Применить при подозрении на регрессию: cp .env.gpt-fallback.example .env.local
AI_PROVIDER=openai
CLASSIFY_PROVIDER=openai
PARSE_CARGO_PROVIDER=openai
PARSE_VESSEL_PROVIDER=openai
PARSE_RECAP_PROVIDER=openai
RECAP_PROVIDER=openai
MATCH_PROVIDER=openai
DRAFT_QUOTE_PROVIDER=openai
DRAFT_REPLY_PROVIDER=openai
WHATSAPP_OCR_PROVIDER=openai
WHATSAPP_VOICE_PROVIDER=openai
WHATSAPP_FORWARD_PROVIDER=openai
```

### 1.3. Как это реализовано в коде

Создаётся новый shim `lib/ai-provider.ts` (один-единственный shared layer):

```typescript
// lib/ai-provider.ts
type Provider = "openai" | "gemini";

export function getProvider(scope: string): Provider {
  // Per-scope override → global → default openai
  return (
    (process.env[`${scope}_PROVIDER`] as Provider) ||
    (process.env.AI_PROVIDER as Provider) ||
    "openai"
  );
}

export function getModel(scope: string): string {
  const provider = getProvider(scope);
  if (provider === "openai") {
    return process.env[`${scope}_OPENAI_MODEL`] || process.env.AI_MODEL_HEAVY || "gpt-5.5";
  }
  return (
    process.env[`${scope}_GEMINI_MODEL`] ||
    process.env.AI_MODEL_GEMINI_DEFAULT ||
    "gemini-2.5-flash"
  );
}

export async function callAi<T>(scope: string, prompt: string, opts?: AiOpts): Promise<T> {
  const provider = getProvider(scope);
  if (provider === "openai") return callOpenAi(getModel(scope), prompt, opts);
  return callGemini(getModel(scope), prompt, opts);
}
```

Каждый endpoint вместо прямого `callAiJson(...)` (текущий путь через ClipProxy) использует `callAi('CLASSIFY', prompt, ...)` — и shim сам решает куда идти.

**Side-by-side mode** (для A/B):

```bash
SHADOW_MODE=true       # параллельно вызывает обе модели, отвечает основной, логирует обе
SHADOW_LOG_PATH=/var/log/quantika/shadow-ai.jsonl
```

В этом режиме можно собрать реальные данные о регрессии перед полным cutover.

---

## 2. Список спек (12 штук)

Все спеки используют `lib/ai-provider.ts` shim — никто не трогает прямые вызовы OpenAI без layer'а.

### Уровень 1: Прямая миграция (сохранить функциональность, снизить стоимость)

| ID        | Spec                                 | Файлы                                                                                    | Модель Gemini    | Effort                           | Rollback                                                     |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------ |
| **γv-01** | classify → Gemini Flash через shim   | `app/api/ai/classify/route.ts`, `lib/ai-provider.ts` (новый), `lib/openai.ts` (refactor) | gemini-2.5-flash | 0.5d                             | `CLASSIFY_PROVIDER=openai`                                   |
| **γv-02** | parse-cargo через shim               | `app/api/ai/parse-cargo/route.ts`                                                        | gemini-2.5-flash | 0.5d                             | `PARSE_CARGO_PROVIDER=openai`                                |
| **γv-03** | parse-vessel через shim              | `app/api/ai/parse-vessel/route.ts`                                                       | gemini-2.5-flash | 0.25d                            | `PARSE_VESSEL_PROVIDER=openai`                               |
| **γv-04** | parse-recap (Pro для CP-clauses)     | `app/api/ai/parse-recap/route.ts`                                                        | gemini-2.5-pro   | 0.5d                             | `PARSE_RECAP_PROVIDER=openai`                                |
| **γv-05** | draft-quote / draft-reply через shim | `app/api/ai/draft-quote/route.ts`, `app/api/ai/draft-reply/route.ts`                     | gemini-2.5-flash | 0.25d                            | `DRAFT_QUOTE_PROVIDER=openai`, `DRAFT_REPLY_PROVIDER=openai` |
| **γv-06** | match → Pro (с rollback на openai)   | `app/api/ai/match/route.ts`                                                              | gemini-2.5-pro   | 1d (включая регрессионные тесты) | `MATCH_PROVIDER=openai`                                      |

### Уровень 2: Quick win + Multimodal

| ID        | Spec                                                          | Файлы                                                                 | Модель                         | Effort                     | Rollback                                             |
| --------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ | -------------------------- | ---------------------------------------------------- |
| **γv-07** | recap: убрать `slice(0, 2000)`, использовать Pro 1M контекст  | `app/api/ai/recap/route.ts:63`                                        | gemini-2.5-pro                 | 0.25d (одна строка + тест) | `RECAP_PROVIDER=openai` (вернёт slice автоматически) |
| **γv-08** | WhatsApp voice → Gemini 2.0 Flash audio (нативный multimodal) | `lib/whatsapp/voice-transcribe.ts`, `lib/voice/whisper-transcribe.ts` | gemini-2.0-flash (audio input) | 0.5d                       | `WHATSAPP_VOICE_PROVIDER=openai` (вернёт Whisper)    |
| **γv-09** | Image OCR → Gemini Vision (multi-image в одном вызове)        | `lib/whatsapp/image-ocr.ts`, `app/api/whatsapp/ingest/route.ts`       | gemini-2.5-flash               | 1d                         | `WHATSAPP_OCR_PROVIDER=openai`                       |

### Уровень 3: Новые AI-фичи (RAG + embeddings + Imagen)

| ID        | Spec                                                      | Файлы                                                                                        | Сервис           | Effort | Rollback                                                       |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- | ------ | -------------------------------------------------------------- |
| **γv-10** | LLM-driven agent planner (заменить regex `detectKinds()`) | `lib/agent/plan-first.ts:85`                                                                 | gemini-2.5-flash | 1d     | `AGENT_PLANNER_PROVIDER=regex` (старый rule-based)             |
| **γv-11** | "Explain this deal" (wow-фича для Дубая)                  | новый endpoint `app/api/ai/explain-deal/route.ts`, кнопка на `app/match/[id]/page.tsx`       | gemini-2.5-pro   | 1.5d   | feature flag `EXPLAIN_DEAL_ENABLED=false` (UI скрывает кнопку) |
| **γv-12** | Imagen 4 — карта маршрута для demo                        | новый endpoint `app/api/ai/generate-route-map/route.ts`, кнопка на `app/match/[id]/page.tsx` | imagen-4         | 1d     | feature flag `ROUTE_MAP_ENABLED=false`                         |

### Stretch (после wave-γ, если бюджет токенов позволит):

| ID    | Spec                                                     | Effort |
| ----- | -------------------------------------------------------- | ------ |
| γv-13 | match с историей сделок брокера (1M контекст Gemini Pro) | 1d     |
| γv-14 | Semantic sanctions через text-embedding-005              | 1.5d   |
| γv-15 | Vertex AI Search над архивом сделок                      | 4d     |

---

## 3. Phased rollout (как мигрировать без сюрпризов)

### Phase 0: Foundation (не подлежит skipping, делается до всех остальных спек)

**γv-00 — `ai-provider-shim`** _(0.5 дня)_

- Создать `lib/ai-provider.ts` с функциями `getProvider/getModel/callAi/callAiJson/callAiText/callAiVision/callAiAudio`.
- Подключить `@google/genai` SDK (новый рекомендуемый Google'ом, не deprecated `@google-cloud/vertexai`).
- Env vars: `AI_PROVIDER`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT=quantika-demo-2026`, `GOOGLE_CLOUD_LOCATION=us-central1`.
- В `.env.local.example` добавить весь набор `*_PROVIDER` / `*_MODEL` env'ов с дефолтом `openai`.
- Создать `.env.gpt-fallback.example` (пресет для emergency rollback).
- Добавить unit test: `lib/__tests__/ai-provider.test.ts` — моки на оба провайдера, проверка что getProvider правильно роутит.
- **Не менять никакие endpoints в этой спеке** — только инфраструктура.

**Acceptance:** `npm test` зелёный, при `AI_PROVIDER=gemini` shim вызывает Gemini, при `AI_PROVIDER=openai` — текущий ClipProxy. Pre-existing endpoint'ы пока используют старый `callAiJson` (миграция в γv-01..γv-12).

### Phase 1: Shadow mode (параллельный запуск, 3-5 дней мониторинга)

После γv-00 включить `SHADOW_MODE=true` для одного endpoint (например, `parse-cargo`). В этом режиме:

- Основной ответ — от текущего OpenAI пути (как сейчас)
- Параллельно вызывается Gemini, его ответ логируется в `.shadow/parse-cargo.jsonl`
- Никакой regression risk: пользователь видит привычное

После 3-5 дней — анализ: `scripts/eval/compare-shadow.ts` сравнивает поля JSON output'а Gemini vs OpenAI, считает f1-score. Если ≥ 0.95 — переключаем endpoint на gemini-first. Если < 0.95 — анализируем расхождения, дотюниваем prompt.

### Phase 2: Per-endpoint cutover (1 endpoint в день)

Порядок (от меньшего риска к большему):

1. γv-07 (recap slice) — самая быстрая и безопасная
2. γv-05 (draft-quote/reply) — генерация текста, низкий риск
3. γv-03 (parse-vessel) — простая структура
4. γv-02 (parse-cargo) — критичный, но хорошо тестируемый через `scripts/eval/run-parser.ts`
5. γv-01 (classify) — частая операция, проверять на real corpus
6. γv-04 (parse-recap) — юридически значимый, через Pro
7. γv-09 (image OCR) — сейчас не работает по факту, любой результат лучше
8. γv-08 (voice) — отдельный multimodal путь
9. γv-10 (agent planner) — UX-апгрейд
10. γv-06 (match) — последний, наиболее сложный prompt
11. γv-11 (Explain this deal) — новая фича, не миграция
12. γv-12 (Imagen route map) — новая фича, не миграция

После каждого cutover — 24 часа наблюдения по логам / Sentry. Если регрессия — `<SCOPE>_PROVIDER=openai` мгновенный откат, расследуем без давления продакшена.

### Phase 3: Cleanup (после успешных 12 спек)

- Удалить `SHADOW_MODE` (если больше не используется)
- Сжать `.env.local.example` (убрать openai-only переменные если решили выбросить fallback)
- **НЕ трогать `lib/openai.ts`** — оставляем рабочий путь как safety net до конца действия GenAI кредита (апрель 2027)

---

## 4. Билинг и контроль расхода

### 4.1. Карта расходов на 12 месяцев

Базовая нагрузка после полной миграции на Gemini (1000 сессий/мес):

- Flash endpoints (8 шт.): ~$25/мес
- Pro endpoints (3 шт.: parse-recap, match, recap): ~$40/мес
- Imagen (если включено): $0.04/img × 200/мес = $8/мес
- Vertex Embeddings (sanctions stretch): ~$1/мес

**Итого:** ~$75/мес × 11 мес = **~$825** на основные операции.
Кредит: $900 (zł3,713). **Запас: $75 на эксперименты + новые фичи.**

### 4.2. Order of credit consumption

Google применяет более ранний по expiry кредит первым:

1. **Free Trial** (zł718, expires 8 июля 2026) — расходуется первым в 2 ближайших месяца
2. **GenAI App Builder** (zł3,713, expires 15 апреля 2027) — основной фонд для wave-γ
3. **Карта** — защищена budget alert на zł100/мес (50/90/100% триггеры)

### 4.3. Budget alert

Уже создан в Cloud Console:

- Name: "Quantika Demo budget alert"
- Scope: project=quantika-demo-2026
- Threshold: zł100/мес (после вычета кредитов)
- Alerts: 50% / 90% / 100% (Actual)
- Email: vitali6825621@gmail.com (billing admin)

**Если придёт письмо "you've reached 50%"** — это значит кредиты кончились и пошли реальные деньги. Немедленно: применить `.env.gpt-fallback.example` пресет, расследовать.

---

## 5. Тесты и регрессии

### 5.1. Per-spec acceptance test

Каждая γv-\* спека должна добавить:

1. Unit test с моком обоих провайдеров: один и тот же input → ожидаемая структура output (provider-agnostic)
2. Integration test через `npm run test:eval` на реальном corpus (не отправляет в LLM, использует кэш ответов из `.eval-fixtures/`)
3. Verify command: `npm run lint && npm test && npm run build` зелёный

### 5.2. Regression suite (после каждого cutover)

Скрипт `scripts/eval/regression-suite.ts`:

- Прогоняет 50 типичных сессий (sample-data) на двух провайдерах
- Сравнивает output по полям, считает f1-score
- Threshold: f1 ≥ 0.95 для парсинга, ≥ 0.90 для match-scoring, ≥ 0.85 для генерации текста (subjective)
- При падении ниже threshold — automated open: PR-блокер до ручного review

### 5.3. Cold-session adversarial QA

После каждой merge'нутой γv-\* спеки запустить `/test-skill` в новой сессии для adversarial проверки. Это закрывает класс багов "автор сам себе написал тест" — independent QA найдёт boundary inputs которые автор не учёл.

---

## 6. Что считается "Done" для wave-γ

- [ ] γv-00 (shim) merged, всё CI зелёное, оба провайдера работают
- [ ] γv-01..γv-12: все 12 спек смержены, в shadow mode хотя бы 7 дней
- [ ] Все per-spec rollback переменные документированы в README
- [ ] `.env.gpt-fallback.example` коммитится, проверен (`cp` → перезапуск → сервис работает на gpt-5.5)
- [ ] Regression suite на проде: f1 ≥ thresholds для всех endpoints
- [ ] Budget alert не сработал ни разу (= кредиты покрывают расходы)
- [ ] Adversarial QA report: 0 CRITICAL, ≤3 HIGH (с планом фиксов)
- [ ] Release notes для клиентов в Дубае: упомянуть Arabic voice transcribe, "Explain this deal", route map

---

## 7. Открытые вопросы и риски

**Risk 1: Gemini SDK deprecation.** `@google-cloud/vertexai` deprecated, надо использовать `@google/genai`. В γv-00 заложено сразу новый SDK.

**Risk 2: ClipProxy не нужен для Gemini.** Прямые вызовы к Vertex AI идут через service account, минуя ClipProxy. Это означает что мониторинг/логирование, которое ClipProxy предоставлял, нужно реплицировать. Решение: shim в `ai-provider.ts` логирует все вызовы (request/response/usage) в SQLite таблицу `ai_audit`.

**Risk 3: Rate limits Vertex AI.** Gemini 2.5 Flash: 1000-2000 RPM в зависимости от региона. При нагрузке 1000 сессий/день × 11 endpoints × 2 retries = 22k req/day = ~15 req/min. С запасом. Pro: квоты меньше, но не критично для текущего объёма.

**Risk 4: Streaming поведение.** Текущий код через ClipProxy использует streaming response (`callAiJson` парсит chunk'и). Gemini SDK поддерживает streaming, но семантика чуть другая (chunks по токенам, не по JSON-полям). В γv-00 в shim'е учесть, чтобы downstream код не сломался.

**Risk 5: Цены могут поменяться.** $0.30/$2.50 per 1M для Flash — состояние на май 2026. Если Google поднимет цены — пересчитать бюджет, но кредит фиксированный $900.

**Open: миграция на VPS.** Текущий деплой Quantika — `pm2` + `caddy`. Service account key должен попасть на сервер: `/root/.config/gcp/quantika-vertex-ai.json` (chmod 600, owner root). Это отдельная ops-задача после wave-γ-00, оформить как `γv-deploy-keys` в Wave γ-ops.

---

## 8. Связанные артефакты

- **Memory:** `~/claude/.claude/memory/project_quantika_demo_wave_betaf_3_2026_05_03.md` — состояние после wave-βf3
- **Аудит кода:** `~/.claude/projects/-Users-jarvis-claude/sessions/<this-session>/quantika-demo-llm-audit.md` — полный обзор 11 endpoints
- **GenAI credit research:** subagent transcripts от 2026-05-04 (включены в основную сессию)
- **Wave-pipeline скилл:** `~/.claude/skills/wave-pipeline/SKILL.md`
- **GCP setup log:** этот файл документирует, что было сделано в Cloud Console на 2026-05-04

---

**Версия:** 1.0 (2026-05-04, draft)
**Owner:** Vitali (founder), Claude (implementation lead)
**Готовность к старту:** требует merge γv-00 (shim) перед всеми остальными спеками.
