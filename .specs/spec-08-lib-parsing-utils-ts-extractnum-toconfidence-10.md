# Spec 08: `lib/parsing-utils.ts` — extractNum, toConfidence (10+ тестов)

> Batch: D5 | Complexity: small | Est: 20 min | Files: 5

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3), Tailwind CSS 3.4.19, shadcn 4.1.2, openai SDK 6.33.0, googleapis 171.4.0
- **Architecture:** Next.js App Router, in-memory sessions (lib/session.ts), PM2 + Caddy на VPS, без БД
- **Test command:** `jest --forceExit`
- **Lint command:** `next lint`

## Task Description

`toConfidence<T>()` продублирована в 3 route-файлах: `parse-cargo/route.ts:11`, `parse-vessel/route.ts:19`, `parse-recap/route.ts:13` — 11+ идентичных строк каждый раз (источник: audit-code-quality.md, HIGH).

`extractNum()` продублирована в `parse-vessel/route.ts:11` и `parse-recap/route.ts:12` — версия в parse-recap minified на одну строку и содержит subtle difference: не проверяет `isNaN(v)` для number-типа (источник: audit-code-quality.md, HIGH).

Оба хелпера вынести в `lib/parsing-utils.ts`, заменить все inline-копии на импорты. Также убрать debug `console.log` из `parse-recap/route.ts:102` (источник: audit-code-quality.md, HIGH).

Написать ≥10 тестов: ≥5 для `extractNum`, ≥5 для `toConfidence`.

## Dependencies

- Нет блокирующих зависимостей от других спек этого батча (spec-06, spec-07, spec-13 работают с непересекающимися файлами).
- `lib/types.ts` уже содержит `ConfidenceField<T>` и `ConfidenceLevel` — импортировать оттуда, не дублировать. [источник: research-shared-types.md]
- Если `jest.config.mjs` отсутствует на момент выполнения — создать минимальный конфиг с `ts-jest` и `moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }`. [ASSUMED: research-tech-stack.md подтверждает отсутствие jest.config.mjs; decomp-07.md упоминает необходимость проверки moduleNameMapper]

## Requirements

1. Создать `lib/parsing-utils.ts` с экспортами `extractNum(v: unknown): number | null` и `toConfidence<T>(field: unknown): ConfidenceField<T> | null`.
2. Каноническая реализация `extractNum` — версия из `parse-vessel/route.ts` (с проверкой `isNaN(v)` для number-типа): поддерживает `null`/`undefined` → `null`; `number` (с NaN guard) → `number | null`; `string` → `parseFloat` (NaN → `null`); объект с полем `value` → рекурсивный вызов; остальное → `null`.
3. `toConfidence<T>` — маппинг: `null`/falsy → `null`; объект с полем `value` → `{ value, confidence: field.confidence || 'confirmed', sourceText: field.source_text || undefined }`; примитив → `{ value: field as T, confidence: 'confirmed' }`.
4. Тип `ConfidenceField<T>` импортировать из `@/lib/types` (не определять заново).
5. Обновить `app/api/ai/parse-cargo/route.ts`: добавить `import { toConfidence } from '@/lib/parsing-utils'`, удалить inline-определение `toConfidence`.
6. Обновить `app/api/ai/parse-vessel/route.ts`: добавить `import { extractNum, toConfidence } from '@/lib/parsing-utils'`, удалить inline-определения обеих функций.
7. Обновить `app/api/ai/parse-recap/route.ts`: добавить `import { extractNum, toConfidence } from '@/lib/parsing-utils'`, удалить inline-определения обеих функций, удалить debug `console.log` на строке 102.
8. Создать `lib/__tests__/parsing-utils.test.ts` с ≥10 тестами (≥5 для `extractNum`, ≥5 для `toConfidence`).
9. Все существующие тесты (`lib/__tests__/currency.test.ts`) должны оставаться зелёными.
10. `next lint` проходит без новых ошибок после изменений.

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/parsing-utils.ts` | create | Новый модуль: `extractNum` и `toConfidence` |
| `lib/__tests__/parsing-utils.test.ts` | create | ≥10 тестов для обеих функций |
| `app/api/ai/parse-cargo/route.ts` | modify | Убрать inline `toConfidence`, добавить импорт из `@/lib/parsing-utils` |
| `app/api/ai/parse-vessel/route.ts` | modify | Убрать inline `extractNum` и `toConfidence`, добавить импорт |
| `app/api/ai/parse-recap/route.ts` | modify | Убрать inline `extractNum` и `toConfidence`, убрать debug `console.log:102`, добавить импорт |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `package.json` — управляется spec-06 (npm audit fix) и spec-13 (Sentry dep)
- `package-lock.json` — управляется spec-06
- `lib/session.ts` — управляется spec-07
- `lib/__tests__/session.test.ts` — управляется spec-07
- `app/api/session/route.ts` — управляется spec-07
- `next.config.mjs` — управляется spec-13 (withSentryConfig)
- `sentry.client.config.ts` — управляется spec-13
- `sentry.server.config.ts` — управляется spec-13
- `sentry.edge.config.ts` — управляется spec-13
- `instrumentation.ts` — управляется spec-13
- `.env.local.example` — управляется spec-13

## Acceptance Criteria

- [ ] `lib/parsing-utils.ts` создан и экспортирует `extractNum` и `toConfidence`
- [ ] В `parse-cargo/route.ts`, `parse-vessel/route.ts`, `parse-recap/route.ts` нет inline-определений этих функций (ноль дубликатов)
- [ ] Debug `console.log` удалён из `parse-recap/route.ts:102`
- [ ] `lib/__tests__/parsing-utils.test.ts` содержит ≥10 тестов (≥5 для `extractNum`, ≥5 для `toConfidence`)
- [ ] `jest --forceExit` проходит зелёным (все тесты, включая `currency.test.ts`)
- [ ] `next lint` без новых ошибок
- [ ] Покрытие `lib/parsing-utils.ts` ≥80% по строкам (% coverage, не абсолютные числа)

## Compat Constraints

- **TypeScript 5.9.3**: `strict: true`, `isolatedModules: true`, `moduleResolution: bundler` — не изменять tsconfig.
- **Next.js 14.x**: не апгрейдить до 15.x в рамках этой работы.
- **Jest 30.3.0 + ts-jest 29.4.9**: path alias `@/*` должен быть в `moduleNameMapper` конфига.
- **`ConfidenceField<T>`**: использовать из `lib/types.ts` — не переопределять тип в новом файле.
- **In-memory sessions**: `lib/session.ts` не затрагивается (управляется spec-07).

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-08-lib-parsing-utils-ts-extractnum-toconfidence-10`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
