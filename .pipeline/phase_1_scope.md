# Phase 1 Scope — parse-cargo Stage 2 targeted prompt fix

## Assumptions (Karpathy #1)

Понимаю задачу как: добавить 2 правила в production prompt
`lib/prompts/parse-cargo.ts` для устранения двух чистых failure-кластеров
из Phase 3a analysis — laycan/Spot-inference и cargo/stowage-noise.
Альтернатива: переезд parse-cargo на Sonnet 4.6 через AI provider shim
(Stage 2 option 2) — стоит дороже и инвазивнее, оставляем как fallback.
Иду по targeted-prompt, потому что: failure pattern узкий (17/26 laycan +
5/23 cargo), config-леверы Gemini исчерпаны (responseSchema регрессирует),
1 файл, низкий риск регрессии остальных полей.

## Boundaries

### Can Change

- `lib/prompts/parse-cargo.ts`:
  - Секция `=== LAYCAN RULES ===` (строки 199–209) — переписать с inversion:
    null по умолчанию, Spot/Prompt только при literal substring.
  - Секция `=== CARGO DESCRIPTION RULES ===` (строки 130–160) — снять
    требования inline stowage / dimensions / weight; оставить только
    cargo name + grade + physical form (bulk/bagged/coils/HRC etc.).

### Cannot Change

- Schema / Zod-валидация cargo output (`lib/schemas/parse-cargo.ts`).
- AI provider shim (`lib/ai-provider.ts`) — frozen config: gemini-2.5-pro,
  us-central1, temp 0, seed 42, thinking off.
- Eval harness `scripts/progonq/run-parse-cargo.ts` + judge — не трогать
  (5-field scoring merged в PR #154).
- Test fixtures под parse-cargo (`lib/__tests__/etms-corpus-fixtures.ts`).

### Must Not Break

- ports / weight / commission accuracy: каждое ≥ baseline R21-A − 1pp
  (anti-regression gate).
- Schema совместимость: cargo_description остаётся string, laycan
  остаётся nullable string.

## Affected files

| Файл                       | Изменение           | Риск              |
| -------------------------- | ------------------- | ----------------- |
| lib/prompts/parse-cargo.ts | 2 секции переписаны | LOW (prompt-only) |

## Cross-cutting check

Файлов <5, скейл cross-cutting grep не нужен. PI3 не активен — unit-тесты
проверяют только schema/types, не assert'ят конкретные cargo_description
строки или Spot-значения laycan (confirmed: grep по lib/**tests** показал
только `stowageFactor: null` в fixtures).

## Acceptance gate (Phase 3 QI)

R22 baseline на VPS в tmux, 95 сценариев × 3 повтора, frozen config A
(см. handover). Сравнение medians с R21-A baseline:

- laycan ≥ 88% (R21-A=82.4%, R1 expectation +5pp) → REQUIRED
- cargo_description ≥ 85% (R21-A=83.0%, R2 expectation +2pp) → REQUIRED
- ports / weight / commission: каждое ≥ R21-A − 1pp → REQUIRED
- variance min-max ≤ 3pp по каждому полю → желательно

## Decision tree после gate

- R1+R2 PASS → preview report, ⛔ wait merge command
- Только R1 PASS → revert R2, оставить R1 (partial-merge)
- Оба FAIL → revert обоих, эскалировать в Stage 2 option 2 (Sonnet)

## Open questions

Нет.
