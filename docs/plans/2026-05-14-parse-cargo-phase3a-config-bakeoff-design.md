# Parse-Cargo Phase 3a — Config Bakeoff (Фундамент + Этап 1)

**Дата:** 2026-05-14
**Ветка:** `feat/parse-cargo-phase3a-config-bakeoff`
**Предшественник:** Phase 1.6 (PR #145, merge `15a572c`) — честный eval harness + ре-аудит корпуса, baseline Gemini 2.5 Pro = 82 string / 87 semantic (ports-only).

## Контекст и две находки, переопределившие Phase 3

Phase 1.6 сделала eval harness и корпус-эталон достоверными. Промт-тюнинг доказанно исчерпан (Checkpoint 2 = −3 на честной линейке). Исходный план Phase 3 был «bakeoff Gemini vs Sonnet». Brainstorming вскрыл две вещи, которые меняют постановку:

### Находка 1 — eval скорит ТОЛЬКО порты

`route_match` (string-счёт) и judge (semantic-счёт) оценивают исключительно origin/destination порты + ротации + альтернативы. `weight_mt`, `cargo_description`, `cargo_type`, `laycan`, `commission_percent`, `stowage_factor`, ставки и ещё ~25 полей на груз — **не оцениваются вообще** (`weight_match` вычисляется, но в итог не идёт). Модель может извлечь все веса и даты неверно и всё равно получить 82/87. Для сравнения моделей это бесполезно — основная часть вывода не измеряется.

### Находка 2 — настройки модели не тронуты

Eval гоняет Gemini 2.5 Pro с `temperature: 0, seed: 42, maxTokens: 16000` и больше ничем. Не используются:

- **`thinkingBudget`** — режим рассуждения. Gemini 2.5 Pro — reasoning-модель, но eval гоняет её в обычном режиме. `thinkingBudget: -1` = динамический («deeper = better on hard reasoning», ×2-3 цена). Парсинг грязных брокерских писем — reasoning-задача.
- **`responseSchema`** — структурированный вывод. Гарантирует валидный JSON по схеме. Используй eval его — бага `extractItems` (голый массив) не случилось бы.

«Промт исчерпан» относилось к тексту промта. Настройки модели — нетронутый пласт.

## Подход: воронка

Менять модель на более дорогую, не включив у текущей режим рассуждения — преждевременно. Тестируем дёшево→дорого, с гейтами:

```
ФУНДАМЕНТ — расширить scorer на ключевые поля (нужен всем экспериментам)
ЭТАП 1 — рычаги конфигурации Gemini (4 конфига × 3 прогона)
  ГЕЙТ → ЭТАП 2 — Sonnet и/или архитектура (дизайнится ОТДЕЛЬНО, после результатов)
```

Phase 3a покрывает Фундамент + Этап 1. Этап 2 (Sonnet, гибрид правила+LLM, двухступенчатый LLM, упрощение вывода) — кандидаты, дизайн после Этапа 1.

## Фундамент — расширенный scorer

Ключевые поля для скоринга: **порты (уже есть) + weight_mt + cargo_description + laycan + commission_percent**. Сохраняем двухфазный паттерн eval'а (runner пишет сырьё → judge скорит отдельным проходом — дёшево итерировать скоринг без перепрогона моделей).

### Числовые поля — новый модуль `scripts/progonq/score-fields.ts`

Чистые тестируемые функции (TDD, полное unit-покрытие):

- `weight_mt` — точное сравнение `.value` (число транскрибируется, не вычисляется → допуск не нужен). Опционально min/max.
- `commission_percent` — точное сравнение `.value`.
- `null` с обеих сторон = match; `null` с одной = mismatch.

### Runner пишет сырьё для всех 5 полей

`run-parse-cargo.ts` уже пишет raw порты в `item_matches`. Добавляем raw `ref`/`model` для weight_mt, cargo_description, laycan, commission_percent. Числовые скорятся инлайн (детерминированно), текстовые — записываются для judge.

### Judge расширяется — field-specific рубрики

Сейчас judge только про порты. Добавляем:

- **`cargo_description`** — «описывают ли строки один и тот же груз?» Фокус на коммодити + ключевые атрибуты, игнор формулировки.
- **`laycan`** — эквивалентность диапазона дат («09/13 February 2026» = «9-13 Feb 2026»). С date-awareness — детерминированный нормализатор не справится с «spot prompt», «first half of May».

Judge-кэш (keyed by content hash) расширяется на новые типы пар.

### Агрегация — per-field breakdown

Judge выдаёт таблицу: точность по каждому из 5 полей отдельно + общая. Per-field картина нужна для решения «какая конфигурация лучше».

## Этап 1 — конфиги Gemini

### Изменения в eval-скрипте

`run-parse-cargo.ts` зашивает `model: process.env.PARSE_CARGO_GEMINI_MODEL`, не передаёт thinking/schema. Добавить:

- чтение `PARSE_CARGO_THINKING_BUDGET` (если задан → передаём в `callAiText`)
- чтение `PARSE_CARGO_USE_SCHEMA` (флаг → передаём `responseSchema`)
- каждый конфиг = набор env + свой round-тег. Остальное окружение заморожено.

### Артефакт responseSchema

JSON-схема структуры вывода parse-cargo (массив items, ConfidenceField-обёртки). Файл `lib/prompts/parse-cargo-schema.ts`. Структура глубокая (~30 полей) — реальный кусок работы. Риск, закладываемый в проверку: строгая схема иногда ухудшает качество (модель тратит «усилие» на формат) или плохо дружит с thinking — поэтому конфиги C и D тестируем отдельно.

### Матрица конфигураций

| Конфиг      | thinkingBudget      | responseSchema |
| ----------- | ------------------- | -------------- |
| A baseline  | —                   | —              |
| B +thinking | `-1` (динамический) | —              |
| C +schema   | —                   | да             |
| D +оба      | `-1`                | да             |

### Протокол 3 прогонов

Каждый конфиг — 3 прогона, медиана. Итого 4 × 3 = 12 прогонов (~5-6 ч VPS-времени в tmux, judge в основном из кэша). R17-retro показал: по одному прогону Gemini решать нельзя (±7-8 шум). Внутренняя экономия: сначала A+B (3+3); C+D — понимая сигнал от thinking.

### Что Этап 1 выдаёт

Таблица «конфиг × точность по полям» (медианы 3 прогонов + min/max как мера шума).

## Гейты и decision tree

### Гейт после Фундамента

Scorer должен быть достоверным до экспериментов:

- `score-fields.ts` unit-тесты зелёные.
- Judge-рубрики — smoke на 5-10 парах вручную.
- baseline (конфиг A) один прогон, глазами проверить 3-5 сценариев: per-field числа правдоподобны?

### Гейт после Этапа 1

Каждый конфиг — проверка на регрессию по полям (как RULE 10 в Phase 1.6: что-то чинит, что-то ломает). thinking мог поднять порты, просадить laycan — per-field таблица ловит.

### Decision tree → Этап 2

| Результат Этапа 1                              | Вывод                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Конфиг Gemini даёт явный прирост без регрессий | Шипим этот конфиг (решение по цене thinking — отдельно). Phase 3 может закрыться здесь. |
| Конфиги дают мало                              | Известен потолок настроек → Этап 2: Sonnet или архитектура, дизайн с этим знанием.      |
| Конфиги не помогают / только ломают            | Рычаги настроек исчерпаны → Этап 2 обязателен (архитектура/модель).                     |

## Зафиксированное окружение

| Параметр           | Значение                                   |
| ------------------ | ------------------------------------------ |
| Модель             | `gemini-2.5-pro` (чистый алиас, НЕ `-002`) |
| Регион             | `us-central1`                              |
| Судья              | `claude-sonnet-4-6` через Bedrock          |
| temperature / seed | 0 / 42                                     |
| maxTokens          | 16000                                      |

Этап 1 сознательно варьирует ТОЛЬКО `thinkingBudget` и `responseSchema`. Всё остальное заморожено — иначе конфиги несравнимы.

## Артефакты Phase 3a

- Этот design-doc + implementation plan (`docs/plans/2026-05-14-parse-cargo-phase3a.md`)
- `scripts/progonq/score-fields.ts` (новый модуль + unit-тесты)
- Правки `scripts/progonq/run-parse-cargo.ts` (raw-поля, thinking/schema env)
- Правки `scripts/progonq/judge-parse-cargo.ts` (field-specific рубрики, per-field агрегация)
- `lib/prompts/parse-cargo-schema.ts` (JSON-схема)
- Результаты 12 прогонов + per-field таблица (дописать в этот doc)
- Обновление memory
- **НЕ мержим в прод автоматически** — Этап 1 это измерительный эксперимент; смена прод-конфига (особенно thinking, ×2-3 цена) — отдельное решение по результатам.

## Foundation gate (Task 4 — 2026-05-15)

Baseline прогон конфига A (no thinking, no schema) для проверки расширенного scorer'а ДО запуска 12-run bakeoff.

**Команда:** `npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R21-gate` + `judge-parse-cargo.ts`.

**Per-field результат (95 сценариев → 148 item-пар):**

| Field             | Match/Total | Accuracy |
| ----------------- | ----------- | -------- |
| ports             | 141/148     | 95.3%    |
| weight            | 139/148     | 93.9%    |
| cargo_description | 125/148     | 84.5%    |
| laycan            | 122/148     | 82.4%    |
| commission        | 145/148     | 98.0%    |

**Backward-compat метрики:** string_full 82/95 (86.3%), semantic_full 89/95 (93.7%).

### Что выловил гейт

**Bedrock rate-limit:** первая попытка прогона вернула 85 "Too many requests" ошибок от Sonnet 4.6 (judge). Все 85 закэшировались как `{equiv: false, reason: 'judge parse error'}` → laycan ложно скатилось до 42.6%. Это ровно тот класс артефакта, ради которого был задуман гейт.

**Фикс (commit d8ec068):**

- `judgePair`: retry до 4 попыток с backoff 5/10/15s при `Too many requests | throttl | rate.?limit | 429`.
- Не кэшировать verdicts с `reason` начинающимся на `judge parse error` — иначе artifact-fail на одной попытке заражает все следующие прогоны через кеш.
- Очищен старый кеш от 85 artifact verdicts (174 валидных остались).

После фикса: 85 fails → **2 fails**, числа стабилизировались.

### Eyeball verdicts (sane?)

Cargo_description:

- "Storage Tanks, 10x VT + 4x GMMOS..." ≈ "Storage Tanks, consisting of 10 VT + 4 GMMOS..." → eq=true ✓
- "HRC, max 20 metric tons per piece" ≈ "HRC with maximum unit weight of 20 tonnes" → eq=true ✓
- "Cement in sling" ≈ "Cement in sling bags" → eq=true ✓ (рубрика игнорирует packaging-уровневые детали)

Laycan:

- "15/20 June" = "15-20 June 2026" → eq=true ✓ (формат, не значение)
- "June 2019" ≠ "June 2026" → eq=false ✓
- "End June 2019" ≠ "Early June 2019" → eq=false ✓ (разные части месяца)

**GATE: PASS.** Scorer trustworthy для 12-run bakeoff (Tasks 5-7).
