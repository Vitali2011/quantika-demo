# Migrating Demo Parsers Gemini → Claude (our subscription) — Research

> **Date:** 2026-06-22
> **Question (founder):** Перевести парсеры с Gemini на нашу подписку Claude (через claude-cli), пока это демо. Какую модель, как правильно строить структуру (как делали под Gemini), как технически мигрировать.
> **Method:** internal recon (`docs/research/recon-claude-provider-wiring-2026-06-22.md`, our exact wiring) + deep-research over official Anthropic docs (verified against the local `claude-api` skill — model/structured-output facts confirmed; the web pass's "inconclusive" verdict was a rate-limit artifact, not a real refutation).

---

## TL;DR

1. **claude-cli уже работает для демо** — `scripts/demo-seed/seed-all.ts` форсит `AI_PROVIDER=claude-cli` для шага парсинга, и последний реген (02-06) так и гнался. **Переключать нечего на уровне кода — это уже наш путь по умолчанию для офлайн-сборки сида.** Live Next.js-хендлеры claude-cli использовать НЕЛЬЗЯ (guard) — но демо там и не парсит, отдаёт пресид.
2. **ГЛАВНЫЙ нюанс (структура вывода):** Gemini давал гарантированный JSON через `responseSchema`. **claude-cli этого НЕ умеет** — он возвращает текст, и мы чистим его `extractJson()` + `JSON.parse()` (хрупкий путь: риск CoT-преамбулы / `json`-обёртки). Настоящий аналог responseSchema есть только в **Anthropic API** (`output_config.format` constrained-decoding) — но это per-token биллинг, не подписка. **Для одноразовой офлайн-сборки 150 писем claude-cli + extractJson приемлем** (контролируем корпус, можем ретраить); для будущего ЖИВОГО ящика правильный путь — API с гарантированным JSON.
3. **Модель:** для одноразовой сборки сида cost тривиален → **Opus 4.8 на всё** (лучшая точность, особенно parse-recap — самый слабый). Тиринг (Haiku classify / Sonnet cargo-vessel / Opus recap) экономит копейки и важен только для live high-volume.

---

## 1. Наша архитектура (recon, file:line)

**Цепочка выбора провайдера** (`lib/ai-provider.ts:482`): `<SCOPE>_PROVIDER` → `AI_PROVIDER` → `openai`. Провайдеры: `openai | gemini | bedrock | claude-cli`.

**claude-cli вызов** (`callClaudeCliRaw`, `lib/ai-provider.ts:415`):

```bash
claude --print --model <model> --output-format json --max-budget-usd <budget> [--system-prompt <system>]
```

- Промпт — через stdin; auth — `CLAUDE_CODE_OAUTH_TOKEN` (CLI берёт сам); таймаут 85с; `spawnSync` (синхронный, блокирует event loop → отсюда guard).
- **Guard** (`lib/ai-provider.ts:421`): если `process.env.NEXT_RUNTIME` задан → `throw`. Срабатывает во ВСЕХ request-хендлерах. claude-cli легален только в скриптах (`scripts/demo-seed/`, `scripts/progonq/`, quote-worker).

**Как `callAiJson` делает JSON по провайдеру** (`lib/ai-provider.ts:962`):
| Провайдер | JSON | extractJson? |
|---|---|---|
| gemini | `responseSchema` → `responseMimeType:application/json` → чистый JSON | только без схемы |
| bedrock | Sonnet 4.6 даёт CoT-преамбулу → **всегда** extractJson | always |
| **claude-cli** | возвращает `.result` текст; **responseSchema ИГНОРИРУЕТСЯ** → **всегда** extractJson | always |

**Демо собирается офлайн** (`scripts/demo-seed/seed-all.ts`): шаг 1 `parse-llm-direct.ts` со `spawnSync env: AI_PROVIDER=claude-cli`, дефолт `--model claude-opus-4-8`, budget `5.0` USD (большие промпты ~32-35KB). LLM-кэш (`llm-cache.ts`) ключ = SHA-256 raw-писем; `build.ts` читает кэш, LLM не зовёт. **Это уже claude-cli-путь.**

> Мелкий тех-долг: `getModel('claude-cli')` хардкодит `claude-opus-4-7` (`lib/ai-provider.ts`), а `parse-llm-direct.ts` дефолтит `claude-opus-4-8`. Привести к 4-8.

---

## 2. Выбор модели (факты из официальных доков, сверено с claude-api)

| Модель       | ID                  | Контекст | $/1M вход | $/1M выход | Роль                                   |
| ------------ | ------------------- | -------- | --------- | ---------- | -------------------------------------- |
| Haiku 4.5    | `claude-haiku-4-5`  | 200K     | $1        | $5         | простое: классификация                 |
| Sonnet 4.6   | `claude-sonnet-4-6` | 1M       | $3        | $15        | прод-workload, извлечение cargo/vessel |
| **Opus 4.8** | `claude-opus-4-8`   | 1M       | $5        | $25        | сложное: recap, наш дефолт             |
| Fable 5      | `claude-fable-5`    | 1M       | $10       | $50        | предельная сложность (не нужно)        |

**Официальный гайд Anthropic:** Haiku — простые задачи, Sonnet — большинство прод-нагрузок, Opus — самое сложное. Batch API даёт −50% (но это API-путь, не CLI).

**Рекомендация под НАШ кейс (одноразовая офлайн-сборка ~150 писем):**

- **Opus 4.8 на все парсеры** — при бюджете $5 на прогон стоимость копеечная, а точность максимальна. parse-recap (12-сценарный корпус, FD-дизамбигуация, евро-десятичные, multi-port) — самый слабый, ему нужен топ.
- Тиринг (Haiku→classify, Sonnet→cargo/vessel, Opus→recap) уместен **только для live high-volume** через API, где per-token-цена реально кусается. Для демо — не усложнять.

---

## 3. Структурированный вывод — «как строить структуру» (аналог Gemini responseSchema)

Это сердце вопроса. Под Gemini мы гарантировали JSON схемой. На Claude — три уровня, по убыванию надёжности:

| Способ                                                               | Гарантия                              | Доступно через                    |
| -------------------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| **`output_config.format` (json_schema, constrained decoding)**       | ✅ всегда валидный JSON по схеме      | **только Anthropic API** (не CLI) |
| **forced tool use** `tool_choice:{type:"tool",name}` + `strict:true` | ✅ инпут тула по схеме, без преамбулы | только API                        |
| **prompt + extractJson + retry**                                     | ⚠️ best-effort, чистим текст          | **claude-cli** (наш демо-путь)    |

**Критично:**

- **Prefill УБРАН на 4.6+** (Opus 4.8/Sonnet 4.6/Haiku 4.5/Fable 5) — старый трюк «префиллим `{`» даёт **400**. Замена — `output_config.format` или инструкция в system-промпте.
- На claude-cli (демо) `output_config.format` недоступен → опираемся на: (а) явную инструкцию «верни ТОЛЬКО JSON, без преамбулы и без ```», (б) `extractJson()`(уже в коде,`lib/ai-provider.ts:270`), (в) ретрай при `JSON.parse` fail. Наши схемы (`ConfidenceField {value,confidence,source_text}`, вложенные `items[]`) описываем словами в промпте + один few-shot пример правильного JSON.
- Если/когда переведём ЖИВОЙ приём на API — там `messages.parse()` + `output_config.format` с нашими JSON-схемами = гарантия, и можно выкинуть extractJson для Claude (как для Gemini выкидывали при responseSchema).

---

## 4. Промпт-структура Claude vs Gemini — что переносится, что переписать

Официальные best-practices Claude для extraction:

1. **XML-теги для структуры** — Claude обучен на них; оборачивать входные данные и секции: `<email>…</email>`, `<instructions>…</instructions>`, несколько документов — вложенно `<documents><document index="1">…`. Gemini-промпты с markdown-заголовками переписать на XML-теги.
2. **Длинные данные — наверх промпта**, запрос/инструкции/примеры — ПОСЛЕ (до +30% качества на сложных входах). У нас тело письма большое → класть его в начало, инструкции extraction — в конец.
3. **Grounding-in-quotes** — для извлечения просить сперва вынести релевантные цитаты в `<quotes>`, потом извлекать. Режет шум форвардов/подписей (наш FM-09 outer-signature, FM-15 attachment-only).
4. **System-промпт** — роль и правила в system, данные — в user-turn.
5. **Few-shot примеры** — на claude-cli особенно важны (нет схемы-гаранта): 1-2 примера «вход → правильный JSON» с нашей формой `items[]` и ConfidenceField.
6. **Против тихих потерь (multi-item / multi-vessel circulars — FM-06/FM-14):** явная инструкция «верни МАССИВ `items[]`, по одному объекту на КАЖДЫЙ груз/судно; если в письме 8 — верни 8, не первый». Claude хорошо следует точным инструкциям.
7. **Не агрессивничать** — на 4.x убрать `CRITICAL: YOU MUST` (переусердствует); писать спокойно «извлеки …, если поля нет — null».

Что переносится без изменений из Gemini-промптов: сам доменный смысл полей, термины фрахта, правила нормализации (евро-десятичная, FD=Free Despatch и т.п.) — переписать надо только **обёртку структуры** (markdown→XML) и **способ гарантии JSON** (responseSchema→prompt+extractJson на CLI / output_config.format на API).

---

## 5. claude-cli headless из build-скрипта (мы это уже делаем)

- Вызов: `claude --print --model claude-opus-4-8 --output-format json --max-budget-usd 5.0` (см. `callClaudeCliRaw`). Промпт в stdin. Ответ — JSON-обёртка, берём `.result`, чистим `extractJson`.
- **Auth = подписка через `CLAUDE_CODE_OAUTH_TOKEN`** (CLI подхватывает из env). Это и есть «через нашу подписку, не per-token API».
- **Бюджет:** дефолтный $0.05 мал для наших ~32KB промптов → `CLAUDE_CLI_MAX_BUDGET_USD=5.0` (parse-llm-direct уже ставит).
- **Под root НЕЛЬЗЯ `--dangerously-skip-permissions`** (Claude Code security → сессия умирает) — у нас на VPS `defaultMode:auto` в settings, флаг не нужен.
- **Надёжность на 150 письмах:** synchronous `spawnSync`, по письму; rate-limit подписки реальный → гнать последовательно (не фанить параллельно), кэш (`llm-cache.ts`) спасает от повторных вызовов при повторном прогоне.

Команда боевого прогона (уже поддерживается):

```bash
AI_PROVIDER=claude-cli CLAUDE_CLI_MAX_BUDGET_USD=5.0 \
  npx tsx scripts/demo-seed/seed-all.ts --frozen-date 2026-06-22 --model claude-opus-4-8
```

---

## 6. Что конкретно делать (миграция)

**Демо-сид на нашу подписку — почти done, нужно лишь:**

1. Убедиться, что `CLAUDE_CODE_OAUTH_TOKEN` валиден на машине сборки (recon: CLI берёт сам).
2. Запустить `seed-all.ts` с `AI_PROVIDER=claude-cli` (форсится автоматически) → парсеры пойдут через Claude-подписку. Сравнить вывод с текущим Gemini-сидом (VALUE_CHECK).
3. (Опц., качество) Переписать обёртку extraction-промптов под §4 (XML-теги, данные-наверх, grounding-quotes, явный `items[]`-массив, few-shot JSON) — это лечит часть тихих провалов из parser-аудита.
4. Привести `getModel('claude-cli')` 4-7 → 4-8.

**Когда/если переведём ЖИВОЙ приём (live inbox) на Claude:** это API-путь (claude-cli в хендлерах запрещён) — `output_config.format`/`messages.parse()` с нашими JSON-схемами = гарантированный JSON, тиринг моделей по объёму, Batch API −50%. Отдельная задача, не демо.

---

_Источники: internal recon 2026-06-22 + deep-research over docs.anthropic.com/docs.claude.com (verified vs local claude-api skill). claude-cli viable для офлайн-сборки демо; live-хендлеры — только API._
