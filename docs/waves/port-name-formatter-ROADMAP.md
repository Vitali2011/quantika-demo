# ROADMAP — Port name formatter utility

## User Story

Freight broker видит в dashboard порт как "ROTTERDAM" (caps lock) или
"  antwerp  " (с пробелами). Нужна утилита которая нормализует названия
портов для единообразного отображения в UI.

## Deliverables

### 1. Utility function `formatPortName`

Файл: `lib/utils/format-port-name.ts`

Экспортируемая функция: `formatPortName(raw: string | null | undefined): string`

Логика:
- Capitalize first letter of each word (Title Case)
- Trim leading/trailing whitespace
- Collapse multiple internal spaces to single space
- Handle empty string → return empty string
- Handle undefined/null → return empty string
- Preserve parenthetical suffixes: "HAMBURG (ELBE)" → "Hamburg (Elbe)"

### 2. Unit tests

Файл: `lib/utils/__tests__/format-port-name.test.ts`

Test cases:
- `"ROTTERDAM"` → `"Rotterdam"`
- `"  antwerp  "` → `"Antwerp"`
- `"new york"` → `"New York"`
- `"HAMBURG (ELBE)"` → `"Hamburg (Elbe)"`
- `"  port   said  "` → `"Port Said"` (collapse spaces)
- `""` → `""`
- `null` → `""`
- `undefined` → `""`

## Acceptance Criteria

```
RUN: npm test -- --testPathPattern format-port-name
RUN: npm run lint
FILE: lib/utils/format-port-name.ts EXISTS
FILE: lib/utils/__tests__/format-port-name.test.ts EXISTS
```

## Verify Commands

```bash
npm test -- --testPathPattern format-port-name
npm run lint
npm run build
```
